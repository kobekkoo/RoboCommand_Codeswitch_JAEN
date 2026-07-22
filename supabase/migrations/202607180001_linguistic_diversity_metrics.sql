alter table evaluation_metrics
  add column if not exists mixed_error_rate numeric,
  add column if not exists overgeneration_rate numeric,
  add column if not exists semantic_risk_flags text[],
  add column if not exists linguistic_category text;

