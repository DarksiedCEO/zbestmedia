create table if not exists aaliyah_operator_queue (
  queue_item_id text primary key,
  tenant_id text not null,
  source_type text not null,
  source_id text not null,
  queue_item_type text not null,
  priority_score integer not null,
  priority_band text not null,
  title_text text not null,
  summary_text text not null,
  reason_text text not null,
  idempotency_key text not null,
  related_record_ids_json jsonb not null default '[]'::jsonb,
  related_record_types_json jsonb not null default '[]'::jsonb,
  actionable_command_type text,
  actionable_target_type text,
  actionable_target_id text,
  audit_event_id text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  evaluated_at timestamptz not null,
  unique (tenant_id, idempotency_key)
);

create index if not exists aaliyah_operator_queue_priority_idx
  on aaliyah_operator_queue (tenant_id, priority_band, priority_score desc, created_at desc);
