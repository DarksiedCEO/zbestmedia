alter table if exists aaliyah_founder_preference_controls
  add column if not exists escalation_json jsonb not null default '{"criticalEscalationHours":24,"blockedPatternEscalationCount":3,"clusterPressureThreshold":4,"missedFollowUpEscalationHours":72,"attentionOverloadThreshold":5}'::jsonb;

create table if not exists aaliyah_escalations (
  escalation_id text primary key,
  tenant_id text not null,
  escalation_type text not null,
  escalation_status text not null,
  escalation_level text not null,
  title_text text not null,
  summary_text text not null,
  reason_text text not null,
  idempotency_key text not null,
  source_record_ids_json jsonb not null default '[]'::jsonb,
  source_record_types_json jsonb not null default '[]'::jsonb,
  related_cluster_id text,
  audit_event_id text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  evaluated_at timestamptz not null,
  acknowledged_at timestamptz,
  dismissed_at timestamptz,
  resolved_at timestamptz,
  unique (tenant_id, idempotency_key)
);

create index if not exists aaliyah_escalations_status_idx
  on aaliyah_escalations (tenant_id, escalation_status, created_at desc);
