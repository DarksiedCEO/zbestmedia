-- 20260311_0010_agent_os_foundation.sql
-- AGENT-OS-2: persistence foundation for Brandyn, Jordyn, and Kobe

BEGIN;

CREATE TABLE IF NOT EXISTS agents (
  tenant_id uuid NOT NULL,
  agent_id text NOT NULL,
  display_name text NOT NULL,
  task_domain text NOT NULL,
  workflow_role text NOT NULL,
  policy_profile_id text NOT NULL,
  memory_partition_id text NOT NULL,
  lifecycle_profile_id text NOT NULL,
  eval_profile_id text NOT NULL,
  current_version_id text NOT NULL,
  current_status text NOT NULL DEFAULT 'draft',
  prohibited_domains text[] NOT NULL DEFAULT '{}'::text[],
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  retired_at timestamptz NULL,
  PRIMARY KEY (tenant_id, agent_id),
  CONSTRAINT agents_current_status_check CHECK (current_status IN (
    'draft', 'training', 'validation', 'active', 'supervised',
    'degraded', 'retirement_pending', 'retired', 'replaced'
  ))
);

CREATE TABLE IF NOT EXISTS agent_versions (
  tenant_id uuid NOT NULL,
  agent_version_id text NOT NULL,
  agent_id text NOT NULL,
  version_label text NOT NULL,
  definition_snapshot jsonb NOT NULL,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  replaced_by_version_id text NULL,
  PRIMARY KEY (tenant_id, agent_version_id),
  CONSTRAINT agent_versions_agent_fk
    FOREIGN KEY (tenant_id, agent_id)
    REFERENCES agents (tenant_id, agent_id)
    ON DELETE CASCADE,
  CONSTRAINT agent_versions_unique_label UNIQUE (tenant_id, agent_id, version_label)
);

CREATE TABLE IF NOT EXISTS agent_policy_profiles (
  tenant_id uuid NOT NULL,
  policy_profile_id text NOT NULL,
  agent_id text NOT NULL,
  allowed_capabilities text[] NOT NULL DEFAULT '{}'::text[],
  denied_capabilities text[] NOT NULL DEFAULT '{}'::text[],
  profile_snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, policy_profile_id),
  CONSTRAINT agent_policy_profiles_agent_fk
    FOREIGN KEY (tenant_id, agent_id)
    REFERENCES agents (tenant_id, agent_id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS agent_memory_partitions (
  tenant_id uuid NOT NULL,
  partition_id text NOT NULL,
  agent_id text NOT NULL,
  namespace text NOT NULL,
  owned_collections text[] NOT NULL DEFAULT '{}'::text[],
  shared_access text[] NOT NULL DEFAULT '{}'::text[],
  partition_snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, partition_id),
  CONSTRAINT agent_memory_partitions_agent_fk
    FOREIGN KEY (tenant_id, agent_id)
    REFERENCES agents (tenant_id, agent_id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS agent_lifecycle_events (
  tenant_id uuid NOT NULL,
  lifecycle_event_id text NOT NULL,
  agent_id text NOT NULL,
  from_status text NULL,
  to_status text NOT NULL,
  actor_id text NOT NULL,
  reason text NOT NULL,
  metrics_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, lifecycle_event_id),
  CONSTRAINT agent_lifecycle_events_agent_fk
    FOREIGN KEY (tenant_id, agent_id)
    REFERENCES agents (tenant_id, agent_id)
    ON DELETE CASCADE,
  CONSTRAINT agent_lifecycle_events_to_status_check CHECK (to_status IN (
    'draft', 'training', 'validation', 'active', 'supervised',
    'degraded', 'retirement_pending', 'retired', 'replaced'
  ))
);

CREATE TABLE IF NOT EXISTS approval_requests (
  tenant_id uuid NOT NULL,
  approval_request_id text NOT NULL,
  agent_id text NOT NULL,
  subject_type text NOT NULL,
  subject_id text NOT NULL,
  requested_by text NOT NULL,
  required_approvers text[] NOT NULL DEFAULT '{}'::text[],
  status text NOT NULL DEFAULT 'PENDING',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz NULL,
  PRIMARY KEY (tenant_id, approval_request_id),
  CONSTRAINT approval_requests_agent_fk
    FOREIGN KEY (tenant_id, agent_id)
    REFERENCES agents (tenant_id, agent_id)
    ON DELETE CASCADE,
  CONSTRAINT approval_requests_status_check CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED'))
);

CREATE TABLE IF NOT EXISTS approval_decisions (
  tenant_id uuid NOT NULL,
  approval_decision_id text NOT NULL,
  approval_request_id text NOT NULL,
  approver_id text NOT NULL,
  decision text NOT NULL,
  rationale text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, approval_decision_id),
  CONSTRAINT approval_decisions_request_fk
    FOREIGN KEY (tenant_id, approval_request_id)
    REFERENCES approval_requests (tenant_id, approval_request_id)
    ON DELETE CASCADE,
  CONSTRAINT approval_decisions_decision_check CHECK (decision IN ('APPROVE', 'REJECT'))
);

