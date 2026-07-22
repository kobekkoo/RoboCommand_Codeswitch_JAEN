create table if not exists evaluation_metrics (
  id uuid primary key default gen_random_uuid(),
  stt_result_id uuid not null unique references stt_results(id) on delete cascade,
  reference_normalized text not null,
  hypothesis_normalized text not null,
  word_error_rate numeric not null,
  character_error_rate numeric not null,
  exact_match boolean not null,
  insertions integer not null,
  deletions integer not null,
  substitutions integer not null,
  reference_word_count integer not null,
  reference_character_count integer not null,
  mixed_error_rate numeric,
  overgeneration_rate numeric,
  semantic_risk_flags text[],
  linguistic_category text
);

create index if not exists idx_metrics_stt_result on evaluation_metrics(stt_result_id);
