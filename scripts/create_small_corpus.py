#!/usr/bin/env python3
"""
standard_clauses.jsonl → MVP용 소규모 코퍼스 생성.

프리랜서·소상공인 서비스 유형(etc 제외)에서 카테고리별 쿼터 샘플링.
"""

from __future__ import annotations

import argparse
import json
import random
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_INPUT = ROOT / "data" / "processed" / "standard_clauses.jsonl"
DEFAULT_OUTPUT = ROOT / "data" / "processed" / "standard_clauses_small.jsonl"

# MVP: /analyze 화면 계약 유형과 맞춘 카테고리 (etc 제외)
MVP_SERVICE_TYPES = ("dev", "nda", "lease", "design", "franchise", "translation")

# 카테고리별 목표 건수 (합계 ≈ TARGET_TOTAL)
DEFAULT_QUOTAS: dict[str, int] = {
    "dev": 900,
    "nda": 450,
    "lease": 400,
    "design": 350,
    "franchise": 250,
    "translation": 150,
}


def load_by_service(path: Path, service_types: tuple[str, ...]) -> dict[str, list[dict]]:
    buckets: dict[str, list[dict]] = defaultdict(list)
    with path.open(encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            row = json.loads(line)
            sid = row.get("service_type_id") or "etc"
            if sid in service_types:
                buckets[sid].append(row)
    return buckets


def sample_rows(rows: list[dict], n: int, rng: random.Random) -> list[dict]:
    if n >= len(rows):
        return list(rows)
    return rng.sample(rows, n)


def build_small_corpus(
    buckets: dict[str, list[dict]],
    quotas: dict[str, int],
    rng: random.Random,
) -> list[dict]:
    selected: list[dict] = []
    for sid, quota in quotas.items():
        pool = buckets.get(sid, [])
        if not pool:
            print(f"  ⚠️ {sid}: 데이터 없음 (quota {quota} 스킵)")
            continue
        take = min(quota, len(pool))
        picked = sample_rows(pool, take, rng)
        selected.extend(picked)
        print(f"  {sid}: {take}/{len(pool)}건 샘플링")
    rng.shuffle(selected)
    return selected


def main() -> None:
    parser = argparse.ArgumentParser(description="MVP용 standard_clauses_small.jsonl 생성")
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument(
        "--target",
        type=int,
        default=None,
        help="총 목표 건수 (지정 시 quotas 비율로 자동 재배분)",
    )
    args = parser.parse_args()

    if not args.input.exists():
        raise SystemExit(f"입력 없음: {args.input}")

    rng = random.Random(args.seed)
    buckets = load_by_service(args.input, MVP_SERVICE_TYPES)

    quotas = dict(DEFAULT_QUOTAS)
    if args.target:
        base = sum(quotas.values()) or 1
        quotas = {k: max(1, int(v / base * args.target)) for k, v in quotas.items()}
        # 반올림 오차 보정
        diff = args.target - sum(quotas.values())
        if diff and quotas:
            key = max(quotas, key=quotas.get)
            quotas[key] += diff

    print(f"입력: {args.input}")
    print(f"목표: {sum(quotas.values())}건 · 카테고리: {', '.join(MVP_SERVICE_TYPES)}\n")

    selected = build_small_corpus(buckets, quotas, rng)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8") as f:
        for row in selected:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")

    stats = {
        "total": len(selected),
        "by_service_type": dict(Counter(r["service_type_id"] for r in selected)),
        "by_split": dict(Counter(r.get("split", "?") for r in selected)),
        "top_contract_types": Counter(r["contract_type"] for r in selected).most_common(10),
    }
    stats_path = args.output.with_suffix(".stats.json")
    stats_path.write_text(json.dumps(stats, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"\n✅ 저장: {args.output} ({len(selected)}행)")
    print(f"   통계: {stats_path}")


if __name__ == "__main__":
    main()