CREATE TABLE IF NOT EXISTS eval_runs (
  tenant_id uuid NOT NULL,
  eval_run_id text NOT NULL,
  agent_id text NOT NULL,
  agent_version_id text NOT NULL,
  suite_name text NOT NULL,
  status text NOT NULL DEFAULT 'PENDING',
  score_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz NULL,
  PRIMARY KEY (tenant_id, eval_run_id),
  CONSTRAINT eval_runs_agent_fk
    FOREIGN KEY (tenant_id, agent_id)
    REFERENCES agents (tenant_id, agent_id)
    ON DELETE CASCADE,
  CONSTRAINT eval_runs_status_check CHECK (status IN ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED'))
);

CREATE TABLE IF NOT EXISTS eval_scores (
  tenant_id uuid NOT NULL,
  eval_score_id text NOT NULL,
  eval_run_id text NOT NULL,
  metric text NOT NULL,
  score double precision NOT NULL,
  threshold_min double precision NULL,
  threshold_max double precision NULL,
  passed boolean NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, eval_score_id),
  CONSTRAINT eval_scores_run_fk
    FOREIGN KEY (tenant_id, eval_run_id)
    REFERENCES eval_runs (tenant_id, eval_run_id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS agents_status_idx
  ON agents (tenant_id, current_status);

CREATE INDEX IF NOT EXISTS agent_lifecycle_events_agent_idx
  ON agent_lifecycle_events (tenant_id, agent_id, created_at DESC);

CREATE INDEX IF NOT EXISTS approval_requests_status_idx
  ON approval_requests (tenant_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS eval_runs_agent_idx
  ON eval_runs (tenant_id, agent_id, created_at DESC);

ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents FORCE ROW LEVEL SECURITY;
ALTER TABLE agent_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_versions FORCE ROW LEVEL SECURITY;
ALTER TABLE agent_policy_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_policy_profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE agent_memory_partitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_memory_partitions FORCE ROW LEVEL SECURITY;
ALTER TABLE agent_lifecycle_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_lifecycle_events FORCE ROW LEVEL SECURITY;
ALTER TABLE approval_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_requests FORCE ROW LEVEL SECURITY;
ALTER TABLE approval_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_decisions FORCE ROW LEVEL SECURITY;
ALTER TABLE eval_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE eval_runs FORCE ROW LEVEL SECURITY;
ALTER TABLE eval_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE eval_scores FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agents_tenant_isolation ON agents;
CREATE POLICY agents_tenant_isolation
ON agents
FOR ALL
USING (tenant_id = require_tenant_id())
WITH CHECK (tenant_id = require_tenant_id());

DROP POLICY IF EXISTS agent_versions_tenant_isolation ON agent_versions;
CREATE POLICY agent_versions_tenant_isolation
ON agent_versions
FOR ALL
USING (tenant_id = require_tenant_id())
WITH CHECK (tenant_id = require_tenant_id());

DROP POLICY IF EXISTS agent_policy_profiles_tenant_isolation ON agent_policy_profiles;
CREATE POLICY agent_policy_profiles_tenant_isolation
ON agent_policy_profiles
FOR ALL
USING (tenant_id = require_tenant_id())
WITH CHECK (tenant_id = require_tenant_id());

DROP POLICY IF EXISTS agent_memory_partitions_tenant_isolation ON agent_memory_partitions;
CREATE POLICY agent_memory_partitions_tenant_isolation
ON agent_memory_partitions
FOR ALL
USING (tenant_id = require_tenant_id())
WITH CHECK (tenant_id = require_tenant_id());

DROP POLICY IF EXISTS agent_lifecycle_events_tenant_isolation ON agent_lifecycle_events;
CREATE POLICY agent_lifecycle_events_tenant_isolation
ON agent_lifecycle_events
FOR ALL
USING (tenant_id = require_tenant_id())
WITH CHECK (tenant_id = require_tenant_id());

DROP POLICY IF EXISTS approval_requests_tenant_isolation ON approval_requests;
CREATE POLICY approval_requests_tenant_isolation
ON approval_requests
FOR ALL
USING (tenant_id = require_tenant_id())
WITH CHECK (tenant_id = require_tenant_id());

DROP POLICY IF EXISTS approval_decisions_tenant_isolation ON approval_decisions;
CREATE POLICY approval_decisions_tenant_isolation
ON approval_decisions
FOR ALL
USING (tenant_id = require_tenant_id())
WITH CHECK (tenant_id = require_tenant_id());

DROP POLICY IF EXISTS eval_runs_tenant_isolation ON eval_runs;
CREATE POLICY eval_runs_tenant_isolation
ON eval_runs
FOR ALL
USING (tenant_id = require_tenant_id())
WITH CHECK (tenant_id = require_tenant_id());

DROP POLICY IF EXISTS eval_scores_tenant_isolation ON eval_scores;
CREATE POLICY eval_scores_tenant_isolation
ON eval_scores
FOR ALL
USING (tenant_id = require_tenant_id())
WITH CHECK (tenant_id = require_tenant_id());

COMMIT;
