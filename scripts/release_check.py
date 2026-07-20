#!/usr/bin/env python3
"""Check repository text files for release-blocking placeholders."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

REQUIRED_CONTACT = "kobekko94@gmail.com"
REQUIRED_CONTACT_FILES = {
    "README.md",
    "docs/privacy_and_takedown.md",
    "huggingface/README.md",
}

PRIVATE_TEMPLATE_MARKER = "[LEGAL NAME OR LEGAL ENTITY — PRIVATE RECORD ONLY]"

PUBLIC_TEXT_SUFFIXES = {".md", ".txt", ".yml", ".yaml", ".cff", ".csv", ".json"}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("repo", type=Path)
    args = parser.parse_args()

    blockers: list[str] = []

    for relative_path in sorted(REQUIRED_CONTACT_FILES):
        path = args.repo / relative_path
        if not path.exists():
            blockers.append(f"Missing required contact file: {relative_path}")
            continue
        text = path.read_text(encoding="utf-8", errors="replace")
        if REQUIRED_CONTACT not in text:
            blockers.append(
                f"{relative_path}: required private contact {REQUIRED_CONTACT} is missing"
            )

    for path in args.repo.rglob("*"):
        if not path.is_file() or path.suffix.lower() not in PUBLIC_TEXT_SUFFIXES:
            continue
        if ".git" in path.parts:
            continue
        text = path.read_text(encoding="utf-8", errors="replace")
        if PRIVATE_TEMPLATE_MARKER in text:
            print(
                f"NOTE: {path.relative_to(args.repo)} contains the private consent "
                "template marker. Complete it only in private signed copies; do not "
                "commit completed forms."
            )

    if blockers:
        for blocker in blockers:
            print(f"BLOCKER: {blocker}")
        print(f"\nRelease check failed with {len(blockers)} blocker(s).")
        return 1

    print(
        "Release check passed. The confidential contact alias is configured in all "
        "required public documents."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
