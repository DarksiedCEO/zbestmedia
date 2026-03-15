CREATE TABLE IF NOT EXISTS aaliyah_session_contexts (
  tenant_id UUID NOT NULL,
  actor_id TEXT NOT NULL,
  principal_context TEXT NOT NULL CHECK (principal_context IN ('founder', 'operator')),
  session_id TEXT NOT NULL,
  company_scope TEXT NOT NULL CHECK (company_scope = 'zbestmedia'),
  active_mode_state JSONB NOT NULL,
  interaction_state JSONB NOT NULL,
  retention_policy JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  hard_expires_at TIMESTAMPTZ NOT NULL,
  last_reset_at TIMESTAMPTZ NULL,
  last_reset_reason TEXT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (tenant_id, actor_id, principal_context)
);

CREATE INDEX IF NOT EXISTS aaliyah_session_contexts_updated_at_idx
  ON aaliyah_session_contexts (tenant_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS aaliyah_session_contexts_expires_at_idx
  ON aaliyah_session_contexts (tenant_id, expires_at ASC);
