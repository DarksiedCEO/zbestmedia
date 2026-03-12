-- 20260312_0019_agent_os_incidents.sql
-- AGENT-OS-10: durable Code Sentinel incident pipeline

BEGIN;

CREATE TABLE IF NOT EXISTS incidents (
  tenant_id uuid NOT NULL,
  incident_id text NOT NULL,
  incident_type text NOT NULL,
  severity text NOT NULL,
  status text NOT NULL,
  owning_executive_id text NOT NULL,
  owning_department_id text NOT NULL,
  owning_lead_agent_id text NOT NULL,
  owning_sub_agent_id text NOT NULL,
  source_system text NOT NULL,
  related_signal_type text NULL,
  related_assignment_record_id text NULL,
  related_run_record_id text NULL,
  title text NOT NULL,
  summary text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  recommended_action text NOT NULL,
  release_blocking boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  acknowledged_at timestamptz NULL,
  acknowledged_by text NULL,
  resolved_at timestamptz NULL,
  resolved_by text NULL,
  resolution_note text NULL,
  PRIMARY KEY (tenant_id, incident_id),
  CONSTRAINT incidents_type_check CHECK (
    incident_type IN (
      'build_integrity_failure',
      'dependency_integrity_failure',
      'runtime_health_failure',
      'migration_integrity_failure',
      'route_contract_failure',
      'slo_integrity_failure',
      'execution_policy_failure',
      'execution_runtime_failure'
    )
  ),
  CONSTRAINT incidents_severity_check CHECK (severity IN ('info', 'warning', 'critical')),
  CONSTRAINT incidents_status_check CHECK (status IN ('open', 'acknowledged', 'resolved')),
  CONSTRAINT incidents_assignment_fk
    FOREIGN KEY (tenant_id, related_assignment_record_id)
    REFERENCES assignment_records (tenant_id, assignment_record_id)
    ON DELETE SET NULL,
  CONSTRAINT incidents_run_fk
    FOREIGN KEY (tenant_id, related_run_record_id)
    REFERENCES execution_run_records (tenant_id, run_record_id)
    ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS incidents_status_idx
  ON incidents (tenant_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS incidents_severity_idx
  ON incidents (tenant_id, severity, created_at DESC);

CREATE INDEX IF NOT EXISTS incidents_type_idx
  ON incidents (tenant_id, incident_type, created_at DESC);

ALTER TABLE incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE incidents FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS incidents_tenant_isolation ON incidents;
CREATE POLICY incidents_tenant_isolation
ON incidents
FOR ALL
USING (tenant_id = require_tenant_id())
WITH CHECK (tenant_id = require_tenant_id());

COMMIT;
