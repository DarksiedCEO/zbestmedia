export type EmailDispatchStatus =
  | "dispatch_pending"
  | "dispatch_blocked"
  | "dispatch_succeeded"
  | "dispatch_failed";

export type EmailDispatchPolicyResult = {
  allowed: boolean;
  reason: string;
  hardBlocked: boolean;
};

export type EmailDispatchRecord = {
  tenantId: string;
  dispatchId: string;
  reviewItemId: string;
  draftId: string;
  accountId: string;
  threadId: string;
  assignmentRecordId: string | null;
  runRecordId: string | null;
  dispatchStatus: EmailDispatchStatus;
  dispatchPolicy: EmailDispatchPolicyResult;
  requestedAt: string;
  dispatchedAt: string | null;
  failureCategory: string | null;
  failureMessage: string | null;
  gmailMessageId: string | null;
  gmailThreadId: string | null;
  auditMetadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type EmailDispatchRequest = {
  tenantId: string;
  actorId: string;
  reviewItemId: string;
  requestedAt?: string;
  auditMetadata?: Record<string, unknown>;
};

export type EmailDispatchResult = {
  dispatch: EmailDispatchRecord;
  sent: boolean;
};
