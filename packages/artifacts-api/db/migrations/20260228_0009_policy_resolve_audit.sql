BEGIN;

CREATE TABLE IF NOT EXISTS agency.policy_resolve_audit (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  correlation_id TEXT NOT NULL,
  client_id UUID NULL,
  campaign_id UUID NULL,
  role TEXT NULL,
  policy_key TEXT NOT NULL,
  resolution_hash TEXT NULL,
  active_version INTEGER NULL,
  contract_version TEXT NOT NULL,
  receipt_kid TEXT NULL,
  receipt_sig_present BOOLEAN NOT NULL DEFAULT FALSE,
  issued_at TIMESTAMPTZ NULL,
  expires_at TIMESTAMPTZ NULL,
  resolved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  details_json JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_policy_resolve_audit_tenant_ts
  ON agency.policy_resolve_audit (tenant_id, resolved_at DESC);

CREATE INDEX IF NOT EXISTS idx_policy_resolve_audit_tenant_correlation
  ON agency.policy_resolve_audit (tenant_id, correlation_id);

CREATE INDEX IF NOT EXISTS idx_policy_resolve_audit_resolution_hash
  ON agency.policy_resolve_audit (tenant_id, resolution_hash, resolved_at DESC);

ALTER TABLE agency.policy_resolve_audit ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'agency'
      AND tablename = 'policy_resolve_audit'
      AND policyname = 'agency_policy_resolve_audit_tenant_isolation'
  ) THEN
    CREATE POLICY agency_policy_resolve_audit_tenant_isolation
      ON agency.policy_resolve_audit
      USING (tenant_id = current_setting('app.tenant_id')::uuid)
      WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid);
  END IF;
END $$;

COMMIT;
