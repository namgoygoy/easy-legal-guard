#!/usr/bin/env python3
"""
MVP RAG 로컬 테스트 — standard_clauses_small + 임베딩 NDJSON으로 유사 조항 검색.

사전 준비:
  python scripts/create_small_corpus.py
  python scripts/generate_embeddings.py \\
    --input data/processed/standard_clauses_small.jsonl \\
    --output data/processed/upload_small

사용:
  export GEMINI_API_KEY="..."
  python scripts/test_rag_local.py "지식재산권이 갑에게 귀속된다"
  python scripts/test_rag_local.py --service-type dev "개발비 지급 시기"
"""

from __future__ import annotations

import argparse
import json
import math
import os
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_JSONL = ROOT / "data" / "processed" / "standard_clauses_small.jsonl"
DEFAULT_VECTORS_DIR = ROOT / "data" / "processed" / "upload_small" / "vectors"
EMBEDDING_MODEL = "gemini-embedding-2"
OUTPUT_DIMENSIONALITY = 768


def load_api_key() -> str | None:
    key = os.environ.get("GEMINI_API_KEY")
    if key:
        return key.strip()
    env_path = ROOT / ".env"
    if env_path.exists():
        for line in env_path.read_text(encoding="utf-8").splitlines():
            if line.strip().startswith("GEMINI_API_KEY="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    return None


def configure_client(api_key: str) -> Any:
    from google import genai

    return genai.Client(api_key=api_key, http_options={"api_version": "v1beta"})


def embed_query(client: Any, text: str) -> list[float]:
    cfg: dict[str, Any] = {"task_type": "RETRIEVAL_QUERY"}
    if OUTPUT_DIMENSIONALITY is not None:
        cfg["output_dimensionality"] = OUTPUT_DIMENSIONALITY
    result = client.models.embed_content(
        model=EMBEDDING_MODEL,
        contents=text,
        config=cfg,
    )
    return list(result.embeddings[0].values)


def cosine(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(x * x for x in b))
    if na == 0 or nb == 0:
        return 0.0
    return dot / (na * nb)


def load_vectors(vectors_dir: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for path in sorted(vectors_dir.glob("vectors_*.ndjson")):
        with path.open(encoding="utf-8") as f:
            for line in f:
                if line.strip():
                    rows.append(json.loads(line))
    return rows


def load_clauses(jsonl_path: Path) -> dict[str, dict]:
    by_id: dict[str, dict] = {}
    with jsonl_path.open(encoding="utf-8") as f:
        for line in f:
            if line.strip():
                row = json.loads(line)
                # id는 generate_embeddings의 make_row_id와 동일 키 필요 → NDJSON id 사용
                pass
    return by_id


def load_clauses_by_ndjson_ids(vectors: list[dict], jsonl_path: Path) -> dict[str, dict]:
    """NDJSON id → 본문 매핑을 위해 jsonl 전체를 id 키로 인덱싱."""
    import hashlib

    by_id: dict[str, dict] = {}
    with jsonl_path.open(encoding="utf-8") as f:
        for line in f:
            if not line.strip():
                continue
            row = json.loads(line)
            key = "|".join(
                [
                    row.get("source_zip") or "",
                    row.get("source_file") or "",
                    str(row.get("article_no")),
                    row.get("document_name") or "",
                    (row.get("content") or "")[:200],
                ]
            )
            rid = hashlib.sha256(key.encode("utf-8")).hexdigest()[:24]
            by_id[rid] = row
    return by_id


def search(
    query_vec: list[float],
    vectors: list[dict],
    clauses: dict[str, dict],
    *,
    top_k: int = 5,
    service_type: str | None = None,
) -> list[tuple[float, dict]]:
    scored: list[tuple[float, dict]] = []
    for v in vectors:
        meta = v.get("metadata") or {}
        if service_type and meta.get("service_type_id") != service_type:
            continue
        score = cosine(query_vec, v["values"])
        rid = v["id"]
        clause = clauses.get(rid)
        if clause:
            scored.append((score, clause))
    scored.sort(key=lambda x: -x[0])
    return scored[:top_k]


def main() -> None:
    parser = argparse.ArgumentParser(description="MVP RAG 로컬 유사도 검색 테스트")
    parser.add_argument("query", help="검색할 계약 조항/질문")
    parser.add_argument("--jsonl", type=Path, default=DEFAULT_JSONL)
    parser.add_argument("--vectors-dir", type=Path, default=DEFAULT_VECTORS_DIR)
    parser.add_argument("--top-k", type=int, default=5)
    parser.add_argument("--service-type", type=str, default=None, help="dev, nda, lease 등")
    args = parser.parse_args()

    if not args.vectors_dir.exists():
        print("벡터 파일이 없습니다. 먼저 실행하세요:", file=sys.stderr)
        print(
            "  python scripts/generate_embeddings.py \\\n"
            "    --input data/processed/standard_clauses_small.jsonl \\\n"
            "    --output data/processed/upload_small",
            file=sys.stderr,
        )
        sys.exit(1)

    api_key = load_api_key()
    if not api_key:
        raise SystemExit("GEMINI_API_KEY 필요")

    vectors = load_vectors(args.vectors_dir)
    clauses = load_clauses_by_ndjson_ids(vectors, args.jsonl)
    client = configure_client(api_key)
    qvec = embed_query(client, args.query)

    hits = search(qvec, vectors, clauses, top_k=args.top_k, service_type=args.service_type)

    print(f'\n쿼리: "{args.query}"\n')
    if not hits:
        print("결과 없음 (service-type 필터 또는 벡터/JSONL 불일치 확인)")
        return

    for i, (score, row) in enumerate(hits, 1):
        labels = ", ".join(row.get("labels") or [])
        content = (row.get("content") or "")[:280]
        print(f"--- [{i}] score={score:.4f} · {row.get('service_type_label')} · {row.get('contract_type')}")
        print(f"    라벨: {labels}")
        print(f"    {content}...\n")


if __name__ == "__main__":
    main()
