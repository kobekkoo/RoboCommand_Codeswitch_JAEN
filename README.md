# RoboCommand_Codeswitch_JAEN

A pilot Japanese–English code-switched speech benchmark for evaluating speech-to-text systems on robotic commands.

- **Status:** v0.1 starter repository
- **Maintainer:** [kobekkoo](https://github.com/kobekkoo)
- **Dataset:** `https://huggingface.co/datasets/kobekkoo/RoboCommand_Codeswitch_JAEN`
- **Project tool:** CommandLoop

> This repository is the laboratory notebook, collection toolkit, validation code, and benchmark protocol. The gated audio dataset should be hosted on Hugging Face rather than duplicated in this GitHub repository.

## Research question

How does speech-to-text performance on Japanese–English robotic commands change across different shapes of code-switching?

The initial benchmark focuses on:

1. **Word-level switching** — a word from one language is embedded in the other.
2. **Phrase-level switching** — a multi-word phrase is embedded in the other language.
3. **Clause-level switching** — the language changes across clauses within one command.

The dataset is **evaluation-only**. It is not licensed for model training, fine-tuning, voice cloning, speaker identification, or commercial use.

## Repository map

```text
.
├── README.md
├── LICENSE
├── DATA_LICENSE.md
├── CITATION.cff
├── CONTRIBUTING.md
├── requirements.txt
├── config/
│   └── commandloop_field_map.example.json
├── data/
│   └── sample/
│       └── metadata.csv
├── docs/
│   ├── collection_recipe_v0.1.md
│   ├── consent_and_release_template.md
│   ├── evaluation_protocol.md
│   ├── lab_notebook_template.md
│   ├── privacy_and_takedown.md
│   ├── release_checklist.md
│   ├── research_question.md
│   └── schema_v0.1.md
├── huggingface/
│   ├── README.md
│   ├── GATED_ACCESS_SETUP.md
│   └── data/
│       └── test/
│           └── metadata.csv
├── results/
│   └── baseline_results_template.csv
└── scripts/
    ├── compute_error_rates.py
    ├── export_commandloop.py
    ├── release_check.py
    └── validate_dataset.py
```

## Quick start

Create a Python environment and install the small toolkit:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Validate the sample schema:

```bash
python3 scripts/validate_dataset.py \
  --metadata data/sample/metadata.csv \
  --audio-dir data/sample/audio \
  --allow-missing-audio
```

Export a Supabase or CommandLoop CSV into the provisional Hugging Face format:

```bash
python3 scripts/export_commandloop.py \
  --input path/to/commandloop_export.csv \
  --mapping config/commandloop_field_map.example.json \
  --output-dir build/hf_export
```

Calculate CER and space-delimited WER from model predictions:

```bash
python3 scripts/compute_error_rates.py \
  --metadata build/hf_export/metadata.csv \
  --predictions path/to/predictions.csv \
  --output results/baseline_results.csv
```

Run the pre-release check:

```bash
python3 scripts/release_check.py .
```

## Recommended v0.1 definition of done

- 50–100 consented WAV recordings
- Japanese and English within every benchmark command
- Three switching categories: word, phrase, and clause
- 16 kHz, mono PCM WAV
- One command per file
- Pseudonymous speaker IDs
- Manual transcript review
- Manually gated Hugging Face access
- Baseline evaluation on at least two STT models
- Results reported by code-switching slice
- No participant personal email published
- Confidential privacy and takedown contact configured: `kobekko94@gmail.com`

## Licensing

The assets have separate licenses:

- **Software and scripts:** MIT License — see [`LICENSE`](LICENSE).
- **Audio, transcripts, and dataset metadata:** custom evaluation-only terms — see [`DATA_LICENSE.md`](DATA_LICENSE.md).

The custom dataset license is a practical pilot draft, not legal advice. Have it reviewed before relying on it for a high-stakes or large-scale release.

## Public identity and contact

The public author and maintainer identity is `kobekkoo`. A full legal name does not need to appear in the public repository, dataset card, or citation file.

For participant consent records, the person collecting the recordings should use their legal name or legal entity privately so that the consent record identifies the responsible party.

- General questions: use GitHub Discussions.
- Data-quality reports: use GitHub Issues.
- Confidential privacy or takedown requests: email **[kobekko94@gmail.com](mailto:kobekko94@gmail.com)**.

## Citation

GitHub will render a “Cite this repository” control from [`CITATION.cff`](CITATION.cff). Until a DOI is created, cite the repository and version:

```bibtex
@dataset{kobekkoo_robocommand_codeswitch_jaen_2026,
  author       = {{kobekkoo}},
  title        = {RoboCommand_Codeswitch_JAEN},
  year         = {2026},
  version      = {0.1.0},
  publisher    = {Hugging Face},
  url          = {https://huggingface.co/datasets/kobekkoo/RoboCommand_Codeswitch_JAEN}
}
```

## Acknowledgment

The project structure was inspired in part by public code-switching datasets such as SwitchLingua. No SwitchLingua recordings or transcripts should be copied into this dataset unless their license and terms explicitly permit the intended reuse and attribution is provided.
