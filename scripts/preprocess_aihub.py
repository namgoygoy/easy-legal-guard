#!/usr/bin/env python3
"""
AI-Hub 계약 법률 문서 라벨링 데이터 전처리.

- data/**/02.라벨링데이터/*.zip 내 JSON을 압축 해제 없이 읽음
- 조항(article) 단위로 문구·라벨을 병합해 JSONL 생성
- category_mapping.json 기준으로 서비스 계약 유형 매핑
"""

from __future__ import annotations

import argparse
import json
import re
import zipfile
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterator

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_INPUT = ROOT / "data"
DEFAULT_OUTPUT = ROOT / "data" / "processed"
DEFAULT_MAPPING = Path(__file__).resolve().parent / "category_mapping.json"

LABELING_DIR = "02.라벨링데이터"
ZIP_PATTERN = re.compile(r"^(TL|VL)_(.+)\.zip$", re.IGNORECASE)


@dataclass
class Stats:
    zips_processed: int = 0
    json_files: int = 0
    documents: int = 0
    clauses_written: int = 0
    errors: list[str] = field(default_factory=list)


def load_mapping(path: Path) -> dict[str, Any]:
    with path.open(encoding="utf-8") as f:
        return json.load(f)


def parse_zip_category(zip_name: str) -> dict[str, str | None]:
    m = ZIP_PATTERN.match(zip_name)
    if not m:
        return {"prefix": None, "main_category": None, "sub_category": None, "detail_category": None}
    parts = m.group(2).split("_")
    if len(parts) >= 3:
        return {
            "prefix": m.group(1),
            "main_category": parts[0],
            "sub_category": parts[1],
            "detail_category": "_".join(parts[2:]),
        }
    return {"prefix": m.group(1), "main_category": m.group(2), "sub_category": None, "detail_category": None}


def infer_split(zip_path: Path) -> str:
    parts = {p.name for p in zip_path.parents}
    if "Validation" in parts:
        return "Validation"
    if "Training" in parts:
        return "Training"
    return "Unknown"


def normalize_text(text: str) -> str:
    return " ".join(text.split()).strip()


def section_text(section: dict[str, Any]) -> str:
    content = section.get("content") or {}
    desc = content.get("description") or ""
    if isinstance(desc, str):
        return normalize_text(desc)
    return ""


def section_labels(section: dict[str, Any]) -> list[str]:
    content = section.get("content") or {}
    labels = content.get("content_labels") or []
    return [lb for lb in labels if isinstance(lb, str)]


def section_article(section: dict[str, Any]) -> int | None:
    fmt = section.get("format") or {}
    article = fmt.get("article")
    if article is None:
        return None
    try:
        return int(article)
    except (TypeError, ValueError):
        return None


def document_category(doc: dict[str, Any]) -> dict[str, str]:
    meta = (doc.get("metadata") or {}).get("file_info") or {}
    cat = meta.get("document_category") or {}
    return {
        "main_category": cat.get("main_category") or "",
        "sub_category": cat.get("sub_category") or "",
        "detail_category": cat.get("detail_category") or "",
        "document_name": meta.get("document_name") or "",
    }


def match_service_type(
    mapping: dict[str, Any],
    *,
    main_category: str,
    sub_category: str,
    detail_category: str,
    zip_stem: str,
    labels: list[str],
) -> tuple[str, str]:
    types = mapping.get("service_contract_types") or []
    default = ("etc", "기타 일반")

    for entry in types:
        if entry.get("match", {}).get("default"):
            default = (entry["id"], entry["label"])
            continue

        m = entry.get("match") or {}
        zip_prefixes = m.get("zip_prefixes") or []
        if any(zip_stem.startswith(p) for p in zip_prefixes):
            return entry["id"], entry["label"]

        if detail_category and detail_category in (m.get("detail_categories") or []):
            return entry["id"], entry["label"]

        if sub_category and sub_category in (m.get("sub_categories") or []):
            if not m.get("detail_categories"):
                return entry["id"], entry["label"]

        if main_category and main_category in (m.get("main_categories") or []):
            if not m.get("sub_categories") and not m.get("detail_categories"):
                return entry["id"], entry["label"]

        hints = m.get("content_label_hints") or []
        if hints and any(h in lb for lb in labels for h in hints):
            return entry["id"], entry["label"]

    return default


