BEGIN;

CREATE SCHEMA IF NOT EXISTS agency;

CREATE TABLE IF NOT EXISTS agency.policy_versions (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  scope_type TEXT NOT NULL,
  scope_id UUID NULL,
  policy_key TEXT NOT NULL,
  value_json JSONB NOT NULL,
  version INTEGER NOT NULL,
  status TEXT NOT NULL,
  effective_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NULL,
  change_reason TEXT NOT NULL,
  created_by TEXT NOT NULL,
  sealed_hash TEXT NOT NULL,
  supersedes_id UUID NULL,
  superseded_by_id UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT policy_versions_scope_type_chk CHECK (scope_type IN ('global', 'client', 'campaign')),
  CONSTRAINT policy_versions_status_chk CHECK (status IN ('draft', 'pending_approval', 'active', 'superseded', 'expired', 'rejected')),
  CONSTRAINT policy_versions_scope_id_chk CHECK (
    (scope_type = 'global' AND scope_id IS NULL)
    OR (scope_type IN ('client', 'campaign') AND scope_id IS NOT NULL)
  ),
  CONSTRAINT policy_versions_campaign_expiry_chk CHECK (
    (scope_type != 'campaign') OR expires_at IS NOT NULL
  )
);

CREATE TABLE IF NOT EXISTS agency.policy_approvals (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  policy_version_id UUID NOT NULL REFERENCES agency.policy_versions(id) ON DELETE CASCADE,
  required_role TEXT NOT NULL,
  decision TEXT NOT NULL,
  decided_by TEXT NULL,
  decided_at TIMESTAMPTZ NULL,
  notes TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT policy_approvals_required_role_chk CHECK (required_role IN ('sebastian', 'finance', 'legal', 'ceo')),
  CONSTRAINT policy_approvals_decision_chk CHECK (decision IN ('pending', 'approved', 'rejected'))
);

CREATE TABLE IF NOT EXISTS agency.policy_audit_log (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  policy_version_id UUID NOT NULL REFERENCES agency.policy_versions(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  details_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT policy_audit_event_type_chk CHECK (event_type IN ('created', 'submitted', 'approved', 'rejected', 'activated', 'expired', 'superseded', 'rolled_back'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_policy_versions_unique_version
  ON agency.policy_versions (tenant_id, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid), policy_key, version);

CREATE INDEX IF NOT EXISTS idx_policy_versions_scope_status
  ON agency.policy_versions (tenant_id, scope_type, scope_id, policy_key, status);

CREATE INDEX IF NOT EXISTS idx_policy_versions_key_effective
  ON agency.policy_versions (tenant_id, policy_key, effective_at DESC);

CREATE INDEX IF NOT EXISTS idx_policy_versions_scope_expiry
  ON agency.policy_versions (tenant_id, scope_type, scope_id, expires_at);

CREATE INDEX IF NOT EXISTS idx_policy_versions_active_partial
  ON agency.policy_versions (tenant_id, scope_type, scope_id, policy_key, effective_at DESC)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_policy_approvals_role
  ON agency.policy_approvals (policy_version_id, required_role);

CREATE INDEX IF NOT EXISTS idx_policy_audit_tenant_ts
  ON agency.policy_audit_log (tenant_id, ts DESC);

CREATE INDEX IF NOT EXISTS idx_policy_audit_version_ts
  ON agency.policy_audit_log (policy_version_id, ts);

ALTER TABLE agency.policy_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE agency.policy_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE agency.policy_audit_log ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'agency' AND tablename = 'policy_versions' AND policyname = 'agency_policy_versions_tenant_isolation'
  ) THEN
    CREATE POLICY agency_policy_versions_tenant_isolation ON agency.policy_versions
      USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
      WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'agency' AND tablename = 'policy_approvals' AND policyname = 'agency_policy_approvals_tenant_isolation'
  ) THEN
    CREATE POLICY agency_policy_approvals_tenant_isolation ON agency.policy_approvals
      USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
      WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'agency' AND tablename = 'policy_audit_log' AND policyname = 'agency_policy_audit_tenant_isolation'
  ) THEN
    CREATE POLICY agency_policy_audit_tenant_isolation ON agency.policy_audit_log
      USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
      WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
  END IF;
END $$;

COMMIT;
