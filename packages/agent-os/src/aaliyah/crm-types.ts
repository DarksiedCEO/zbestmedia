export type AaliyahCrmContactStatus = "lead" | "active" | "inactive" | "blocked";

export type AaliyahCrmRelationshipStage =
  | "new"
  | "contacted"
  | "qualified"
  | "proposal"
  | "client"
  | "follow_up"
  | "dormant";

export type AaliyahCrmAccountStatus = "active" | "inactive";

export type AaliyahCrmDenialCode = "ACCESS_DENIED" | "INVALID_MODE";

export type AaliyahCrmErrorCode = "INVALID_INPUT" | "NOT_FOUND" | "CONFLICT" | "INTERNAL_ERROR";

export type AaliyahCrmContact = {
  id: string;
  tenantId: string;
  principalId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  accountId: string | null;
  roleTitle: string | null;
  phone: string | null;
  status: AaliyahCrmContactStatus;
  relationshipStage: AaliyahCrmRelationshipStage;
  lastTouchedAt: string | null;
  nextActionAt: string | null;
  notesSummary: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AaliyahCrmAccount = {
  id: string;
  tenantId: string;
  name: string;
  website: string | null;
  industry: string | null;
  status: AaliyahCrmAccountStatus;
  notesSummary: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AaliyahCrmNote = {
  id: string;
  tenantId: string;
  contactId: string | null;
  accountId: string | null;
  authorPrincipalId: string;
  note: string;
  createdAt: string;
};

export type AaliyahCrmContextSummary = {
  contact: AaliyahCrmContact | null;
  account: AaliyahCrmAccount | null;
  recentNotes: AaliyahCrmNote[];
  summary: string;
};

export type AaliyahCrmCreateContactInput = {
  email: string;
  firstName?: string;
  lastName?: string;
  accountId?: string;
  roleTitle?: string;
  phone?: string;
  status?: AaliyahCrmContactStatus;
  relationshipStage?: AaliyahCrmRelationshipStage;
  lastTouchedAt?: string;
  nextActionAt?: string;
  notesSummary?: string;
};

export type AaliyahCrmUpdateContactInput = Partial<AaliyahCrmCreateContactInput>;

export type AaliyahCrmCreateAccountInput = {
  name: string;
  website?: string;
  industry?: string;
  status?: AaliyahCrmAccountStatus;
  notesSummary?: string;
};

export type AaliyahCrmUpdateAccountInput = Partial<AaliyahCrmCreateAccountInput>;

export type AaliyahCrmAddNoteInput = {
  contactId?: string;
  accountId?: string;
  note: string;
};

export type AaliyahCrmContactSuccessResult = {
  ok: true;
  contact: AaliyahCrmContact;
  message: string;
};

export type AaliyahCrmAccountSuccessResult = {
  ok: true;
  account: AaliyahCrmAccount;
  message: string;
};

export type AaliyahCrmNoteSuccessResult = {
  ok: true;
  note: AaliyahCrmNote;
  message: string;
};

export type AaliyahCrmContextSuccessResult = {
  ok: true;
  context: AaliyahCrmContextSummary;
  message: string;
};

export type AaliyahCrmFailureResult = {
  ok: false;
  denialCode: AaliyahCrmDenialCode | null;
  errorCode: AaliyahCrmErrorCode | null;
  retryable: boolean;
  message: string;
};

export type AaliyahCrmContactResult = AaliyahCrmContactSuccessResult | AaliyahCrmFailureResult;
export type AaliyahCrmAccountResult = AaliyahCrmAccountSuccessResult | AaliyahCrmFailureResult;
export type AaliyahCrmNoteResult = AaliyahCrmNoteSuccessResult | AaliyahCrmFailureResult;
export type AaliyahCrmContextResult = AaliyahCrmContextSuccessResult | AaliyahCrmFailureResult;

export type AaliyahCrmAuditEventType =
  | "aaliyah.crm.contact.created"
  | "aaliyah.crm.contact.updated"
  | "aaliyah.crm.account.created"
  | "aaliyah.crm.account.updated"
  | "aaliyah.crm.note.created"
  | "aaliyah.crm.context.requested"
  | "aaliyah.crm.denied"
  | "aaliyah.crm.failed";

export type AaliyahCrmAuditEvent = {
  eventType: AaliyahCrmAuditEventType;
  principalId: string;
  tenantId: string;
  mode: "founder" | "zbestmedia";
  timestamp: string;
  metadata?: Record<string, unknown>;
};
