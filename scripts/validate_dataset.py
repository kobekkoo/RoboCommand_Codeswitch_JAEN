#!/usr/bin/env python3
"""Validate RoboCommand_Codeswitch_JAEN metadata and WAV files."""

from __future__ import annotations

import argparse
import csv
import re
import sys
import wave
from pathlib import Path

REQUIRED_COLUMNS = {
    "file_name",
    "sample_id",
    "speaker_id",
    "transcript",
    "matrix_language",
    "embedded_language",
    "code_switch_type",
    "switch_direction",
    "command_action",
    "split",
    "consent_for_publication",
    "schema_version",
}

ALLOWED = {
    "matrix_language": {"ja", "en"},
    "embedded_language": {"ja", "en"},
    "code_switch_type": {"word", "phrase", "clause"},
    "switch_direction": {"ja_to_en", "en_to_ja"},
    "split": {"test"},
    "consent_for_publication": {"true", "false"},
    "review_status": {"pending", "reviewed", "excluded", ""},
}

SAFE_FILENAME = re.compile(r"^[A-Za-z0-9._-]+$")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--metadata", type=Path, required=True)
    parser.add_argument("--audio-dir", type=Path, required=True)
    parser.add_argument(
        "--allow-missing-audio",
        action="store_true",
        help="Validate schema without requiring WAV files.",
    )
    parser.add_argument(
        "--allow-empty",
        action="store_true",
        help="Allow header-only metadata for a pre-release placeholder upload.",
    )
    return parser.parse_args()


def validate_wav(path: Path) -> list[str]:
    errors: list[str] = []
    try:
        with wave.open(str(path), "rb") as wav:
            if wav.getnchannels() != 1:
                errors.append(f"{path.name}: expected mono, got {wav.getnchannels()} channels")
            if wav.getframerate() != 16000:
                errors.append(f"{path.name}: expected 16000 Hz, got {wav.getframerate()} Hz")
            if wav.getsampwidth() not in {2, 3, 4}:
                errors.append(
                    f"{path.name}: unusual PCM sample width {wav.getsampwidth()} bytes"
                )
            if wav.getnframes() <= 0:
                errors.append(f"{path.name}: contains no audio frames")
    except (wave.Error, OSError) as exc:
        errors.append(f"{path.name}: cannot read WAV ({exc})")
    return errors


def main() -> int:
    args = parse_args()
    errors: list[str] = []
    warnings: list[str] = []

    if not args.metadata.exists():
        print(f"ERROR: metadata file not found: {args.metadata}")
        return 2

    with args.metadata.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        columns = set(reader.fieldnames or [])
        missing = REQUIRED_COLUMNS - columns
        if missing:
            errors.append(f"Missing required columns: {sorted(missing)}")
        rows = list(reader)

    if not rows and not args.allow_empty:
        errors.append("Metadata contains no rows.")

    sample_ids: set[str] = set()
    filenames: set[str] = set()

    for line_number, row in enumerate(rows, start=2):
        label = f"row {line_number}"

        for field in REQUIRED_COLUMNS:
            if field in columns and not (row.get(field) or "").strip():
                errors.append(f"{label}: required field '{field}' is blank")

        sample_id = (row.get("sample_id") or "").strip()
        if sample_id in sample_ids:
            errors.append(f"{label}: duplicate sample_id '{sample_id}'")
        sample_ids.add(sample_id)

        filename = (row.get("file_name") or "").strip()
        if filename in filenames:
            errors.append(f"{label}: duplicate file_name '{filename}'")
        filenames.add(filename)

        if filename and not SAFE_FILENAME.fullmatch(filename):
            errors.append(f"{label}: unsafe file_name '{filename}'")
        if filename and not filename.lower().endswith(".wav"):
            errors.append(f"{label}: file must use .wav extension: '{filename}'")

        for field, allowed_values in ALLOWED.items():
            value = (row.get(field) or "").strip().lower()
            if field in columns and value not in allowed_values:
                errors.append(
                    f"{label}: invalid {field}='{value}', allowed={sorted(allowed_values)}"
                )

        matrix = (row.get("matrix_language") or "").strip()
        embedded = (row.get("embedded_language") or "").strip()
        if matrix and embedded and matrix == embedded:
            errors.append(f"{label}: matrix and embedded languages must differ")

        direction = (row.get("switch_direction") or "").strip()
        expected = f"{matrix}_to_{embedded}" if matrix and embedded else ""
        if expected and direction != expected:
            errors.append(
                f"{label}: switch_direction='{direction}' but expected '{expected}'"
            )

        consent = (row.get("consent_for_publication") or "").strip().lower()
        if consent != "true":
            errors.append(f"{label}: consent_for_publication must be true for release")

        if (row.get("review_status") or "").strip().lower() not in {"reviewed", ""}:
            warnings.append(f"{label}: review_status is not 'reviewed'")

        audio_path = args.audio_dir / filename
        if not args.allow_missing_audio:
            if not audio_path.exists():
                errors.append(f"{label}: missing audio file {audio_path}")
            else:
                errors.extend(validate_wav(audio_path))

    for warning in warnings:
        print(f"WARNING: {warning}")

    if errors:
        for error in errors:
            print(f"ERROR: {error}")
        print(f"\nValidation failed with {len(errors)} error(s).")
        return 1

    if not rows:
        print("Validation passed: 0 rows, empty metadata schema accepted.")
    else:
        print(
            f"Validation passed: {len(rows)} rows, "
            f"{len(sample_ids)} unique samples, schema and consent checks complete."
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
