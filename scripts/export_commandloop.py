#!/usr/bin/env python3
"""Convert a CommandLoop CSV/JSON/JSONL export into provisional metadata.csv.

This script intentionally avoids a direct Supabase connection. Export a table from
CommandLoop/Supabase first, then provide a field mapping JSON file.
"""

from __future__ import annotations

import argparse
import csv
import json
import shutil
import sys
from pathlib import Path
from typing import Any

OUTPUT_COLUMNS = [
    "file_name",
    "sample_id",
    "speaker_id",
    "transcript",
    "matrix_language",
    "embedded_language",
    "code_switch_type",
    "switch_direction",
    "command_action",
    "command_object",
    "command_source",
    "command_destination",
    "command_direction",
    "command_quantity",
    "environment",
    "device_type",
    "duration_seconds",
    "prompt_id",
    "split",
    "consent_for_publication",
    "review_status",
    "schema_version",
    "notes",
]

DEFAULTS = {
    "split": "test",
    "schema_version": "0.1",
    "review_status": "pending",
    "environment": "quiet_indoor",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--mapping", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument(
        "--audio-dir",
        type=Path,
        help="Optional local directory containing files named by file_name.",
    )
    return parser.parse_args()


def read_records(path: Path) -> list[dict[str, Any]]:
    suffix = path.suffix.lower()
    if suffix == ".csv":
        with path.open("r", encoding="utf-8-sig", newline="") as handle:
            return list(csv.DictReader(handle))
    if suffix == ".json":
        data = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(data, list):
            raise ValueError("JSON input must be a list of objects.")
        return data
    if suffix in {".jsonl", ".ndjson"}:
        return [
            json.loads(line)
            for line in path.read_text(encoding="utf-8").splitlines()
            if line.strip()
        ]
    raise ValueError("Input must be CSV, JSON, JSONL, or NDJSON.")


def normalize_bool(value: Any) -> str:
    if isinstance(value, bool):
        return "true" if value else "false"
    text = str(value or "").strip().lower()
    return "true" if text in {"1", "true", "yes", "y"} else "false"


def main() -> int:
    args = parse_args()
    mapping = json.loads(args.mapping.read_text(encoding="utf-8"))
    records = read_records(args.input)

    args.output_dir.mkdir(parents=True, exist_ok=True)
    output_audio = args.output_dir / "audio"
    if args.audio_dir:
        output_audio.mkdir(exist_ok=True)

    rows: list[dict[str, str]] = []
    missing_audio: list[str] = []

    for index, source in enumerate(records, start=1):
        row: dict[str, str] = {}
        for output_field in OUTPUT_COLUMNS:
            source_field = mapping.get(output_field)
            value = source.get(source_field, "") if source_field else ""
            if value in {None, ""}:
                value = DEFAULTS.get(output_field, "")
            row[output_field] = str(value).strip()

        if not row["sample_id"]:
            row["sample_id"] = f"jaen_{index:06d}"
        if not row["file_name"]:
            row["file_name"] = f"{row['sample_id']}.wav"
        if not row["speaker_id"]:
            row["speaker_id"] = "speaker_unassigned"

        row["consent_for_publication"] = normalize_bool(
            row["consent_for_publication"]
        )

        if (
            not row["switch_direction"]
            and row["matrix_language"]
            and row["embedded_language"]
        ):
            row["switch_direction"] = (
                f"{row['matrix_language']}_to_{row['embedded_language']}"
            )

        rows.append(row)

        if args.audio_dir:
            source_audio = args.audio_dir / row["file_name"]
            if source_audio.exists():
                shutil.copy2(source_audio, output_audio / row["file_name"])
            else:
                missing_audio.append(row["file_name"])

    output_csv = args.output_dir / "metadata.csv"
    with output_csv.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=OUTPUT_COLUMNS)
        writer.writeheader()
        writer.writerows(rows)

    print(f"Wrote {len(rows)} metadata rows to {output_csv}")
    if missing_audio:
        print(f"WARNING: {len(missing_audio)} audio file(s) were not found.")
        for filename in missing_audio[:10]:
            print(f"  - {filename}")
        if len(missing_audio) > 10:
            print("  - ...")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print(f"ERROR: {exc}")
        sys.exit(2)
