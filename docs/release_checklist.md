# Release Checklist

## Rights and consent

- [ ] Every released speaker is at least 18
- [ ] Every released clip has explicit publication consent
- [ ] Consent covers gated research distribution
- [ ] Consent covers transcripts and non-identifying metadata
- [ ] Consent states evaluation-only intent
- [ ] Completed consent records are stored privately
- [ ] Collector’s legal identity appears in private consent records
- [ ] No recording came from a third party without permission

## Privacy and safety

- [ ] No name, email, address, account number, or precise location appears
- [ ] No child voice appears
- [ ] No accidental bystander voice appears
- [ ] Speaker IDs are pseudonymous
- [ ] The public metadata contains no direct identifier
- [ ] A private takedown alias or contact form is configured
- [ ] GitHub Issues and Discussions are labeled as public channels
- [ ] Raw audio is not committed to GitHub

## Data quality

- [ ] WAV, PCM, 16 kHz, mono
- [ ] One command per file
- [ ] Every file opens
- [ ] Every file has one metadata row
- [ ] Every transcript was manually reviewed
- [ ] Every code-switch category was manually reviewed
- [ ] Duplicate sample IDs checked
- [ ] Duplicate filenames checked
- [ ] Excluded files are not uploaded

## Documentation

- [ ] GitHub README updated
- [ ] Hugging Face Dataset Card updated
- [ ] Dataset size and speaker count are accurate
- [ ] Known limitations are disclosed
- [ ] Dataset license is marked `other`
- [ ] `DATA_LICENSE.md` is linked
- [ ] Citation information is accurate
- [ ] Version and release date are accurate
- [ ] Baseline model versions are documented

## Hugging Face gating

- [ ] Dataset is manually gated
- [ ] Access request asks for affiliation and intended use
- [ ] Applicant confirms evaluation-only use
- [ ] Applicant confirms no training
- [ ] Applicant confirms no redistribution
- [ ] Applicant confirms no voice cloning or speaker identification
- [ ] Applicant confirms deletion after evaluation or request
- [ ] License link is visible before access is approved

## Final checks

```bash
python3 scripts/validate_dataset.py \
  --metadata path/to/metadata.csv \
  --audio-dir path/to/audio

python3 scripts/release_check.py .
```
