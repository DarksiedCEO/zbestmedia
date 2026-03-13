import type { EmailIntentCategory, EmailPriority, EmailRiskLevel } from "./types.js";

export type EmailDraftReviewStatus =
  | "pending_review"
  | "approved"
  | "rejected"
  | "revision_requested";

export type EmailDraftReviewRecord = {
  tenantId: string;
  reviewItemId: string;
  draftId: string;
  accountId: string;
  threadId: string;
  assignmentRecordId: string | null;
  runRecordId: string | null;
  intentCategory: EmailIntentCategory;
  priority: EmailPriority;
  riskLevel: EmailRiskLevel;
  requiredApproval: true;
  reviewStatus: EmailDraftReviewStatus;
  recommendedExecutiveId: string | null;
  recommendedDepartmentId: string | null;
  recommendedLeadAgentId: string | null;
  recommendedSubAgentId: string | null;
  draftSummary: string;
  proposedReplySubject: string;
  proposedReplyBody: string;
  confidenceScore: number;
  riskScore: number;
  escalationRecommended: boolean;
  blockedAutoSend: true;
  manifestVersion: string;
  routingProvenance: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
  reviewNote: string | null;
};
