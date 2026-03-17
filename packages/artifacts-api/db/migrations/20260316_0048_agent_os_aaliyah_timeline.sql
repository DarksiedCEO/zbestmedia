create table if not exists aaliyah_timeline_event (
  timeline_event_id text primary key,
  tenant_id text not null,
  event_type text not null,
  event_at timestamptz not null,
  canonical_issue_key text,
  queue_item_id text,
  operator_action_log_id text,
  outcome_feedback_id text,
  brief_id text,
  source_type text not null,
  source_id text not null,
  decision_class text not null,
  severity text not null,
  title_text text not null,
  summary_text text not null,
  payload_json jsonb not null default '{}'::jsonb,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, idempotency_key)
);

create index if not exists idx_aaliyah_timeline_event_tenant_event_at
  on aaliyah_timeline_event (tenant_id, event_at desc);

create index if not exists idx_aaliyah_timeline_event_issue
  on aaliyah_timeline_event (tenant_id, canonical_issue_key, event_at desc);

create index if not exists idx_aaliyah_timeline_event_type
  on aaliyah_timeline_event (tenant_id, event_type, event_at desc);

create index if not exists idx_aaliyah_timeline_event_brief
  on aaliyah_timeline_event (tenant_id, brief_id);

create index if not exists idx_aaliyah_timeline_event_queue_item
  on aaliyah_timeline_event (tenant_id, queue_item_id);
