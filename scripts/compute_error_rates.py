#!/usr/bin/env python3
"""Compute CER and simple space-delimited WER by code-switch slice.

Predictions CSV requires: sample_id, model, prediction
Optional: model_version, evaluation_date
"""

from __future__ import annotations

import argparse
import re
import sys
import unicodedata
from pathlib import Path

import pandas as pd
from jiwer import cer, wer


def normalize(text: str) -> str:
    text = unicodedata.normalize("NFKC", str(text))
    text = text.lower()
    text = re.sub(r"[、。,.!?！？:;\"'“”‘’()\[\]{}]", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--metadata", type=Path, required=True)
    parser.add_argument("--predictions", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    return parser.parse_args()


def aggregate(group: pd.DataFrame) -> pd.Series:
    refs = group["reference_normalized"].tolist()
    hyps = group["prediction_normalized"].tolist()
    return pd.Series(
        {
            "sample_count": len(group),
            "cer": cer(refs, hyps),
            "space_delimited_wer": wer(refs, hyps),
        }
    )


def main() -> int:
    args = parse_args()
    metadata = pd.read_csv(args.metadata)
    predictions = pd.read_csv(args.predictions)

    required_meta = {"sample_id", "transcript", "code_switch_type", "switch_direction"}
    required_pred = {"sample_id", "model", "prediction"}

    missing_meta = required_meta - set(metadata.columns)
    missing_pred = required_pred - set(predictions.columns)
    if missing_meta or missing_pred:
        raise ValueError(
            f"Missing columns. metadata={sorted(missing_meta)}, "
            f"predictions={sorted(missing_pred)}"
        )

    merged = predictions.merge(metadata, on="sample_id", how="inner", validate="many_to_one")
    if merged.empty:
        raise ValueError("No predictions matched metadata sample_id values.")

    merged["reference_normalized"] = merged["transcript"].map(normalize)
    merged["prediction_normalized"] = merged["prediction"].map(normalize)

    model_columns = ["model"]
    for optional in ["model_version", "evaluation_date"]:
        if optional in merged.columns:
            model_columns.append(optional)

    outputs = []

    overall = (
        merged.groupby(model_columns, dropna=False)
        .apply(aggregate, include_groups=False)
        .reset_index()
    )
    overall["slice_dimension"] = "overall"
    overall["slice_name"] = "overall"
    outputs.append(overall)

    for dimension in ["code_switch_type", "switch_direction", "matrix_language"]:
        if dimension not in merged.columns:
            continue
        sliced = (
            merged.groupby(model_columns + [dimension], dropna=False)
            .apply(aggregate, include_groups=False)
            .reset_index()
            .rename(columns={dimension: "slice_name"})
        )
        sliced["slice_dimension"] = dimension
        outputs.append(sliced)

    result = pd.concat(outputs, ignore_index=True)
    ordered = (
        model_columns
        + ["slice_dimension", "slice_name", "sample_count", "cer", "space_delimited_wer"]
    )
    result = result[ordered]
    args.output.parent.mkdir(parents=True, exist_ok=True)
    result.to_csv(args.output, index=False)
    print(f"Wrote {len(result)} aggregate rows to {args.output}")
    print(
        "NOTE: space-delimited WER is a provisional metric. "
        "Document Japanese tokenization before publishing final WER."
    )
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (OSError, ValueError, pd.errors.ParserError) as exc:
        print(f"ERROR: {exc}")
        sys.exit(2)
