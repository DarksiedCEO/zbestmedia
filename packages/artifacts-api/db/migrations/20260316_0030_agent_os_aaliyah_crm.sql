CREATE TABLE IF NOT EXISTS aaliyah_crm_accounts (
  tenant_id UUID NOT NULL,
  account_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  website TEXT NULL,
  industry TEXT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'inactive')),
  notes_summary TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_aaliyah_crm_accounts_tenant_name
  ON aaliyah_crm_accounts (tenant_id, lower(name));

CREATE TABLE IF NOT EXISTS aaliyah_crm_contacts (
  tenant_id UUID NOT NULL,
  contact_id TEXT PRIMARY KEY,
  principal_id TEXT NOT NULL,
  email TEXT NOT NULL,
  first_name TEXT NULL,
  last_name TEXT NULL,
  account_id TEXT NULL REFERENCES aaliyah_crm_accounts(account_id) ON DELETE SET NULL,
  role_title TEXT NULL,
  phone TEXT NULL,
  status TEXT NOT NULL CHECK (status IN ('lead', 'active', 'inactive', 'blocked')),
  relationship_stage TEXT NOT NULL CHECK (relationship_stage IN ('new', 'contacted', 'qualified', 'proposal', 'client', 'follow_up', 'dormant')),
  last_touched_at TIMESTAMPTZ NULL,
  next_action_at TIMESTAMPTZ NULL,
  notes_summary TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_aaliyah_crm_contacts_tenant_email_unique
  ON aaliyah_crm_contacts (tenant_id, lower(email));

CREATE INDEX IF NOT EXISTS idx_aaliyah_crm_contacts_tenant_account
  ON aaliyah_crm_contacts (tenant_id, account_id);

CREATE TABLE IF NOT EXISTS aaliyah_crm_notes (
  tenant_id UUID NOT NULL,
  note_id TEXT PRIMARY KEY,
  contact_id TEXT NULL REFERENCES aaliyah_crm_contacts(contact_id) ON DELETE CASCADE,
  account_id TEXT NULL REFERENCES aaliyah_crm_accounts(account_id) ON DELETE CASCADE,
  author_principal_id TEXT NOT NULL,
  note TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT aaliyah_crm_notes_target_required CHECK (contact_id IS NOT NULL OR account_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_aaliyah_crm_notes_tenant_contact_created
  ON aaliyah_crm_notes (tenant_id, contact_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_aaliyah_crm_notes_tenant_account_created
  ON aaliyah_crm_notes (tenant_id, account_id, created_at DESC);
