alter table recordings
  add column if not exists input_validity text not null default 'valid_command';

alter table recordings
  drop constraint if exists recordings_input_validity_check;

alter table recordings
  add constraint recordings_input_validity_check
  check (
    input_validity in (
      'valid_command',
      'silence',
      'background_noise',
      'music',
      'unintelligible',
      'unrelated_speech'
    )
  );

create index if not exists recordings_input_validity_idx
  on recordings (input_validity);
