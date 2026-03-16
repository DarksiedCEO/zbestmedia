CREATE TABLE IF NOT EXISTS aaliyah_tasks (
  tenant_id UUID NOT NULL,
  task_id TEXT PRIMARY KEY,
  principal_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL CHECK (status IN ('open', 'in_progress', 'blocked', 'completed', 'cancelled')),
  priority TEXT NOT NULL CHECK (priority IN ('low', 'normal', 'high', 'critical')),
  source TEXT NOT NULL CHECK (source IN ('manual', 'crm_follow_up', 'calendar_follow_up', 'email_follow_up', 'system')),
  contact_id TEXT REFERENCES aaliyah_crm_contacts(contact_id) ON DELETE SET NULL,
  account_id TEXT REFERENCES aaliyah_crm_accounts(account_id) ON DELETE SET NULL,
  related_email_draft_id TEXT,
  related_calendar_event_id TEXT,
  due_at TIMESTAMPTZ,
  remind_at TIMESTAMPTZ,
  blocked_reason TEXT,
  completion_note TEXT,
  next_step_summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  CHECK (remind_at IS NULL OR due_at IS NULL OR remind_at <= due_at),
  CHECK (status <> 'blocked' OR blocked_reason IS NOT NULL),
  CHECK (status <> 'completed' OR completed_at IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_aaliyah_tasks_tenant_principal_status
  ON aaliyah_tasks (tenant_id, principal_id, status);

CREATE INDEX IF NOT EXISTS idx_aaliyah_tasks_tenant_contact
  ON aaliyah_tasks (tenant_id, contact_id)
  WHERE contact_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_aaliyah_tasks_tenant_account
  ON aaliyah_tasks (tenant_id, account_id)
  WHERE account_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_aaliyah_tasks_tenant_due_at
  ON aaliyah_tasks (tenant_id, due_at)
  WHERE due_at IS NOT NULL;
