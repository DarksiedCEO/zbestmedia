create table if not exists aaliyah_strategic_insights (
  insight_id text primary key,
  tenant_id uuid not null,
  insight_type text not null,
  insight_status text not null,
  title_text text not null,
  summary_text text not null,
  reason_text text not null,
  idempotency_key text not null,
  related_entity_ids_json jsonb not null default '[]'::jsonb,
  related_record_ids_json jsonb not null default '[]'::jsonb,
  audit_event_id text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  evaluated_at timestamptz not null,
  acknowledged_at timestamptz,
  dismissed_at timestamptz,
  unique (tenant_id, idempotency_key)
);

create index if not exists aaliyah_strategic_insights_status_idx
  on aaliyah_strategic_insights (tenant_id, insight_status, created_at desc);
