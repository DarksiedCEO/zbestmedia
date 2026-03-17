create table if not exists aaliyah_opportunities (
  opportunity_id text primary key,
  tenant_id uuid not null,
  source_type text not null,
  source_id text not null,
  opportunity_type text not null,
  opportunity_status text not null,
  reason_text text not null,
  summary_text text not null,
  idempotency_key text not null,
  related_task_id text,
  related_recommendation_id text,
  audit_event_id text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  evaluated_at timestamptz not null,
  acknowledged_at timestamptz,
  dismissed_at timestamptz,
  unique (tenant_id, idempotency_key)
);

create index if not exists aaliyah_opportunities_source_idx
  on aaliyah_opportunities (tenant_id, source_type, source_id, created_at desc);
