---
pretty_name: RoboCommand Codeswitch JA-EN
license: other
language:
- ja
- en
task_categories:
- automatic-speech-recognition
size_categories:
- n<1K
tags:
- audio
- code-switching
- robotics
- robot-commands
- speech-recognition
- japanese
- english
extra_gated_prompt: >-
  Access is individually approved and limited to fixed-model evaluation.
  Describe your noncommercial evaluation, the models to be evaluated, and
  your planned completion and deletion date. Requests involving training,
  fine-tuning, adaptation, voice cloning, speaker recognition, redistribution,
  public mirroring, or commercial use will not be approved.
extra_gated_fields:
  "Affiliation or independent researcher status": text
  "Research or project page": text
  "Models to be evaluated": text
  "Intended evaluation use": text
  "Expected completion and deletion date": date_picker
  "Country": country
  "I will use the dataset only for noncommercial evaluation or research": checkbox
  "I will not train, fine-tune, adapt, distill, or update a model using the dataset": checkbox
  "I will not use the dataset for voice cloning, speech synthesis, speaker recognition, biometric profiling, or impersonation": checkbox
  "I will not attempt to identify or contact speakers": checkbox
  "I will not redistribute or publicly mirror the raw dataset": checkbox
  "I agree to the custom RoboCommand Research Evaluation License": checkbox
---

# RoboCommand_Codeswitch_JAEN

A private pre-release placeholder for an evaluation-only pilot benchmark of Japanese–English code-switched robotic commands.

- **Version:** 0.1.0
- **Maintainer:** [kobekkoo](https://huggingface.co/kobekkoo)
- **Toolkit and lab notebook:** [GitHub repository](https://github.com/kobekkoo/RoboCommand_Codeswitch_JAEN)

## Dataset summary

This Dataset Card documents a planned benchmark for evaluating whether speech-to-text performance changes across different shapes of Japanese–English code-switching in short robotic commands.

No approved WAV files are included in this pre-release upload. The repository currently contains the Dataset Card, gated-access setup notes, and an empty metadata structure.

The initial release distinguishes:

- word-level switching;
- phrase-level switching; and
- clause-level switching.

Each approved recording will contain one command and will be distributed as 16 kHz mono WAV audio with a manually reviewed transcript and pseudonymous metadata.

## Intended use

Permitted use is limited to noncommercial research and evaluation of fixed speech-to-text or spoken-language-understanding systems.

The Dataset is not provided for:

- model training, fine-tuning, adaptation, or distillation;
- voice cloning or speech synthesis;
- speaker recognition or biometric analysis;
- commercial products or services;
- surveillance, profiling, or eligibility decisions;
- re-identification; or
- redistribution of raw files.

Access is subject to the custom [RoboCommand Research Evaluation License](https://github.com/kobekkoo/RoboCommand_Codeswitch_JAEN/blob/main/DATA_LICENSE.md).

## Access

The dataset repository is private initially. Manual gating has not been activated by this card alone; before opening access, the maintainer should enable Hugging Face access requests with manual approval and use the custom fields in this card metadata.

Applicants should provide:

- affiliation or independent-research status;
- a short description of the intended evaluation;
- models to be evaluated;
- expected deletion date; and
- agreement to the evaluation-only and non-redistribution terms.

Approval is individual and does not automatically extend to colleagues or an organization.

## Dataset structure

The pre-release upload contains one header-only metadata structure for the future evaluation split:

```text
data/
└── test/
    ├── metadata.csv
    └── audio_files_go_here.txt
```

Approved WAV files should be added only after consent and validation checks pass.

### Core fields

| Field | Description |
|---|---|
| `audio` / `file_name` | WAV recording |
| `sample_id` | Stable pseudonymous sample ID |
| `speaker_id` | Pseudonymous speaker ID |
| `transcript` | Manually reviewed transcript |
| `matrix_language` | Dominant language |
| `embedded_language` | Embedded language |
| `code_switch_type` | `word`, `phrase`, or `clause` |
| `switch_direction` | `ja_to_en` or `en_to_ja` |
| `command_action` | Canonical robot action |
| `command_object` | Canonical target object |
| `schema_version` | Metadata schema version |

The full provisional schema is documented in the GitHub repository.

## Loading the dataset

After manual gating is activated, access is approved, and approved data files are uploaded:

```python
from datasets import load_dataset

dataset = load_dataset(
    "kobekkoo/RoboCommand_Codeswitch_JAEN",
    token=True,
)
```

## Collection process

Recordings are collected through CommandLoop or an equivalent consented workflow.

For v0.1:

- participants are adults;
- recordings contain one short robot command;
- filenames and speaker IDs are pseudonymous;
- transcripts and switching labels are manually reviewed;
- no intentional personal information is included; and
- raw consent records are stored privately rather than in the dataset.

## Evaluation

Recommended reporting includes:

- Character Error Rate;
- explicitly tokenized Word Error Rate;
- action accuracy;
- object accuracy; and
- results split by switching type and direction.

Always report sample count with every metric.

## Personal and sensitive information

The dataset is designed not to contain names, email addresses, precise locations, or signed consent documents. Voice recordings may nonetheless be personally identifying or biometric in some contexts. Access restrictions and contractual terms reduce—but cannot eliminate—misuse risk.

## Biases and limitations

- This is a small pilot and is not representative of all Japanese or English speakers.
- Speaker, accent, age, gender, device, and regional coverage may be limited.
- Robotic commands are a narrow domain.
- Code-switching naturalness varies across individuals and communities.
- A small evaluation set can produce unstable model rankings.
- Public transcripts may enable benchmark-specific optimization.
- Gating and licensing cannot technically prevent every unauthorized use.
- Space-delimited WER is not a complete metric for Japanese.

## Participant withdrawal and corrections

The maintainer may remove or replace samples in future releases in response to participant requests, privacy concerns, or annotation errors. Approved users may be asked to delete affected sample IDs.

**Private takedown contact:** [kobekko94@gmail.com](mailto:kobekko94@gmail.com)

## Licensing

- Dataset: custom evaluation-only license, marked `other`
- Toolkit and scripts: MIT License

## Citation

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
