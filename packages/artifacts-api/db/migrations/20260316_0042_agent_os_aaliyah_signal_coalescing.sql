create table if not exists aaliyah_coalesced_signals (
  signal_id text primary key,
  tenant_id text not null,
  signal_type text not null,
  signal_status text not null,
  title_text text not null,
  summary_text text not null,
  reason_text text not null,
  idempotency_key text not null,
  source_record_ids_json jsonb not null default '[]'::jsonb,
  source_record_types_json jsonb not null default '[]'::jsonb,
  dominant_source_type text not null,
  suppressed_record_ids_json jsonb not null default '[]'::jsonb,
  audit_event_id text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  evaluated_at timestamptz not null,
  acknowledged_at timestamptz,
  dismissed_at timestamptz,
  unique (tenant_id, idempotency_key)
);

create index if not exists aaliyah_coalesced_signals_status_idx
  on aaliyah_coalesced_signals (tenant_id, signal_status, created_at desc);
