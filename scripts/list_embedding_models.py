#!/usr/bin/env python3
"""GEMINI_API_KEY로 접근 가능한 임베딩 모델 목록 조회."""

from __future__ import annotations

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def load_api_key() -> str | None:
    key = os.environ.get("GEMINI_API_KEY")
    if key:
        return key
    env_path = ROOT / ".env"
    if env_path.exists():
        for line in env_path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line.startswith("GEMINI_API_KEY="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    return None


def main() -> None:
    api_key = load_api_key()
    if not api_key:
        print("GEMINI_API_KEY가 설정되지 않았습니다.", file=sys.stderr)
        print('  export GEMINI_API_KEY="your-key"', file=sys.stderr)
        sys.exit(1)

    try:
        from google import genai
    except ImportError:
        print("google-genai 패키지가 필요합니다.", file=sys.stderr)
        print("  python3 -m venv scripts/.venv && source scripts/.venv/bin/activate", file=sys.stderr)
        print("  pip install google-genai", file=sys.stderr)
        sys.exit(1)

    client = genai.Client(
        api_key=api_key,
        http_options={"api_version": "v1beta"},
    )

    print("=== 임베딩(embed) 모델 ===\n")
    embed_count = 0
    for m in client.models.list():
        name = getattr(m, "name", str(m))
        if "embed" in name.lower():
            embed_count += 1
            print(f"  {name}")
            display = getattr(m, "display_name", None)
            if display:
                print(f"    display_name: {display}")

    if embed_count == 0:
        print("  (embed 포함 모델 없음)")

    print(f"\n=== 전체 모델 ({sum(1 for _ in client.models.list())}개, embed 외 샘플) ===\n")
    shown = 0
    for m in client.models.list():
        name = getattr(m, "name", str(m))
        if "embed" in name.lower():
            continue
        print(f"  {name}")
        shown += 1
        if shown >= 15:
            print("  ...")
            break


if __name__ == "__main__":
    main()
