CREATE TABLE IF NOT EXISTS aaliyah_recommendations (
  recommendation_id text PRIMARY KEY,
  tenant_id uuid NOT NULL,
  source_type text NOT NULL,
  source_id text NOT NULL,
  recommendation_type text NOT NULL,
  recommendation_status text NOT NULL,
  reason_text text NOT NULL,
  summary_text text NOT NULL,
  idempotency_key text NOT NULL,
  related_command_id text,
  related_task_id text,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  audit_event_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  evaluated_at timestamptz NOT NULL,
  UNIQUE (tenant_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS aaliyah_recommendations_source_idx
  ON aaliyah_recommendations (tenant_id, source_type, source_id, created_at DESC);
