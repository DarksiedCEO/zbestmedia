-- 002_artifacts_determinism_input.sql
-- Pack 4.1: persist determinism input for replayability

BEGIN;

ALTER TABLE artifacts
  ADD COLUMN IF NOT EXISTS determinism_input jsonb;

UPDATE artifacts
SET determinism_input = jsonb_build_object(
  'artifactType', artifact_type,
  'schemaVersion', schema_version,
  'sourceArtifactIds', to_jsonb(source_artifact_ids),
  'evalReport', eval_report,
  'payload', payload,
  'sealedAt', to_jsonb(sealed_at),
  'supersedesArtifactId', to_jsonb(supersedes_artifact_id)
)
WHERE determinism_input IS NULL;

ALTER TABLE artifacts
  ALTER COLUMN determinism_input SET NOT NULL;

COMMIT;
