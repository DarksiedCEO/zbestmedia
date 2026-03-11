-- 20260311_0014_agent_os_alert_acks.sql
-- AGENT-OS-16: alert acknowledgement persistence

BEGIN;

CREATE TABLE IF NOT EXISTS orchestration_alert_acks (
  tenant_id uuid NOT NULL,
  alert_ack_id text NOT NULL,
  alert_code text NOT NULL,
  acknowledged_by text NOT NULL,
  reason text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, alert_ack_id)
);

CREATE INDEX IF NOT EXISTS orchestration_alert_acks_code_idx
  ON orchestration_alert_acks (tenant_id, alert_code, created_at DESC);

ALTER TABLE orchestration_alert_acks ENABLE ROW LEVEL SECURITY;
ALTER TABLE orchestration_alert_acks FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS orchestration_alert_acks_tenant_isolation ON orchestration_alert_acks;
CREATE POLICY orchestration_alert_acks_tenant_isolation
ON orchestration_alert_acks
FOR ALL
USING (tenant_id = require_tenant_id())
WITH CHECK (tenant_id = require_tenant_id());

COMMIT;
