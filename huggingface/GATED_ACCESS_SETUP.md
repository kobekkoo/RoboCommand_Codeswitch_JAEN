# Manual Gating Setup

On the Hugging Face dataset page:

1. Open **Settings**.
2. Enable **Access requests**.
3. Select **Manual approval**.
4. Link the custom dataset license.
5. Add the following applicant fields or questions where supported.

## Suggested access-request text

> RoboCommand_Codeswitch_JAEN contains human voice recordings and is available only for noncommercial evaluation of fixed speech-to-text or spoken-language-understanding systems. It may not be used for training, fine-tuning, voice cloning, speaker identification, biometric analysis, commercial use, or redistribution. Approval is individual.

Access is individually approved and limited to fixed-model evaluation. Applicants must describe the noncommercial evaluation they will run, the models to be evaluated, and the planned completion and deletion date. Requests involving training, fine-tuning, adaptation, voice cloning, speaker recognition, redistribution, public mirroring, or commercial use should not be approved.

## Suggested fields

- Affiliation or independent researcher status — text
- Research or project page — text
- Models to be evaluated — text
- Intended evaluation use — text
- Expected completion and deletion date — date picker
- Country — country

## Required confirmations

Ask applicants to affirm:

- [ ] I will use the dataset only for noncommercial evaluation or research.
- [ ] I will not train, fine-tune, adapt, distill, or update a model using the dataset.
- [ ] I will not use the dataset for voice cloning, speech synthesis, speaker recognition, biometric profiling, or impersonation.
- [ ] I will not attempt to identify or contact speakers.
- [ ] I will not redistribute or publicly mirror the raw dataset.
- [ ] I agree to the custom RoboCommand Research Evaluation License.

## Approval checklist

Before approving:

- Intended use is specific and evaluation-focused.
- Applicant identity and affiliation are plausible.
- No model-training purpose is stated.
- No redistribution or commercial intent is stated.
- The applicant accepted every required confirmation.

Record approvals privately with:

- Hugging Face username
- approval date
- declared purpose
- dataset version
- any expiry or deletion date