def should_skip_labels(mapping: dict[str, Any], labels: list[str]) -> bool:
    skip = set(mapping.get("content_label_groups", {}).get("skip_labels") or [])
    return bool(labels) and all(lb in skip for lb in labels)


def iter_labeling_zips(input_dir: Path) -> Iterator[Path]:
    for zip_path in sorted(input_dir.rglob("*.zip")):
        if LABELING_DIR not in zip_path.parts:
            continue
        if not ZIP_PATTERN.match(zip_path.name):
            continue
        yield zip_path


def group_sections_by_article(
    sections: list[dict[str, Any]], mapping: dict[str, Any]
) -> dict[int | str, dict[str, Any]]:
    groups: dict[int | str, dict[str, Any]] = {}
    unnumbered: list[str] = []
    unnumbered_labels: list[str] = []

    for section in sections:
        text = section_text(section)
        if not text:
            continue
        labels = section_labels(section)
        if should_skip_labels(mapping, labels):
            continue

        article = section_article(section)
        if article is None:
            unnumbered.append(text)
            unnumbered_labels.extend(labels)
            continue

        bucket = groups.setdefault(
            article,
            {"article_no": article, "texts": [], "labels": set()},
        )
        bucket["texts"].append(text)
        bucket["labels"].update(labels)

    if unnumbered:
        groups["_preamble"] = {
            "article_no": None,
            "texts": unnumbered,
            "labels": set(unnumbered_labels),
        }
    return groups


def process_document(
    data: dict[str, Any],
    *,
    mapping: dict[str, Any],
    zip_path: Path,
    json_name: str,
    split: str,
    zip_meta: dict[str, str | None],
) -> list[dict[str, Any]]:
    doc = data.get("document") or {}
    cat = document_category(doc)
    sections = doc.get("sections") or []
    if not sections:
        return []

    main = cat["main_category"] or zip_meta.get("main_category") or ""
    sub = cat["sub_category"] or zip_meta.get("sub_category") or ""
    detail = cat["detail_category"] or zip_meta.get("detail_category") or ""
    contract_type = detail or sub or main or "Unknown"
    zip_stem = zip_path.stem

    rows: list[dict[str, Any]] = []
    groups = group_sections_by_article(sections, mapping)

    for key, group in groups.items():
        labels = sorted(group["labels"])
        content = normalize_text(" ".join(group["texts"]))
        if len(content) < 2:
            continue

        service_id, service_label = match_service_type(
            mapping,
            main_category=main,
            sub_category=sub,
            detail_category=detail,
            zip_stem=zip_stem,
            labels=labels,
        )

        article_no = group["article_no"]
        rows.append(
            {
                "contract_type": contract_type,
                "main_category": main,
                "sub_category": sub,
                "detail_category": detail,
                "service_type_id": service_id,
                "service_type_label": service_label,
                "article_no": article_no,
                "labels": labels,
                "content": content,
                "document_name": cat["document_name"],
                "source_zip": zip_path.name,
                "source_file": json_name.lstrip("/"),
                "split": split,
            }
        )
    return rows


