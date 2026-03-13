-- 20260312_0022_agent_os_email_dispatch.sql
-- AGENT-OS-13E: Approved draft dispatch layer

BEGIN;

CREATE TABLE IF NOT EXISTS email_dispatch_records (
  tenant_id uuid NOT NULL,
  dispatch_id text NOT NULL,
  review_item_id text NOT NULL,
  draft_id text NOT NULL,
  account_id text NOT NULL,
  thread_id text NOT NULL,
  assignment_record_id text NULL,
  run_record_id text NULL,
  dispatch_status text NOT NULL DEFAULT 'dispatch_pending',
  dispatch_policy jsonb NOT NULL,
  requested_at timestamptz NOT NULL,
  dispatched_at timestamptz NULL,
  failure_category text NULL,
  failure_message text NULL,
  gmail_message_id text NULL,
  gmail_thread_id text NULL,
  audit_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, dispatch_id),
  CONSTRAINT email_dispatch_records_status_check CHECK (
    dispatch_status IN ('dispatch_pending','dispatch_blocked','dispatch_succeeded','dispatch_failed')
  )
);

CREATE INDEX IF NOT EXISTS email_dispatch_records_created_idx
  ON email_dispatch_records (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS email_dispatch_records_review_idx
  ON email_dispatch_records (tenant_id, review_item_id, created_at DESC);

ALTER TABLE email_dispatch_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_dispatch_records FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS email_dispatch_records_tenant_isolation ON email_dispatch_records;
CREATE POLICY email_dispatch_records_tenant_isolation
ON email_dispatch_records
FOR ALL
USING (tenant_id = require_tenant_id())
WITH CHECK (tenant_id = require_tenant_id());

COMMIT;
