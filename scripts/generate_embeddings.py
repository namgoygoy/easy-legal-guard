#!/usr/bin/env python3
"""
standard_clauses.jsonl → Gemini Embedding → D1 SQL + Vectorize NDJSON

사용법:
  export GEMINI_API_KEY=""
  pip install -r scripts/requirements.txt
  python scripts/generate_embeddings.py

  # MVP 소코퍼스 (≈2,500건)
  python scripts/create_small_corpus.py
  python scripts/generate_embeddings.py \\
    --input data/processed/standard_clauses_small.jsonl \\
    --output data/processed/upload_small

  # 테스트 (10건만)
  python scripts/generate_embeddings.py --limit 10

  # 이어하기 (중단 후 재실행)
  python scripts/generate_embeddings.py --resume

업로드:
  wrangler d1 execute contract-db --remote --file=scripts/migrations/001_standard_clauses.sql
  wrangler d1 execute contract-db --remote --file=data/processed/upload/inserts/inserts_0001.sql
  wrangler vectorize insert contract-index --file=data/processed/upload/vectors/vectors_0001.ndjson
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import time
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_INPUT = ROOT / "data" / "processed" / "standard_clauses.jsonl"
DEFAULT_OUTPUT = ROOT / "data" / "processed" / "upload"
MIGRATION = Path(__file__).resolve().parent / "migrations" / "001_standard_clauses.sql"

EMBEDDING_MODEL = "gemini-embedding-2"
# gemini-embedding-2 기본 출력은 3072차원. Vectorize contract-index(768)와 맞추려면 아래 값 유지.
EMBEDDING_DIM = 768
OUTPUT_DIMENSIONALITY = 768
# gemini-embedding-2는 contents에 str[]를 넘기면 벡터 1개만 반환하는 경우가 있어 건별 호출 권장
EMBED_ONE_REQUEST_PER_TEXT = True
BATCH_SIZE = 100
# D1 SQLITE_TOOBIG 방지: 파일당 개별 INSERT 문 개수 (조항 본문이 길어 500행 bulk INSERT 불가)
ROWS_PER_SQL_FILE = 15
ROWS_PER_NDJSON_FILE = 500


def sql_str(value: str | None) -> str:
    if value is None:
        return "NULL"
    return "'" + str(value).replace("'", "''") + "'"


def sql_int(value: int | None) -> str:
    if value is None:
        return "NULL"
    return str(int(value))


def make_row_id(item: dict[str, Any]) -> str:
    """D1·Vectorize 공통 고유 ID (재실행 시 동일)."""
    key = "|".join(
        [
            item.get("source_zip") or "",
            item.get("source_file") or "",
            str(item.get("article_no")),
            item.get("document_name") or "",
            (item.get("content") or "")[:200],
        ]
    )
    return hashlib.sha256(key.encode("utf-8")).hexdigest()[:24]


def embedding_text(item: dict[str, Any]) -> str:
    """검색 품질을 위해 라벨·유형·본문을 함께 임베딩."""
    labels = ", ".join(item.get("labels") or [])
    parts = [
        f"계약유형: {item.get('contract_type', '')}",
        f"서비스분류: {item.get('service_type_label', '')}",
    ]
    if labels:
        parts.append(f"조항라벨: {labels}")
    if item.get("article_no") is not None:
        parts.append(f"제{item['article_no']}조")
    parts.append(item.get("content") or "")
    return "\n".join(parts)


def vectorize_metadata(item: dict[str, Any], row_id: str) -> dict[str, str | int | float]:
    labels = item.get("labels") or []
    return {
        "id": row_id,
        "service_type_id": item.get("service_type_id") or "etc",
        "contract_type": (item.get("contract_type") or "")[:120],
        "article_no": item.get("article_no") if item.get("article_no") is not None else -1,
        "labels": ",".join(labels)[:500],
        "split": item.get("split") or "Unknown",
    }


def row_to_sql_values(row_id: str, item: dict[str, Any]) -> str:
    labels_json = json.dumps(item.get("labels") or [], ensure_ascii=False)
    return (
        f"({sql_str(row_id)}, "
        f"{sql_str(item.get('contract_type'))}, "
        f"{sql_str(item.get('main_category'))}, "
        f"{sql_str(item.get('sub_category'))}, "
        f"{sql_str(item.get('detail_category'))}, "
        f"{sql_int(item.get('article_no'))}, "
        f"{sql_str(labels_json)}, "
        f"{sql_str(item.get('content'))}, "
        f"{sql_str(item.get('service_type_id'))}, "
        f"{sql_str(item.get('service_type_label'))}, "
        f"{sql_str(item.get('document_name'))}, "
        f"{sql_str(item.get('source_zip'))}, "
        f"{sql_str(item.get('source_file'))}, "
        f"{sql_str(item.get('split'))})"
    )


class BatchWriter:
    def __init__(self, output_dir: Path, sql_rows_per_file: int, vec_rows_per_file: int) -> None:
        self.inserts_dir = output_dir / "inserts"
        self.vectors_dir = output_dir / "vectors"
        self.inserts_dir.mkdir(parents=True, exist_ok=True)
        self.vectors_dir.mkdir(parents=True, exist_ok=True)
        self.sql_rows_per_file = sql_rows_per_file
        self.vec_rows_per_file = vec_rows_per_file
        self._sql_buffer: list[str] = []
        self._vec_buffer: list[str] = []
        self._sql_file_idx = 1
        self._vec_file_idx = 1
        self.sql_files: list[Path] = []
        self.vec_files: list[Path] = []

    def _flush_sql(self) -> None:
        if not self._sql_buffer:
            return
        path = self.inserts_dir / f"inserts_{self._sql_file_idx:04d}.sql"
        cols = (
            "(id, contract_type, main_category, sub_category, detail_category, "
            "article_no, labels, content, service_type_id, service_type_label, "
            "document_name, source_zip, source_file, split)"
        )
        statements = [
            f"INSERT INTO standard_clauses {cols} VALUES {values};"
            for values in self._sql_buffer
        ]
        path.write_text("\n".join(statements) + "\n", encoding="utf-8")
        self.sql_files.append(path)
        self._sql_buffer = []
        self._sql_file_idx += 1

    def _flush_vec(self) -> None:
        if not self._vec_buffer:
            return
        path = self.vectors_dir / f"vectors_{self._vec_file_idx:04d}.ndjson"
        path.write_text("".join(self._vec_buffer), encoding="utf-8")
        self.vec_files.append(path)
        self._vec_buffer = []
        self._vec_file_idx += 1

    def add(self, row_id: str, item: dict[str, Any], embedding: list[float]) -> None:
        self._sql_buffer.append(row_to_sql_values(row_id, item))
        if len(self._sql_buffer) >= self.sql_rows_per_file:
            self._flush_sql()

        vec_row = {
            "id": row_id,
            "values": embedding,
            "metadata": vectorize_metadata(item, row_id),
        }
        self._vec_buffer.append(json.dumps(vec_row, ensure_ascii=False) + "\n")
        if len(self._vec_buffer) >= self.vec_rows_per_file:
            self._flush_vec()

    def close(self) -> None:
        self._flush_sql()
        self._flush_vec()


def load_checkpoint(path: Path) -> set[str]:
    if not path.exists():
        return set()
    data = json.loads(path.read_text(encoding="utf-8"))
    return set(data.get("completed_ids") or [])


def load_api_key() -> str | None:
    key = os.environ.get("GEMINI_API_KEY")
    if key:
        return key.strip()
    env_path = ROOT / ".env"
    if env_path.exists():
        for line in env_path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if line.startswith("GEMINI_API_KEY="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    return None


def _embed_config() -> dict[str, Any]:
    cfg: dict[str, Any] = {"task_type": "RETRIEVAL_DOCUMENT"}
    if OUTPUT_DIMENSIONALITY is not None:
        cfg["output_dimensionality"] = OUTPUT_DIMENSIONALITY
    return cfg


def _validate_vector(vec: list[float]) -> list[float]:
    if len(vec) != EMBEDDING_DIM:
        raise ValueError(
            f"차원 불일치: {len(vec)} (예상 {EMBEDDING_DIM}). "
            "Vectorize 인덱스 dimensions를 확인하세요."
        )
    return vec


def embed_one(client: Any, text: str) -> list[float]:
    result = client.models.embed_content(
        model=EMBEDDING_MODEL,
        contents=text,
        config=_embed_config(),
    )
    if not result.embeddings:
        raise ValueError("embeddings 필드가 비어 있습니다.")
    return _validate_vector(list(result.embeddings[0].values))


def embed_batch(client: Any, texts: list[str], retries: int = 3) -> list[list[float]]:
    """텍스트 목록 → 임베딩 벡터 목록 (gemini-embedding-2는 건별 호출)."""
    if not texts:
        return []

    if not EMBED_ONE_REQUEST_PER_TEXT:
        last_err: Exception | None = None
        for attempt in range(retries):
            try:
                result = client.models.embed_content(
                    model=EMBEDDING_MODEL,
                    contents=texts,
                    config=_embed_config(),
                )
                if not result.embeddings:
                    raise ValueError("embeddings 필드가 비어 있습니다.")
                embeddings = [list(e.values) for e in result.embeddings]
                if len(embeddings) != len(texts):
                    raise ValueError(f"임베딩 수({len(embeddings)}) ≠ 텍스트 수({len(texts)})")
                return [_validate_vector(v) for v in embeddings]
            except Exception as e:
                last_err = e
                time.sleep(2**attempt)
        raise RuntimeError(f"임베딩 배치 실패: {last_err}") from last_err

    embeddings: list[list[float]] = []
    for text in texts:
        last_err: Exception | None = None
        for attempt in range(retries):
            try:
                embeddings.append(embed_one(client, text))
                break
            except Exception as e:
                last_err = e
                wait = 2**attempt
                print(f"  ⚠️ 임베딩 재시도 {attempt + 1}/{retries} ({wait}s): {e}")
                time.sleep(wait)
        else:
            raise RuntimeError(f"임베딩 실패: {last_err}") from last_err
    return embeddings


def save_checkpoint(path: Path, completed: set[str], stats: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "completed_ids": sorted(completed),
        "completed_count": len(completed),
        **stats,
    }
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def configure_gemini(api_key: str) -> Any:
    try:
        from google import genai
    except ImportError as e:
        raise SystemExit(
            "google-genai 패키지가 필요합니다.\n"
            "  pip install -r scripts/requirements.txt"
        ) from e

    return genai.Client(
        api_key=api_key,
        http_options={"api_version": "v1beta"},
    )


def iter_jsonl(path: Path, limit: int | None) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with path.open(encoding="utf-8") as f:
        for i, line in enumerate(f):
            if limit is not None and i >= limit:
                break
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    return rows


def copy_migration(output_dir: Path) -> Path:
    dest = output_dir / "001_standard_clauses.sql"
    dest.write_text(MIGRATION.read_text(encoding="utf-8"), encoding="utf-8")
    return dest


def write_upload_readme(output_dir: Path, stats: dict[str, Any]) -> None:
    readme = output_dir / "UPLOAD.md"
    readme.write_text(
        f"""# D1 · Vectorize 업로드 가이드

