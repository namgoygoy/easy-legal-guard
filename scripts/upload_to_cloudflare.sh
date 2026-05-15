#!/usr/bin/env bash
# D1 스키마 + INSERT, Vectorize NDJSON 일괄 업로드
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
UPLOAD="$ROOT/data/processed/upload"

echo "==> D1 schema"
wrangler d1 execute contract-db --remote --file="$UPLOAD/001_standard_clauses.sql"

echo "==> D1 inserts"
for f in "$UPLOAD"/inserts/inserts_*.sql; do
  [[ -f "$f" ]] || continue
  echo "  $f"
  wrangler d1 execute contract-db --remote --file="$f"
done

echo "==> Vectorize inserts"
for f in "$UPLOAD"/vectors/vectors_*.ndjson; do
  [[ -f "$f" ]] || continue
  echo "  $f"
  wrangler vectorize insert contract-index --file="$f"
done

echo "Done."
