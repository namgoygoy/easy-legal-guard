#!/usr/bin/env python3
"""
JSONL만으로 D1 INSERT SQL 재생성 (임베딩 API 호출 없음).

SQLITE_TOOBIG 오류 시 기존 inserts/ 폴더를 지우고 이 스크립트를 실행하세요.

  python scripts/generate_d1_inserts.py \\
    --input data/processed/standard_clauses_small.jsonl \\
    --output data/processed/upload_small
"""

from __future__ import annotations

import argparse
import json
import shutil
from pathlib import Path

import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))

from generate_embeddings import (  # noqa: E402
    ROWS_PER_SQL_FILE,
    BatchWriter,
    make_row_id,
    row_to_sql_values,
)

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_INPUT = ROOT / "data" / "processed" / "standard_clauses_small.jsonl"
DEFAULT_OUTPUT = ROOT / "data" / "processed" / "upload_small"


def main() -> None:
    parser = argparse.ArgumentParser(description="JSONL → D1 INSERT SQL (소배치)")
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument(
        "--rows-per-file",
        type=int,
        default=ROWS_PER_SQL_FILE,
        help=f"파일당 INSERT 문 개수 (기본 {ROWS_PER_SQL_FILE})",
    )
    args = parser.parse_args()

    if not args.input.exists():
        raise SystemExit(f"입력 없음: {args.input}")

    inserts_dir = args.output / "inserts"
    if inserts_dir.exists():
        shutil.rmtree(inserts_dir)

    writer = BatchWriter(args.output, args.rows_per_file, 10_000)
    count = 0
    with args.input.open(encoding="utf-8") as f:
        for line in f:
            if not line.strip():
                continue
            item = json.loads(line)
            row_id = make_row_id(item)
            writer._sql_buffer.append(row_to_sql_values(row_id, item))
            count += 1
            if len(writer._sql_buffer) >= writer.sql_rows_per_file:
                writer._flush_sql()

    writer._flush_sql()
    print(f"✅ D1 INSERT {count}행 → {inserts_dir} ({len(writer.sql_files)}개 파일)")
    print(f"   wrangler d1 execute contract-db --remote --file={inserts_dir}/inserts_0001.sql")


if __name__ == "__main__":
    main()
