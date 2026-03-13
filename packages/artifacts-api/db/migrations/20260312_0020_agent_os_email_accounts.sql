-- 20260312_0020_agent_os_email_accounts.sql
-- AGENT-OS-13C: Gmail account metadata and safe inbox processing controls

BEGIN;

CREATE TABLE IF NOT EXISTS email_account_connections (
  tenant_id uuid NOT NULL,
  account_id text NOT NULL,
  provider text NOT NULL,
  principal_id text NOT NULL,
  account_email_address text NULL,
  connection_status text NOT NULL,
  granted_scopes jsonb NOT NULL DEFAULT '[]'::jsonb,
  token_reference text NULL,
  external_account_id text NULL,
  draft_only_mode boolean NOT NULL DEFAULT true,
  processing_enabled boolean NOT NULL DEFAULT false,
  processing_mode text NOT NULL DEFAULT 'poll',
  max_batch_threads integer NOT NULL DEFAULT 10,
  allowed_label_ids jsonb NOT NULL DEFAULT '["INBOX","UNREAD"]'::jsonb,
  oauth_state text NULL,
  oauth_state_expires_at timestamptz NULL,
  last_processed_at timestamptz NULL,
  last_error text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, account_id),
  CONSTRAINT email_account_connections_provider_check CHECK (provider IN ('gmail')),
  CONSTRAINT email_account_connections_status_check CHECK (connection_status IN ('oauth_pending', 'connected', 'disabled', 'error', 'disconnected')),
  CONSTRAINT email_account_connections_mode_check CHECK (processing_mode IN ('poll', 'watch')),
  CONSTRAINT email_account_connections_draft_only_check CHECK (draft_only_mode = true),
  CONSTRAINT email_account_connections_batch_limit_check CHECK (max_batch_threads > 0)
);

CREATE INDEX IF NOT EXISTS email_account_connections_created_idx
  ON email_account_connections (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS email_account_connections_oauth_state_idx
  ON email_account_connections (tenant_id, oauth_state)
  WHERE oauth_state IS NOT NULL;

ALTER TABLE email_account_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_account_connections FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS email_account_connections_tenant_isolation ON email_account_connections;
CREATE POLICY email_account_connections_tenant_isolation
ON email_account_connections
FOR ALL
USING (tenant_id = require_tenant_id())
WITH CHECK (tenant_id = require_tenant_id());

COMMIT;
