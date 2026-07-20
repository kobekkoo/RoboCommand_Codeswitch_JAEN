# Provisional Dataset Schema v0.1

The schema is intentionally small enough to export from CommandLoop this weekend. It may evolve in later releases. Every row must include `schema_version`.

## Required fields

| Field | Type | Description |
|---|---|---|
| `file_name` | string | Relative audio filename |
| `sample_id` | string | Stable, non-identifying unique ID |
| `speaker_id` | string | Pseudonymous speaker identifier |
| `transcript` | string | Manually verified reference transcript |
| `matrix_language` | enum | Dominant language: `ja` or `en` |
| `embedded_language` | enum | Embedded language: `ja` or `en` |
| `code_switch_type` | enum | `word`, `phrase`, or `clause` |
| `switch_direction` | enum | `ja_to_en` or `en_to_ja` |
| `command_action` | string | Canonical action label |
| `split` | string | For v0.1: `test` |
| `consent_for_publication` | boolean | Must be `true` before release |
| `schema_version` | string | For this release: `0.1` |

## Recommended fields

| Field | Type | Description |
|---|---|---|
| `command_object` | string | Canonical object label |
| `command_source` | string | Source location |
| `command_destination` | string | Destination location |
| `command_direction` | string | Direction such as left/right |
| `command_quantity` | integer | Quantity when relevant |
| `environment` | string | e.g. `quiet_indoor` |
| `device_type` | string | Broad non-identifying device category |
| `duration_seconds` | float | Audio duration |
| `prompt_id` | string | Prompt or semantic-intent ID |
| `review_status` | string | `pending`, `reviewed`, or `excluded` |
| `notes` | string | Non-sensitive quality note |

## Excluded public fields

Do not publish:

- name
- email
- exact age
- precise address
- account IDs
- IP address
- device serial number
- raw consent document
- exact recording coordinates
- any field that directly identifies a participant

## Example row

```csv
file_name,sample_id,speaker_id,transcript,matrix_language,embedded_language,code_switch_type,switch_direction,command_action,command_object,command_source,command_destination,command_direction,command_quantity,environment,device_type,duration_seconds,prompt_id,split,consent_for_publication,review_status,schema_version,notes
jaen_000001.wav,jaen_000001,speaker_001,赤い box を取って,ja,en,word,ja_to_en,pick_up,red_box,,,,,quiet_indoor,laptop_microphone,,prompt_001,test,true,reviewed,0.1,
```
