BEGIN;

ALTER TABLE agency.policy_versions
ADD COLUMN IF NOT EXISTS client_id uuid NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'policy_campaign_requires_client_id'
  ) THEN
    ALTER TABLE agency.policy_versions
    ADD CONSTRAINT policy_campaign_requires_client_id
    CHECK (
      (scope_type <> 'campaign')
      OR (scope_type = 'campaign' AND client_id IS NOT NULL)
    );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_policy_campaign_client_active
ON agency.policy_versions (tenant_id, client_id, policy_key, effective_at DESC)
WHERE scope_type = 'campaign' AND status = 'active';

COMMIT;
