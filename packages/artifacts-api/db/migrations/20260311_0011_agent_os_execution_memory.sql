-- 20260311_0011_agent_os_execution_memory.sql
-- AGENT-OS-3/4: execution traces and memory entry persistence

BEGIN;

CREATE TABLE IF NOT EXISTS executions (
  tenant_id uuid NOT NULL,
  execution_id text NOT NULL,
  agent_id text NOT NULL,
  agent_version_id text NOT NULL,
  correlation_id text NOT NULL,
  request_source text NOT NULL,
  requested_by text NOT NULL,
  subject_type text NOT NULL,
  subject_id text NOT NULL,
  status text NOT NULL DEFAULT 'QUEUED',
  input_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  output_payload jsonb NULL,
  failure_class text NULL,
  failure_message text NULL,
  approval_request_id text NULL,
  started_at timestamptz NULL,
  completed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, execution_id),
  CONSTRAINT executions_agent_fk
    FOREIGN KEY (tenant_id, agent_id)
    REFERENCES agents (tenant_id, agent_id)
    ON DELETE CASCADE,
  CONSTRAINT executions_status_check CHECK (status IN ('QUEUED', 'PENDING_APPROVAL', 'RUNNING', 'COMPLETED', 'FAILED'))
);

CREATE TABLE IF NOT EXISTS execution_steps (
  tenant_id uuid NOT NULL,
  execution_step_id text NOT NULL,
  execution_id text NOT NULL,
  step_name text NOT NULL,
  step_order integer NOT NULL,
  status text NOT NULL DEFAULT 'PENDING',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, execution_step_id),
  CONSTRAINT execution_steps_execution_fk
    FOREIGN KEY (tenant_id, execution_id)
    REFERENCES executions (tenant_id, execution_id)
    ON DELETE CASCADE,
  CONSTRAINT execution_steps_status_check CHECK (status IN ('PENDING', 'COMPLETED', 'FAILED', 'SKIPPED'))
);

CREATE TABLE IF NOT EXISTS agent_memory_entries (
  tenant_id uuid NOT NULL,
  memory_entry_id text NOT NULL,
  partition_id text NOT NULL,
  agent_id text NOT NULL,
  collection_name text NOT NULL,
  entry_key text NOT NULL,
  entry_value jsonb NOT NULL DEFAULT '{}'::jsonb,
  classification text NOT NULL,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, memory_entry_id),
  CONSTRAINT agent_memory_entries_partition_fk
    FOREIGN KEY (tenant_id, partition_id)
    REFERENCES agent_memory_partitions (tenant_id, partition_id)
    ON DELETE CASCADE,
  CONSTRAINT agent_memory_entries_agent_fk
    FOREIGN KEY (tenant_id, agent_id)
    REFERENCES agents (tenant_id, agent_id)
    ON DELETE CASCADE,
  CONSTRAINT agent_memory_entries_classification_check CHECK (classification IN ('owned', 'shared_policy')),
  CONSTRAINT agent_memory_entries_unique_key UNIQUE (tenant_id, partition_id, collection_name, entry_key)
);

CREATE INDEX IF NOT EXISTS executions_agent_status_idx
  ON executions (tenant_id, agent_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS execution_steps_execution_idx
  ON execution_steps (tenant_id, execution_id, step_order);

CREATE INDEX IF NOT EXISTS agent_memory_entries_partition_idx
  ON agent_memory_entries (tenant_id, partition_id, collection_name, updated_at DESC);

ALTER TABLE executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE executions FORCE ROW LEVEL SECURITY;
ALTER TABLE execution_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE execution_steps FORCE ROW LEVEL SECURITY;
ALTER TABLE agent_memory_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_memory_entries FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS executions_tenant_isolation ON executions;
CREATE POLICY executions_tenant_isolation
ON executions
FOR ALL
USING (tenant_id = require_tenant_id())
WITH CHECK (tenant_id = require_tenant_id());

DROP POLICY IF EXISTS execution_steps_tenant_isolation ON execution_steps;
CREATE POLICY execution_steps_tenant_isolation
ON execution_steps
FOR ALL
USING (tenant_id = require_tenant_id())
WITH CHECK (tenant_id = require_tenant_id());

DROP POLICY IF EXISTS agent_memory_entries_tenant_isolation ON agent_memory_entries;
CREATE POLICY agent_memory_entries_tenant_isolation
ON agent_memory_entries
FOR ALL
USING (tenant_id = require_tenant_id())
WITH CHECK (tenant_id = require_tenant_id());

COMMIT;
