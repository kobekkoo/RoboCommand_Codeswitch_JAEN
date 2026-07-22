create table if not exists eval_datasets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  recipe_id uuid references collection_recipes(id) on delete set null,
  selection_filters_json jsonb not null default '{}'::jsonb,
  recording_ids uuid[] not null default '{}'::uuid[],
  tags text[] not null default '{}'::text[],
  row_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists eval_datasets_recipe_id_idx on eval_datasets(recipe_id);
create index if not exists eval_datasets_created_at_idx on eval_datasets(created_at desc);

create table if not exists scorer_configs (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  scorer_type text not null check (scorer_type in ('deterministic', 'llm_judge', 'human_review')),
  description text not null,
  metric_keys text[] not null default '{}'::text[],
  rubric_text text,
  judge_model text,
  thresholds_json jsonb not null default '{}'::jsonb,
  is_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists scorer_configs_enabled_idx on scorer_configs(is_enabled);

create table if not exists playground_sessions (
  id uuid primary key default gen_random_uuid(),
  name text,
  eval_dataset_id uuid references eval_datasets(id) on delete set null,
  sample_recording_ids uuid[] not null default '{}'::uuid[],
  model_config_ids uuid[] not null default '{}'::uuid[],
  scorer_config_ids uuid[] not null default '{}'::uuid[],
  task_config_json jsonb not null default '{}'::jsonb,
  results_json jsonb not null default '[]'::jsonb,
  promoted_evaluation_run_id uuid references evaluation_runs(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists playground_sessions_eval_dataset_id_idx on playground_sessions(eval_dataset_id);
create index if not exists playground_sessions_created_at_idx on playground_sessions(created_at desc);

create table if not exists experiment_snapshots (
  id uuid primary key default gen_random_uuid(),
  evaluation_run_id uuid not null unique references evaluation_runs(id) on delete cascade,
  eval_dataset_id uuid references eval_datasets(id) on delete set null,
  task_config_json jsonb not null default '{}'::jsonb,
  scorer_config_ids uuid[] not null default '{}'::uuid[],
  frozen_dataset_json jsonb not null default '{}'::jsonb,
  frozen_scorers_json jsonb not null default '{}'::jsonb,
  cost_estimate_usd numeric,
  created_at timestamptz not null default now()
);

create index if not exists experiment_snapshots_eval_dataset_id_idx on experiment_snapshots(eval_dataset_id);
create index if not exists experiment_snapshots_created_at_idx on experiment_snapshots(created_at desc);

alter table evaluation_metrics
  add column if not exists scorer_scores_json jsonb,
  add column if not exists scorer_rationale text;