생성 통계: {json.dumps(stats, ensure_ascii=False, indent=2)}

## 1. 스키마 적용 (최초 1회)

```bash
wrangler d1 execute contract-db --remote --file=data/processed/upload/001_standard_clauses.sql
```

## 2. D1 데이터 INSERT

조항 본문이 길어 **파일당 15행** 단위 INSERT입니다. `SQLITE_TOOBIG` 시 `generate_d1_inserts.py`로 SQL만 재생성하세요.

```bash
bash scripts/upload_to_cloudflare.sh data/processed/upload_small
# 또는
for f in data/processed/upload_small/inserts/inserts_*.sql; do
  wrangler d1 execute contract-db --remote --file="$f"
done
```

## 3. Vectorize 벡터 INSERT

인덱스 `contract-index`는 **dimensions={EMBEDDING_DIM}** 으로 생성되어 있어야 합니다.

```bash
for f in data/processed/upload/vectors/vectors_*.ndjson; do
  echo "Inserting $f ..."
  wrangler vectorize insert contract-index --file="$f"
done
```

## 환경 변수

```bash
export GEMINI_API_KEY="your-google-ai-studio-key"
```
""",
        encoding="utf-8",
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="JSONL → D1 SQL + Vectorize NDJSON (Gemini Embedding)")
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--batch-size", type=int, default=BATCH_SIZE)
    parser.add_argument("--limit", type=int, default=None, help="처리 행 수 제한 (테스트용)")
    parser.add_argument("--resume", action="store_true", help="체크포인트 이후부터 이어하기")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="API 호출 없이 0벡터로 파일 포맷만 검증 (테스트용)",
    )
    parser.add_argument("--api-key", type=str, default=None, help="기본: GEMINI_API_KEY 환경변수")
    args = parser.parse_args()

    api_key = args.api_key or load_api_key()
    if not api_key and not args.dry_run:
        raise SystemExit(
            "GEMINI_API_KEY가 필요합니다.\n"
            "  export GEMINI_API_KEY='...'  또는 .env에 설정\n"
            "  또는 --api-key 옵션 / --dry-run"
        )

    if not args.input.exists():
        raise SystemExit(f"입력 파일 없음: {args.input}\n먼저 preprocess_aihub.py를 실행하세요.")

    client = configure_gemini(api_key) if not args.dry_run else None
    output_dir = args.output
    output_dir.mkdir(parents=True, exist_ok=True)
    copy_migration(output_dir)

    checkpoint_path = output_dir / "checkpoint.json"
    completed: set[str] = load_checkpoint(checkpoint_path) if args.resume else set()

    all_rows = iter_jsonl(args.input, args.limit)
    pending: list[tuple[str, dict[str, Any]]] = []
    for item in all_rows:
        row_id = make_row_id(item)
        if row_id not in completed:
            pending.append((row_id, item))

    print(f"입력: {args.input}")
    print(f"총 {len(all_rows)}행 · 처리 대상 {len(pending)}행 · 이미 완료 {len(completed)}행")
    print(f"모델: {EMBEDDING_MODEL} ({EMBEDDING_DIM}차원)")

    if not pending:
        print("처리할 행이 없습니다.")
        return

    try:
        from tqdm import tqdm
    except ImportError:
        tqdm = lambda x, **_: x  # type: ignore

    writer = BatchWriter(output_dir, ROWS_PER_SQL_FILE, ROWS_PER_NDJSON_FILE)
    errors: list[str] = []
    start = time.time()

    batch_items: list[tuple[str, dict[str, Any]]] = []
    for row_id, item in tqdm(pending, desc="Embedding"):
        batch_items.append((row_id, item))
        if len(batch_items) < args.batch_size:
            continue

        try:
            if args.dry_run:
                vectors = [[0.0] * EMBEDDING_DIM for _ in batch_items]
            else:
                texts = [embedding_text(it) for _, it in batch_items]
                vectors = embed_batch(client, texts)
            for (rid, it), vec in zip(batch_items, vectors):
                writer.add(rid, it, vec)
                completed.add(rid)
            batch_items = []
            if len(completed) % 500 == 0:
                save_checkpoint(
                    checkpoint_path,
                    completed,
                    {"last_updated": time.strftime("%Y-%m-%dT%H:%M:%S")},
                )
        except Exception as e:
            for rid, _ in batch_items:
                errors.append(f"{rid}: {e}")
            batch_items = []
            print(f"배치 오류: {e}")

    # 남은 배치
    if batch_items:
        try:
            if args.dry_run:
                vectors = [[0.0] * EMBEDDING_DIM for _ in batch_items]
            else:
                texts = [embedding_text(it) for _, it in batch_items]
                vectors = embed_batch(client, texts)
            for (rid, it), vec in zip(batch_items, vectors):
                writer.add(rid, it, vec)
                completed.add(rid)
        except Exception as e:
            for rid, _ in batch_items:
                errors.append(f"{rid}: {e}")
            print(f"마지막 배치 오류: {e}")

    writer.close()
    elapsed = time.time() - start

    stats = {
        "input_rows": len(all_rows),
        "embedded_rows": len(completed),
        "errors_count": len(errors),
        "sql_files": len(writer.sql_files),
        "vector_files": len(writer.vec_files),
        "elapsed_seconds": round(elapsed, 1),
        "embedding_model": EMBEDDING_MODEL,
        "embedding_dimensions": EMBEDDING_DIM,
    }
    save_checkpoint(checkpoint_path, completed, stats)

    stats_path = output_dir / "generate_stats.json"
    stats_path.write_text(
        json.dumps({**stats, "errors": errors[:20]}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    write_upload_readme(output_dir, stats)

    if stats["embedded_rows"] == 0 and errors:
        print(f"\n❌ 임베딩 실패 — 생성된 파일 없음 ({elapsed:.1f}s)")
        print(f"   오류 {len(errors)}건 → {stats_path}")
        raise SystemExit(1)

    print(f"\n✅ 생성 완료 ({elapsed:.1f}s)")
    print(f"   임베딩 {stats['embedded_rows']}행 · SQL {len(writer.sql_files)}개 · NDJSON {len(writer.vec_files)}개")
    print(f"   가이드: {output_dir / 'UPLOAD.md'}")
    if errors:
        print(f"   ⚠️ 일부 오류 {len(errors)}건 → {stats_path}")


if __name__ == "__main__":
    main()
