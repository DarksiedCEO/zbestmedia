-- 20260311_0012_agent_os_runtime_controls.sql
-- AGENT-OS-6: retry, dead-letter, and approval escalation controls

BEGIN;

ALTER TABLE executions
  ADD COLUMN IF NOT EXISTS retry_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_retries integer NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS next_retry_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS dead_lettered_at timestamptz NULL;

ALTER TABLE eval_runs
  ADD COLUMN IF NOT EXISTS retry_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_retries integer NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS next_retry_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS dead_lettered_at timestamptz NULL;

ALTER TABLE approval_requests
  ADD COLUMN IF NOT EXISTS escalated_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS escalation_count integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS executions_retry_idx
  ON executions (tenant_id, status, next_retry_at)
  WHERE status IN ('QUEUED', 'RUNNING', 'FAILED');

CREATE INDEX IF NOT EXISTS eval_runs_retry_idx
  ON eval_runs (tenant_id, status, next_retry_at)
  WHERE status IN ('PENDING', 'RUNNING', 'FAILED');

CREATE INDEX IF NOT EXISTS approval_requests_escalation_idx
  ON approval_requests (tenant_id, status, escalated_at, created_at DESC)
  WHERE status = 'PENDING';

COMMIT;
