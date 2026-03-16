CREATE TABLE IF NOT EXISTS aaliyah_founder_commands (
  command_id text PRIMARY KEY,
  tenant_id uuid NOT NULL,
  request_id text NOT NULL,
  actor_user_id text NOT NULL,
  actor_role text NOT NULL,
  command_type text NOT NULL,
  target_type text NOT NULL,
  target_id text NOT NULL,
  payload_json jsonb NOT NULL,
  idempotency_key text NOT NULL,
  execution_status text NOT NULL,
  summary_text text NOT NULL,
  audit_event_id text,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  executed_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS aaliyah_founder_commands_tenant_idempotency_idx
  ON aaliyah_founder_commands (tenant_id, idempotency_key);

CREATE INDEX IF NOT EXISTS aaliyah_founder_commands_tenant_created_idx
  ON aaliyah_founder_commands (tenant_id, created_at DESC);
