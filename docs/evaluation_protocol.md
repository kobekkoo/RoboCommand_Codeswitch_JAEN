# Evaluation Protocol v0.1

## Purpose

Compare fixed speech-to-text systems on the same evaluation-only dataset and determine whether performance changes by code-switching shape.

## Required reporting

For every evaluated model, record:

- provider and model name;
- exact model version or API snapshot when available;
- evaluation date;
- decoding settings;
- prompting or language hints;
- normalization rules;
- number of clips;
- failures or excluded clips.

## Primary metrics

### Character Error Rate

CER is the safest initial transcription metric for mixed Japanese–English text because Japanese does not use spaces consistently.

### Space-delimited Word Error Rate

Report WER only after stating the tokenization rule. The starter script calculates a simple space-delimited WER and should not be treated as a final Japanese tokenizer.

### Command-critical accuracy

Manually or programmatically compare:

- action
- object
- source
- destination
- direction
- quantity
- negation

The v0.1 benchmark should at minimum report whether `command_action` and `command_object` were preserved.

## Required slices

- overall
- word-level switching
- phrase-level switching
- clause-level switching
- Japanese-to-English
- English-to-Japanese
- matrix language
- switched action versus switched object, if annotated

Always show sample count next to a score.

## Normalization

Create one frozen normalization function before comparing models. Suggested v0.1 rules:

- Unicode normalize;
- lowercase Latin characters;
- standardize whitespace;
- remove punctuation that does not change command meaning;
- do not remove negation, directions, quantities, or command-critical tokens.

Store raw hypotheses and normalized hypotheses.

## Benchmark integrity

- Do not tune prompts separately on the test set.
- Freeze the dataset version before producing the final table.
- Preserve failed API calls rather than silently dropping them.
- Report uncertainty and avoid strong conclusions from very small slices.
- Do not claim that results generalize beyond Japanese–English robotic commands.
