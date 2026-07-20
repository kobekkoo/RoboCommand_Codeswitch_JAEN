# RoboCommand Research Evaluation License v0.1

**Applies to:** the audio recordings, transcripts, annotations, metadata, benchmark splits, and derived dataset files distributed as `RoboCommand_Codeswitch_JAEN` (“Dataset”).

**Licensor:** kobekkoo

**Version:** 0.1

**Effective date:** 2026-07-18

> This is a custom pilot license drafted for a small evaluation dataset. It is not an OSI-approved open-source license, a Creative Commons license, or legal advice. Obtain legal review before using it for a high-stakes, institutional, or large-scale release.

## 1. Acceptance

By requesting access to, downloading, copying, or using the Dataset, you agree to these terms.

## 2. Limited permission

Subject to these terms, the Licensor grants you a limited, non-exclusive, non-transferable, revocable permission to use the Dataset solely for:

- noncommercial academic or independent research;
- evaluating, auditing, or benchmarking speech-to-text and spoken-language-understanding systems;
- reproducing published benchmark results; and
- publishing aggregate findings and short illustrative excerpts when reasonably necessary to explain results.

No ownership rights are transferred.

## 3. Evaluation-only restriction

You may not use the Dataset, in whole or in part, to:

- train, pretrain, fine-tune, adapt, distill, align, or otherwise update model parameters;
- build or expand a training corpus;
- create synthetic training data from the recordings or transcripts;
- develop speaker-recognition, speaker-verification, biometric, voice-cloning, speech-synthesis, or impersonation systems; or
- derive reusable speaker embeddings or voiceprints.

Temporary feature extraction that is strictly necessary to evaluate a fixed model is permitted, provided the resulting features are not retained for another purpose.

## 4. Prohibited uses

You may not:

- use the Dataset commercially or provide it as part of a paid product or service;
- identify, re-identify, profile, contact, or attempt to infer the identity or sensitive attributes of a speaker;
- use the Dataset for surveillance, law enforcement, employment, credit, insurance, immigration, or eligibility decisions;
- impersonate a speaker or generate deceptive media;
- use the Dataset to cause harm, discriminate, harass, exploit, or violate applicable law;
- redistribute, sublicense, sell, publish, mirror, or make the raw Dataset available to another person;
- remove notices, provenance information, or usage restrictions; or
- use the Dataset outside the purpose stated in your approved access request.

You may share aggregate statistics, evaluation code, and results that do not expose raw audio or enable reconstruction of a speaker’s voice.

## 5. Access security

You must:

- restrict access to the individual account approved by the Licensor;
- use reasonable technical and organizational safeguards;
- avoid uploading the raw Dataset to public services or repositories;
- notify the Licensor of suspected unauthorized disclosure; and
- delete all Dataset copies when access is withdrawn, when your stated evaluation ends, or when requested by the Licensor, unless retention is required by law.

## 6. Attribution

Public results must identify the Dataset as `RoboCommand_Codeswitch_JAEN`, cite the version used, and link to the official Hugging Face dataset page or GitHub repository.

Suggested citation:

```text
kobekkoo. RoboCommand_Codeswitch_JAEN, version 0.1.0, 2026.
https://huggingface.co/datasets/kobekkoo/RoboCommand_Codeswitch_JAEN
```

Attribution does not imply endorsement.

## 7. Participant rights and takedown

The Licensor may remove, replace, or restrict recordings in response to participant requests, privacy concerns, quality problems, or legal obligations. You agree to stop using and delete identified files when notified through an official dataset update or direct notice.

## 8. Derivatives and benchmark outputs

You may create evaluation artifacts such as alignments, error labels, aggregate metrics, and benchmark reports solely for the permitted purpose. Such artifacts must not contain recoverable raw audio, reusable voice representations, or enough information to re-identify a speaker.

Redistributing a modified or reformatted copy of the Dataset is not permitted without separate written permission.

## 9. No warranty

The Dataset is provided “as is” and “as available,” without warranties of accuracy, completeness, noninfringement, merchantability, fitness for a particular purpose, or uninterrupted availability.

## 10. Limitation of liability

To the maximum extent permitted by applicable law, the Licensor is not liable for any indirect, incidental, special, consequential, or exemplary damages arising from access to or use of the Dataset.

## 11. Termination

Your permission ends automatically if you breach these terms. Upon termination, you must stop using the Dataset and delete all copies and prohibited derivatives under your control.

## 12. Separate software license

Code and scripts in the accompanying GitHub repository are licensed separately under the MIT License. The MIT License does not apply to the Dataset.
