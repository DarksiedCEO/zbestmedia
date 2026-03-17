CREATE TABLE IF NOT EXISTS aaliyah_notifications (
  notification_id text PRIMARY KEY,
  tenant_id uuid NOT NULL,
  source_type text NOT NULL,
  source_id text NOT NULL,
  notification_type text NOT NULL,
  severity text NOT NULL,
  notification_status text NOT NULL,
  title_text text NOT NULL,
  summary_text text NOT NULL,
  reason_text text NOT NULL,
  idempotency_key text NOT NULL,
  related_recommendation_id text,
  related_task_id text,
  audit_event_id text,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  evaluated_at timestamptz NOT NULL,
  acknowledged_at timestamptz,
  dismissed_at timestamptz,
  UNIQUE (tenant_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS aaliyah_notifications_status_idx
  ON aaliyah_notifications (tenant_id, notification_status, created_at DESC);

CREATE INDEX IF NOT EXISTS aaliyah_notifications_source_idx
  ON aaliyah_notifications (tenant_id, source_type, source_id, created_at DESC);
