-- 20260311_0015_agent_os_alert_ack_reopen.sql
-- AGENT-OS-17: acknowledgement expiration and reopen lifecycle

BEGIN;

ALTER TABLE orchestration_alert_acks
  ADD COLUMN IF NOT EXISTS reopened_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS reopened_by text NULL,
  ADD COLUMN IF NOT EXISTS reopen_reason text NULL;

CREATE INDEX IF NOT EXISTS orchestration_alert_acks_reopened_idx
  ON orchestration_alert_acks (tenant_id, alert_code, reopened_at DESC, created_at DESC);

COMMIT;
