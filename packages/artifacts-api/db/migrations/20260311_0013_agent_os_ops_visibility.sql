-- 20260311_0013_agent_os_ops_visibility.sql
-- AGENT-OS-15: replay export history and worker heartbeat visibility

BEGIN;

CREATE TABLE IF NOT EXISTS orchestration_bundle_exports (
  tenant_id uuid NOT NULL,
  export_id text NOT NULL,
  execution_id text NOT NULL,
  exported_by text NOT NULL,
  payload_hash text NOT NULL,
  signature text NOT NULL,
  sealed_at timestamptz NOT NULL,
  bundle_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, export_id),
  CONSTRAINT orchestration_bundle_exports_execution_fk
    FOREIGN KEY (tenant_id, execution_id)
    REFERENCES executions (tenant_id, execution_id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS worker_heartbeats (
  tenant_id uuid NOT NULL,
  worker_heartbeat_id text NOT NULL,
  worker_id text NOT NULL,
  worker_kind text NOT NULL,
  agent_id text NULL,
  status text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  observed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, worker_heartbeat_id)
);

CREATE INDEX IF NOT EXISTS orchestration_bundle_exports_execution_idx
  ON orchestration_bundle_exports (tenant_id, execution_id, created_at DESC);

CREATE INDEX IF NOT EXISTS worker_heartbeats_worker_idx
  ON worker_heartbeats (tenant_id, worker_kind, worker_id, observed_at DESC);

ALTER TABLE orchestration_bundle_exports ENABLE ROW LEVEL SECURITY;
ALTER TABLE orchestration_bundle_exports FORCE ROW LEVEL SECURITY;
ALTER TABLE worker_heartbeats ENABLE ROW LEVEL SECURITY;
ALTER TABLE worker_heartbeats FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS orchestration_bundle_exports_tenant_isolation ON orchestration_bundle_exports;
CREATE POLICY orchestration_bundle_exports_tenant_isolation
ON orchestration_bundle_exports
FOR ALL
USING (tenant_id = require_tenant_id())
WITH CHECK (tenant_id = require_tenant_id());

DROP POLICY IF EXISTS worker_heartbeats_tenant_isolation ON worker_heartbeats;
CREATE POLICY worker_heartbeats_tenant_isolation
ON worker_heartbeats
FOR ALL
USING (tenant_id = require_tenant_id())
WITH CHECK (tenant_id = require_tenant_id());

COMMIT;
