create extension if not exists pgcrypto;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'command-audio',
  'command-audio',
  false,
  10485760,
  array['audio/webm','audio/mp4','audio/mpeg','audio/wav','audio/x-wav','audio/ogg']
)
on conflict (id) do update set public = false;

create table if not exists contributors (
  id uuid primary key default gen_random_uuid(),
  public_code text not null unique,
  primary_language text,
  additional_languages text,
  accent_region text,
  age_band text,
  voice_assistant_familiarity text check (voice_assistant_familiarity in ('none','occasional','frequent','prefer_not_to_say')),
  default_device_category text check (default_device_category in ('phone','laptop','tablet','desktop','prefer_not_to_say')),
  consent_version text,
  consented_at timestamptz,
  created_at timestamptz not null default now(),
  withdrawn_at timestamptz
);

create table if not exists collection_recipes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  version integer not null default 1,
  status text not null check (status in ('draft','active','paused','archived')),
  description text not null,
  contributor_instructions text not null,
  internal_objective text not null,
  consent_version text not null,
  target_accepted_recordings integer not null check (target_accepted_recordings > 0),
  prompts_per_session integer not null check (prompts_per_session between 1 and 20),
  supported_languages text[] not null,
  source_recipe_id uuid references collection_recipes(id),
  source_evaluation_run_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  activated_at timestamptz
);

create table if not exists recipe_quotas (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references collection_recipes(id) on delete cascade,
  dimension text not null,
  dimension_value text not null,
  target_count integer not null check (target_count > 0),
  unique (recipe_id, dimension, dimension_value)
);

create table if not exists command_prompts (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references collection_recipes(id) on delete cascade,
  prompt_mode text not null,
  display_instruction text not null,
  exact_text text,
  language text not null,
  task_type text not null,
  command_variant text not null,
  target_intent text not null,
  slots_json jsonb not null default '{}'::jsonb,
  safety_sensitive boolean not null default false,
  difficulty integer not null check (difficulty between 1 and 5),
  tags text[] not null default '{}',
  display_order integer not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (recipe_id, display_order)
);

create table if not exists recording_sessions (
  id uuid primary key default gen_random_uuid(),
  contributor_id uuid not null references contributors(id),
  recipe_id uuid not null references collection_recipes(id),
  status text not null check (status in ('setup','in_progress','completed','abandoned')),
  environment_type text not null,
  background_noise text,
  microphone_distance text not null,
  device_category text,
  device_metadata_json jsonb not null default '{}'::jsonb,
  expected_interruptions boolean not null default false,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  completion_code text not null unique
);

create table if not exists prompt_assignments (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references recording_sessions(id) on delete cascade,
  prompt_id uuid not null references command_prompts(id),
  assignment_order integer not null,
  status text not null check (status in ('assigned','submitted','skipped')),
  skip_reason text,
  created_at timestamptz not null default now(),
  unique (session_id, prompt_id),
  unique (session_id, assignment_order)
);

create table if not exists recordings (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references recording_sessions(id),
  assignment_id uuid not null unique references prompt_assignments(id),
  contributor_id uuid not null references contributors(id),
  recipe_id uuid not null references collection_recipes(id),
  prompt_id uuid not null references command_prompts(id),
  storage_path text not null unique,
  mime_type text not null,
  file_size_bytes integer not null check (file_size_bytes between 1 and 10485760),
  duration_ms integer not null check (duration_ms between 1 and 25000),
  audio_sample_rate_hz integer,
  channel_count integer,
  client_rms numeric,
  client_peak numeric,
  silence_warning boolean not null default false,
  clipping_warning boolean not null default false,
  input_validity text not null default 'valid_command'
    check (input_validity in ('valid_command','silence','background_noise','music','unintelligible','unrelated_speech')),
  contributor_transcript text not null,
  upload_status text not null check (upload_status in ('uploaded','failed')),
  review_status text not null check (review_status in ('pending','accepted','rejected','removed')),
  submitted_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists quality_reviews (
  id uuid primary key default gen_random_uuid(),
  recording_id uuid not null unique references recordings(id),
  reviewed_transcript text not null,
  decision text not null check (decision in ('accepted','rejected')),
  quality_flags text[] not null,
  rejection_reason text,
  audio_quality_score integer not null check (audio_quality_score between 1 and 5),
  command_compliance_score integer not null check (command_compliance_score between 1 and 5),
  transcript_confidence_score integer not null check (transcript_confidence_score between 1 and 5),
  reviewer_notes text,
  reviewed_at timestamptz not null default now()
);

create table if not exists stt_model_configs (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  display_name text not null,
  model_identifier text not null,
  configuration_json jsonb not null default '{}'::jsonb,
  is_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  unique (provider, model_identifier)
);

create table if not exists evaluation_runs (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references collection_recipes(id),
  name text not null,
  status text not null check (status in ('draft','running','paused','completed','cancelled','failed')),
  selection_filters_json jsonb not null default '{}'::jsonb,
  normalization_profile_json jsonb not null,
  total_recordings integer not null default 0,
  completed_recordings integer not null default 0,
  failed_recordings integer not null default 0,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);

alter table collection_recipes
  add constraint collection_recipes_source_eval_fk
  foreign key (source_evaluation_run_id) references evaluation_runs(id) deferrable initially deferred;

create table if not exists evaluation_run_recordings (
  evaluation_run_id uuid not null references evaluation_runs(id) on delete cascade,
  recording_id uuid not null references recordings(id),
  primary key (evaluation_run_id, recording_id)
);

create table if not exists evaluation_run_models (
  id uuid primary key default gen_random_uuid(),
  evaluation_run_id uuid not null references evaluation_runs(id) on delete cascade,
  stt_model_config_id uuid not null references stt_model_configs(id),
  unique (evaluation_run_id, stt_model_config_id)
);

create table if not exists stt_results (
  id uuid primary key default gen_random_uuid(),
  evaluation_run_id uuid not null references evaluation_runs(id) on delete cascade,
  stt_model_config_id uuid not null references stt_model_configs(id),
  recording_id uuid not null references recordings(id),
  status text not null check (status in ('pending','completed','failed')),
  hypothesis text,
  detected_language text,
  latency_ms integer,
  provider_response_json jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (evaluation_run_id, stt_model_config_id, recording_id)
);

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

create index if not exists idx_recordings_review_status on recordings(review_status);
create index if not exists idx_recordings_recipe on recordings(recipe_id);
create index if not exists idx_recording_sessions_contributor on recording_sessions(contributor_id);
create index if not exists idx_prompts_recipe_language on command_prompts(recipe_id, language);
create index if not exists idx_stt_results_run on stt_results(evaluation_run_id);
create index if not exists idx_metrics_stt_result on evaluation_metrics(stt_result_id);
