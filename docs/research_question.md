# Research Question and Hypothesis

## Primary question

How does speech-to-text performance on Japanese–English robotic commands change across word-level, phrase-level, and clause-level code-switching?

## Initial hypothesis

State-of-the-art multilingual speech-to-text systems will not fail uniformly on code-switched commands. Error rates and command-critical errors will vary with:

- the unit of switching;
- the dominant or matrix language;
- the direction of the switch; and
- whether the switched span contains a command-critical action, object, destination, quantity, direction, or negation.

## Why robotic commands?

Robotic commands provide a bounded task domain in which a small transcription change can alter the intended action. This supports evaluation at two levels:

1. **Transcription fidelity:** what words were recognized?
2. **Command fidelity:** were the action and required command slots preserved?

## v0.1 scope

Included:

- Japanese–English code-switching
- Word-level, phrase-level, and clause-level switching
- Short robotic commands
- Evaluation use only
- One command per recording

Deferred:

- Model training
- Other language pairs
- Self-corrections
- Overlapping speakers
- Systematic noise and distance perturbations
- Streaming endpoint evaluation
