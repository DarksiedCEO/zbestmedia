CREATE OR REPLACE FUNCTION require_tenant_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  tenant_value text;
BEGIN
  tenant_value := current_setting('app.tenant_id', true);

  IF tenant_value IS NULL OR tenant_value = '' THEN
    RAISE EXCEPTION 'app.tenant_id is required';
  END IF;

  RETURN tenant_value::uuid;
EXCEPTION
  WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'app.tenant_id must be a valid uuid';
END;
$$;

CREATE TABLE IF NOT EXISTS artifacts (
  tenant_id uuid NOT NULL,
  artifact_id text NOT NULL,
  artifact_type text NOT NULL,
  schema_version int NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  sealed_at timestamptz NOT NULL,
  signature text NOT NULL,
  source_artifact_ids text[] NOT NULL DEFAULT '{}'::text[],
  supersedes_artifact_id text NULL,
  eval_report jsonb NOT NULL,
  payload jsonb NOT NULL,
  PRIMARY KEY (tenant_id, artifact_id)
);

ALTER TABLE artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE artifacts FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS artifacts_tenant_isolation ON artifacts;
CREATE POLICY artifacts_tenant_isolation
ON artifacts
FOR ALL
USING (tenant_id = require_tenant_id())
WITH CHECK (tenant_id = require_tenant_id());

REVOKE UPDATE, DELETE ON TABLE artifacts FROM PUBLIC;
