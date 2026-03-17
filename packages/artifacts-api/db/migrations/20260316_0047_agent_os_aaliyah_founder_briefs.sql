alter table if exists aaliyah_founder_brief
  add column if not exists idempotency_key text;

create table if not exists aaliyah_founder_brief (
  brief_id text primary key,
  tenant_id text not null,
  brief_date date not null,
  brief_kind text not null,
  generated_by_founder_actor_id text not null,
  generated_at timestamptz not null,
  window_start_at timestamptz not null,
  window_end_at timestamptz not null,
  headline text not null,
  summary_json jsonb not null default '{}'::jsonb,
  idempotency_key text not null,
  previous_brief_id text,
  delivery_status text not null,
  last_dispatched_at timestamptz,
  audit_event_id text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (tenant_id, idempotency_key)
);

create index if not exists aaliyah_founder_brief_tenant_generated_idx
  on aaliyah_founder_brief (tenant_id, generated_at desc);

create index if not exists aaliyah_founder_brief_tenant_date_idx
  on aaliyah_founder_brief (tenant_id, brief_date desc);

create table if not exists aaliyah_founder_brief_item (
  brief_item_id text primary key,
  tenant_id text not null,
  brief_id text not null,
  section text not null,
  queue_item_id text,
  canonical_issue_key text,
  operator_action_log_id text,
  outcome_feedback_id text,
  priority_score integer not null,
  delta_type text not null,
  payload_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists aaliyah_founder_brief_item_brief_idx
  on aaliyah_founder_brief_item (tenant_id, brief_id);

create index if not exists aaliyah_founder_brief_item_issue_idx
  on aaliyah_founder_brief_item (tenant_id, canonical_issue_key);
