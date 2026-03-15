BEGIN;

ALTER TABLE aaliyah_follow_through_records
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;

DROP INDEX IF EXISTS idx_aaliyah_follow_through_source;

CREATE UNIQUE INDEX IF NOT EXISTS idx_aaliyah_follow_through_source_unique
  ON aaliyah_follow_through_records (tenant_id, actor_id, principal_context, source_item_id);

CREATE INDEX IF NOT EXISTS idx_aaliyah_follow_through_source
  ON aaliyah_follow_through_records (tenant_id, actor_id, principal_context, source_item_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS aaliyah_mutation_idempotency (
  tenant_id uuid NOT NULL,
  actor_id text NOT NULL,
  principal_context text NOT NULL CHECK (principal_context IN ('founder', 'operator')),
  operation_name text NOT NULL CHECK (
    operation_name IN ('session_reset', 'follow_through_action', 'email_review_transition', 'email_dispatch')
  ),
  idempotency_key text NOT NULL,
  request_fingerprint text NOT NULL,
  state text NOT NULL CHECK (state IN ('in_progress', 'completed', 'failed')),
  response_payload jsonb NULL,
  error_code text NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  completed_at timestamptz NULL,
  PRIMARY KEY (tenant_id, actor_id, principal_context, operation_name, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_aaliyah_mutation_idempotency_updated
  ON aaliyah_mutation_idempotency (tenant_id, updated_at DESC);

COMMIT;