def preprocess(input_dir: Path, output_file: Path, mapping_path: Path) -> Stats:
    mapping = load_mapping(mapping_path)

    output_file.parent.mkdir(parents=True, exist_ok=True)
    stats = Stats()

    with output_file.open("w", encoding="utf-8") as f_out:
        for zip_path in iter_labeling_zips(input_dir):
            stats.zips_processed += 1
            split = infer_split(zip_path)
            zip_meta = parse_zip_category(zip_path.name)
            print(f"처리 중: [{split}] {zip_path.name}")

            try:
                with zipfile.ZipFile(zip_path, "r") as zf:
                    json_names = [n for n in zf.namelist() if n.lower().endswith(".json")]
                    for json_name in json_names:
                        stats.json_files += 1
                        try:
                            raw = zf.read(json_name)
                            data = json.loads(raw.decode("utf-8"))
                            stats.documents += 1
                            rows = process_document(
                                data,
                                mapping=mapping,
                                zip_path=zip_path,
                                json_name=json_name,
                                split=split,
                                zip_meta=zip_meta,
                            )
                            for row in rows:
                                f_out.write(json.dumps(row, ensure_ascii=False) + "\n")
                                stats.clauses_written += 1
                        except Exception as e:
                            msg = f"{zip_path.name}/{json_name}: {e}"
                            stats.errors.append(msg)
                            print(f"  오류 — {msg}")
            except zipfile.BadZipFile as e:
                msg = f"{zip_path.name}: BadZipFile — {e}"
                stats.errors.append(msg)
                print(f"  오류 — {msg}")

    stats_path = output_file.parent / "preprocess_stats.json"
    with stats_path.open("w", encoding="utf-8") as f:
        json.dump(
            {
                "zips_processed": stats.zips_processed,
                "json_files": stats.json_files,
                "documents": stats.documents,
                "clauses_written": stats.clauses_written,
                "errors_count": len(stats.errors),
                "errors": stats.errors[:50],
                "output_file": str(output_file),
            },
            f,
            ensure_ascii=False,
            indent=2,
        )

    return stats


def build_clause_library_summary(jsonl_path: Path, summary_path: Path) -> None:
    """조항 라벨별 대표 문구 샘플을 집계해 표준 조항 라이브러리 요약 생성."""
    library: dict[str, dict[str, Any]] = defaultdict(
        lambda: {"count": 0, "samples": [], "service_types": set(), "contract_types": set()}
    )

    with jsonl_path.open(encoding="utf-8") as f:
        for line in f:
            row = json.loads(line)
            for label in row.get("labels") or ["(무라벨)"]:
                key = f"{row.get('service_type_id')}::{label}"
                entry = library[key]
                entry["count"] += 1
                entry["service_types"].add(row.get("service_type_id"))
                entry["contract_types"].add(row.get("contract_type"))
                if len(entry["samples"]) < 3:
                    entry["samples"].append(
                        {
                            "contract_type": row.get("contract_type"),
                            "article_no": row.get("article_no"),
                            "content": (row.get("content") or "")[:200],
                        }
                    )

    out = []
    for key, entry in sorted(library.items(), key=lambda x: -x[1]["count"]):
        service_id, label = key.split("::", 1)
        out.append(
            {
                "service_type_id": service_id,
                "label": label,
                "occurrence_count": entry["count"],
                "contract_types": sorted(entry["contract_types"])[:10],
                "sample_clauses": entry["samples"],
            }
        )

    with summary_path.open("w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)


def main() -> None:
    parser = argparse.ArgumentParser(description="AI-Hub 라벨링 데이터 → JSONL 전처리")
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT, help="data 루트 디렉토리")
    parser.add_argument(
        "--output",
        type=Path,
        default=DEFAULT_OUTPUT / "standard_clauses.jsonl",
        help="출력 JSONL 경로",
    )
    parser.add_argument(
        "--mapping",
        type=Path,
        default=DEFAULT_MAPPING,
        help="카테고리 매핑 JSON",
    )
    parser.add_argument("--no-summary", action="store_true", help="라이브러리 요약 JSON 생략")
    args = parser.parse_args()

    stats = preprocess(args.input, args.output, args.mapping)
    print(f"\n✅ 전처리 완료: {args.output}")
    print(
        f"   zip {stats.zips_processed}개 · JSON {stats.json_files}개 · "
        f"문서 {stats.documents}개 · 조항 {stats.clauses_written}행"
    )
    if stats.errors:
        print(f"   ⚠️ 오류 {len(stats.errors)}건 (상세: {args.output.parent / 'preprocess_stats.json'})")

    if not args.no_summary and args.output.exists():
        summary_path = args.output.parent / "clause_library_summary.json"
        build_clause_library_summary(args.output, summary_path)
        print(f"   📚 라이브러리 요약: {summary_path}")


if __name__ == "__main__":
    main()
