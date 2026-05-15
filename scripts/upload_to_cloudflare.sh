#!/usr/bin/env bash
# D1 스키마 + INSERT, Vectorize NDJSON 일괄 업로드
# 사용: bash scripts/upload_to_cloudflare.sh data/processed/upload_small
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
UPLOAD="${1:-$ROOT/data/processed/upload_small}"

if [[ ! -d "$UPLOAD" ]]; then
  echo "업로드 디렉토리 없음: $UPLOAD" >&2
  exit 1
fi

echo "==> D1 schema ($UPLOAD)"
wrangler d1 execute contract-db --remote --file="$UPLOAD/001_standard_clauses.sql"

echo "==> D1 inserts ($(ls "$UPLOAD"/inserts/inserts_*.sql 2>/dev/null | wc -l | tr -d ' ') files)"
for f in "$UPLOAD"/inserts/inserts_*.sql; do
  [[ -f "$f" ]] || continue
  echo "  $(basename "$f")"
  wrangler d1 execute contract-db --remote --file="$f"
done

echo "==> Vectorize inserts"
for f in "$UPLOAD"/vectors/vectors_*.ndjson; do
  [[ -f "$f" ]] || continue
  echo "  $(basename "$f")"
  wrangler vectorize insert contract-index --file="$f"
done

echo "Done."
