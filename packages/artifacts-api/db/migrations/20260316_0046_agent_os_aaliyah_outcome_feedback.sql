alter table if exists aaliyah_operator_queue
  add column if not exists issue_state text,
  add column if not exists last_outcome_type text,
  add column if not exists last_outcome_status text,
  add column if not exists last_outcome_at timestamptz;

create table if not exists aaliyah_outcome_feedback (
  outcome_id text primary key,
  tenant_id uuid not null,
  queue_item_id text not null,
  operator_action_log_id text,
  command_id text,
  canonical_issue_key text not null,
  source_type text not null,
  source_id text not null,
  outcome_type text not null,
  outcome_status text not null,
  reason_code text,
  notes text,
  reported_by_founder_actor_id text not null,
  reported_at timestamptz not null,
  audit_event_id text,
  metadata_json jsonb not null default '{}'::jsonb,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, idempotency_key)
);

create index if not exists aaliyah_outcome_feedback_issue_idx
  on aaliyah_outcome_feedback (tenant_id, canonical_issue_key, reported_at desc);

create index if not exists aaliyah_outcome_feedback_queue_idx
  on aaliyah_outcome_feedback (tenant_id, queue_item_id, reported_at desc);

create index if not exists aaliyah_outcome_feedback_action_idx
  on aaliyah_outcome_feedback (tenant_id, operator_action_log_id, reported_at desc);

create table if not exists aaliyah_issue_state (
  tenant_id uuid not null,
  canonical_issue_key text not null,
  current_state text not null,
  last_outcome_type text,
  last_outcome_status text,
  last_queue_item_id text,
  last_operator_action_log_id text,
  last_command_id text,
  last_updated_at timestamptz not null,
  last_outcome_at timestamptz,
  reopen_count integer not null default 0,
  resolution_count integer not null default 0,
  metadata_json jsonb not null default '{}'::jsonb,
  primary key (tenant_id, canonical_issue_key)
);
