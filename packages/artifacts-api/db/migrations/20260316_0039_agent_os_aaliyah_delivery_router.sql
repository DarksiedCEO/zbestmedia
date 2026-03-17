create table if not exists aaliyah_deliveries (
  delivery_id text primary key,
  tenant_id uuid not null,
  channel text not null,
  source_type text not null,
  source_id text not null,
  delivery_status text not null,
  attempt_count integer not null default 0,
  last_error text,
  idempotency_key text not null,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  unique (tenant_id, idempotency_key)
);

create index if not exists aaliyah_deliveries_source_idx
  on aaliyah_deliveries (tenant_id, source_type, source_id, created_at desc);
