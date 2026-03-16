CREATE TABLE IF NOT EXISTS aaliyah_follow_through_engine_records (
  record_id TEXT PRIMARY KEY,
  tenant_id UUID NOT NULL,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  policy_key TEXT NOT NULL,
  decision_type TEXT NOT NULL,
  evaluation_status TEXT NOT NULL,
  reason_text TEXT NOT NULL,
  summary_text TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  created_artifact_ids_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  audit_event_id TEXT,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  evaluated_at TIMESTAMPTZ NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS aaliyah_follow_through_engine_records_tenant_idempotency_idx
  ON aaliyah_follow_through_engine_records (tenant_id, idempotency_key);

CREATE INDEX IF NOT EXISTS aaliyah_follow_through_engine_records_source_idx
  ON aaliyah_follow_through_engine_records (tenant_id, source_type, source_id, created_at DESC);
