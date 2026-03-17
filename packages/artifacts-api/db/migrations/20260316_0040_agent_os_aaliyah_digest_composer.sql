create table if not exists aaliyah_digests (
  digest_id text primary key,
  tenant_id uuid not null,
  digest_type text not null,
  digest_status text not null,
  title_text text not null,
  summary_text text not null,
  body_text text not null,
  idempotency_key text not null,
  related_notification_ids_json jsonb not null default '[]'::jsonb,
  related_opportunity_ids_json jsonb not null default '[]'::jsonb,
  related_insight_ids_json jsonb not null default '[]'::jsonb,
  related_recommendation_ids_json jsonb not null default '[]'::jsonb,
  related_follow_through_ids_json jsonb not null default '[]'::jsonb,
  delivery_record_ids_json jsonb not null default '[]'::jsonb,
  audit_event_id text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  composed_at timestamptz not null,
  sent_at timestamptz,
  unique (tenant_id, idempotency_key)
);

create index if not exists aaliyah_digests_type_idx
  on aaliyah_digests (tenant_id, digest_type, created_at desc);
