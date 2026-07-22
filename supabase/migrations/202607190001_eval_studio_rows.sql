alter table scorer_configs
  add column if not exists slug text,
  add column if not exists output_type text,
  add column if not exists choice_scores_json jsonb,
  add column if not exists pass_threshold numeric,
  add column if not exists include_rationale boolean not null default true;

create unique index if not exists scorer_configs_slug_idx on scorer_configs(slug) where slug is not null;

create table if not exists eval_dataset_rows (
  id uuid primary key default gen_random_uuid(),
  eval_dataset_id uuid not null references eval_datasets(id) on delete cascade,
  source text not null check (source in ('recording', 'import', 'manual')),
  source_recording_id uuid references recordings(id) on delete set null,
  input_text text not null,
  audio_storage_path text,
  audio_url text,
  human_transcript text not null,
  expected_text text,
  tags text[] not null default '{}'::text[],
  metadata_json jsonb not null default '{}'::jsonb,
  row_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists eval_dataset_rows_dataset_idx on eval_dataset_rows(eval_dataset_id, row_order);
create index if not exists eval_dataset_rows_recording_idx on eval_dataset_rows(source_recording_id);

alter table playground_sessions
  add column if not exists status text check (status in ('queued', 'running', 'completed', 'failed', 'cancelled')),
  add column if not exists progress_pct integer,
  add column if not exists current_step text;

create table if not exists playground_result_rows (
  id uuid primary key default gen_random_uuid(),
  playground_session_id uuid not null references playground_sessions(id) on delete cascade,
  eval_dataset_row_id uuid references eval_dataset_rows(id) on delete set null,
  recording_id uuid references recordings(id) on delete set null,
  stt_model_config_id uuid references stt_model_configs(id) on delete set null,
  status text not null check (status in ('pending', 'completed', 'failed')),
  trace_status text check (trace_status in ('queued', 'transcribing', 'scoring', 'completed', 'failed')),
  input_text text,
  human_transcript text,
  model_transcript text,
  scores_json jsonb not null default '{}'::jsonb,
  scorer_outputs_json jsonb not null default '[]'::jsonb,
  latency_ms integer,
  detected_language text,
  provider_status text,
  error_message text,
  rationale text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists playground_result_rows_session_idx on playground_result_rows(playground_session_id);
create index if not exists playground_result_rows_recording_idx on playground_result_rows(recording_id);
