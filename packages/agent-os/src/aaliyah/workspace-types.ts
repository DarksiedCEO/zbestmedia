export type AaliyahWorkspaceProvider = "gmail";

export type AaliyahWorkspaceDenialCode =
  | "ACCESS_DENIED"
  | "INVALID_MODE"
  | "PROVIDER_DISABLED";

export type AaliyahWorkspaceErrorCode =
  | "INVALID_INPUT"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_REJECTED"
  | "INTERNAL_ERROR";

export type AaliyahDraftEmailInput = {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  bodyText: string;
  bodyHtml?: string;
  threadId?: string;
  dryRun?: boolean;
};

export type AaliyahDraftEmailSuccessResult = {
  ok: true;
  provider: AaliyahWorkspaceProvider;
  draftId: string;
  externalId: string | null;
  dryRun: boolean;
  message: string;
};

export type AaliyahDraftEmailFailureResult = {
  ok: false;
  provider: AaliyahWorkspaceProvider;
  dryRun: boolean;
  denialCode: AaliyahWorkspaceDenialCode | null;
  errorCode: AaliyahWorkspaceErrorCode | null;
  retryable: boolean;
  message: string;
};

export type AaliyahDraftEmailResult = AaliyahDraftEmailSuccessResult | AaliyahDraftEmailFailureResult;

export type AaliyahWorkspaceAuditEventType =
  | "aaliyah.workspace.draft.requested"
  | "aaliyah.workspace.draft.denied"
  | "aaliyah.workspace.draft.created"
  | "aaliyah.workspace.draft.failed";

export type AaliyahWorkspaceAuditEvent = {
  eventType: AaliyahWorkspaceAuditEventType;
  principalId: string;
  tenantId: string;
  mode: "founder" | "zbestmedia";
  provider: AaliyahWorkspaceProvider;
  timestamp: string;
  metadata?: Record<string, unknown>;
};
