# Collection Recipe v0.1

## Goal

Collect a small, high-quality evaluation benchmark that isolates the shape of Japanese–English code-switching in robotic commands.

## Target release

- 50–100 validated recordings
- At least 15 recordings per switching category
- Multiple command actions and objects
- More than one speaker where feasible
- 16 kHz mono PCM WAV
- One command per file
- No names, addresses, account numbers, or personal stories

## Code-switch categories

### Word-level

One lexical item switches language while the surrounding command remains primarily in the other language.

Examples:

- `赤い box を取って`
- `Pick up the 赤い箱`

### Phrase-level

A multi-word phrase switches language.

Examples:

- `テーブルの上の red box を取って`
- `Pick up 赤い箱の隣のコップ`

### Clause-level

The language changes at a clause boundary within a single command.

Examples:

- `赤い箱を取って、then place it on the table`
- `Pick up the red box, それから棚に置いて`

## Command coverage

Include a balanced selection of:

- pick up
- place
- move
- open
- close
- turn
- stop
- carry
- bring
- walk or navigate

Command slots should include:

- action
- object
- source
- destination
- direction
- quantity
- sequence

## Prompt design rules

- Commands should sound plausible in a human–robot interaction.
- Avoid direct translations that no bilingual speaker would naturally say.
- Avoid tongue twisters unless explicitly marked as stress tests.
- Do not switch languages at every possible word.
- Vary which language is dominant.
- Vary whether the switched span contains the action, object, or destination.
- Do not record copyrighted scripts or private conversations.

## Recording instructions

1. Record in a quiet indoor setting for v0.1.
2. Use the same intended microphone setup documented in metadata.
3. Speak naturally at a normal pace.
4. Read or naturally produce exactly one command.
5. Leave approximately 0.3 seconds before and after speech.
6. Re-record if the clip is clipped, truncated, or contains another person.
7. Do not state your name or personal information.

## Quality review

Each clip must pass:

- consent confirmed;
- file opens;
- WAV, mono, 16 kHz;
- no clipping or truncation;
- no personal information;
- transcript manually verified;
- code-switch category manually verified;
- command labels verified;
- unique `sample_id`;
- metadata complete for required fields.

## Suggested allocation

| Slice | Target |
|---|---:|
| Word-level | 20–35 |
| Phrase-level | 20–35 |
| Clause-level | 20–35 |

Within each slice, aim for both `ja_to_en` and `en_to_ja`.
