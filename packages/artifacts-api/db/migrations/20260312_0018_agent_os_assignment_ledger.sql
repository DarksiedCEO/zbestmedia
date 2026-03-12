-- 20260312_0018_agent_os_assignment_ledger.sql
-- AGENT-OS-9: durable assignment ledger and execution run records

BEGIN;

CREATE TABLE IF NOT EXISTS assignment_records (
  tenant_id uuid NOT NULL,
  assignment_record_id text NOT NULL,
  manifest_version text NOT NULL,
  correlation_id text NOT NULL,
  request_source text NOT NULL,
  requested_by text NOT NULL,
  requested_task_category text NULL,
  requested_responsibility_key text NULL,
  request_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  requested_execution_target text NULL,
  resolved_executive_id text NULL,
  resolved_department_id text NULL,
  resolved_lead_agent_id text NULL,
  resolved_sub_agent_id text NULL,
  execution_agent_id text NULL,
  policy_decision text NOT NULL,
  policy_decision_reason text NOT NULL,
  routing_decision jsonb NULL,
  routing_trace jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, assignment_record_id),
  CONSTRAINT assignment_records_policy_decision_check CHECK (policy_decision IN ('approved', 'rejected'))
);

CREATE TABLE IF NOT EXISTS execution_run_records (
  tenant_id uuid NOT NULL,
  run_record_id text NOT NULL,
  assignment_record_id text NOT NULL,
  execution_id text NULL,
  current_state text NOT NULL,
  requested_at timestamptz NOT NULL,
  validated_at timestamptz NULL,
  routed_at timestamptz NULL,
  blocked_at timestamptz NULL,
  execution_started_at timestamptz NULL,
  retriable_at timestamptz NULL,
  execution_ended_at timestamptz NULL,
  failure_category text NULL,
  failure_message text NULL,
  retryable boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, run_record_id),
  CONSTRAINT execution_run_records_assignment_fk
    FOREIGN KEY (tenant_id, assignment_record_id)
    REFERENCES assignment_records (tenant_id, assignment_record_id)
    ON DELETE CASCADE,
  CONSTRAINT execution_run_records_execution_fk
    FOREIGN KEY (tenant_id, execution_id)
    REFERENCES executions (tenant_id, execution_id)
    ON DELETE SET NULL,
  CONSTRAINT execution_run_records_state_check
    CHECK (current_state IN ('requested', 'validated', 'routed', 'blocked', 'executing', 'retriable', 'succeeded', 'failed'))
);

CREATE INDEX IF NOT EXISTS assignment_records_created_idx
  ON assignment_records (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS execution_run_records_state_idx
  ON execution_run_records (tenant_id, current_state, created_at DESC);

CREATE INDEX IF NOT EXISTS execution_run_records_execution_idx
  ON execution_run_records (tenant_id, execution_id);

ALTER TABLE assignment_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignment_records FORCE ROW LEVEL SECURITY;
ALTER TABLE execution_run_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE execution_run_records FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS assignment_records_tenant_isolation ON assignment_records;
CREATE POLICY assignment_records_tenant_isolation
ON assignment_records
FOR ALL
USING (tenant_id = require_tenant_id())
WITH CHECK (tenant_id = require_tenant_id());

DROP POLICY IF EXISTS execution_run_records_tenant_isolation ON execution_run_records;
CREATE POLICY execution_run_records_tenant_isolation
ON execution_run_records
FOR ALL
USING (tenant_id = require_tenant_id())
WITH CHECK (tenant_id = require_tenant_id());

COMMIT;
