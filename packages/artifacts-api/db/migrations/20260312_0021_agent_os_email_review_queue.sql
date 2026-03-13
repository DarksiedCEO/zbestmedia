-- 20260312_0021_agent_os_email_review_queue.sql
-- AGENT-OS-13D: Draft review queue and approval workflow

BEGIN;

CREATE TABLE IF NOT EXISTS email_draft_review_items (
  tenant_id uuid NOT NULL,
  review_item_id text NOT NULL,
  draft_id text NOT NULL,
  account_id text NOT NULL,
  thread_id text NOT NULL,
  assignment_record_id text NULL,
  run_record_id text NULL,
  intent_category text NOT NULL,
  priority text NOT NULL,
  risk_level text NOT NULL,
  required_approval boolean NOT NULL DEFAULT true,
  review_status text NOT NULL DEFAULT 'pending_review',
  recommended_executive_id text NULL,
  recommended_department_id text NULL,
  recommended_lead_agent_id text NULL,
  recommended_sub_agent_id text NULL,
  draft_summary text NOT NULL,
  proposed_reply_subject text NOT NULL,
  proposed_reply_body text NOT NULL,
  confidence_score double precision NOT NULL,
  risk_score double precision NOT NULL,
  escalation_recommended boolean NOT NULL DEFAULT false,
  blocked_auto_send boolean NOT NULL DEFAULT true,
  manifest_version text NOT NULL,
  routing_provenance jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz NULL,
  reviewed_by text NULL,
  review_note text NULL,
  PRIMARY KEY (tenant_id, review_item_id),
  CONSTRAINT email_draft_review_items_intent_check CHECK (intent_category IN ('lead_inquiry','client_request','billing_question','meeting_request','vendor_outreach','partnership_inquiry','technical_issue','support_request','general_inquiry','spam_or_irrelevant','legal_or_sensitive')),
  CONSTRAINT email_draft_review_items_priority_check CHECK (priority IN ('low','normal','high','urgent')),
  CONSTRAINT email_draft_review_items_risk_check CHECK (risk_level IN ('low','medium','high','critical')),
  CONSTRAINT email_draft_review_items_status_check CHECK (review_status IN ('pending_review','approved','rejected','revision_requested')),
  CONSTRAINT email_draft_review_items_required_approval_check CHECK (required_approval = true),
  CONSTRAINT email_draft_review_items_blocked_auto_send_check CHECK (blocked_auto_send = true)
);

CREATE INDEX IF NOT EXISTS email_draft_review_items_created_idx
  ON email_draft_review_items (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS email_draft_review_items_status_idx
  ON email_draft_review_items (tenant_id, review_status, created_at DESC);

ALTER TABLE email_draft_review_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_draft_review_items FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS email_draft_review_items_tenant_isolation ON email_draft_review_items;
CREATE POLICY email_draft_review_items_tenant_isolation
ON email_draft_review_items
FOR ALL
USING (tenant_id = require_tenant_id())
WITH CHECK (tenant_id = require_tenant_id());

COMMIT;
