import type { EmailDraftSuggestion, EmailPriority, EmailRiskLevel, EmailRoutingResolution } from "./types.js";
import type { AgentOsRepository } from "../persistence/repository.js";
import type { EmailDraftReviewRecord, EmailDraftReviewStatus } from "./review-types.js";

export class EmailDraftReviewStateError extends Error {
  constructor(message: string) {
    super(message);
  }
}

const ALLOWED_TRANSITIONS: Record<EmailDraftReviewStatus, EmailDraftReviewStatus[]> = {
  pending_review: ["approved", "rejected", "revision_requested"],
  approved: [],
  rejected: [],
  revision_requested: []
};

export class EmailDraftReviewService {
  constructor(private readonly repository: AgentOsRepository) {}

  async createReviewItem(args: {
    tenantId: string;
    draft: EmailDraftSuggestion;
    accountId: string;
    assignmentRecordId?: string | null;
    runRecordId?: string | null;
    intentCategory: EmailDraftReviewRecord["intentCategory"];
    priority: EmailPriority;
    riskLevel: EmailRiskLevel;
    manifestVersion: string;
    routingProvenance: EmailRoutingResolution;
    createdAt?: string;
  }): Promise<EmailDraftReviewRecord> {
    return this.repository.createEmailDraftReviewItem({
      tenantId: args.tenantId,
      draftId: args.draft.draftId,
      accountId: args.accountId,
      threadId: args.draft.threadId,
      assignmentRecordId: args.assignmentRecordId ?? null,
      runRecordId: args.runRecordId ?? null,
      intentCategory: args.intentCategory,
      priority: args.priority,
      riskLevel: args.riskLevel,
      reviewStatus: "pending_review",
      recommendedExecutiveId: args.draft.recommendedOwner.executiveId,
      recommendedDepartmentId: args.draft.recommendedOwner.departmentId,
      recommendedLeadAgentId: args.draft.recommendedOwner.leadAgentId,
      recommendedSubAgentId: args.draft.recommendedOwner.subAgentId,
      draftSummary: args.draft.summary,
      proposedReplySubject: args.draft.proposedReplySubject,
      proposedReplyBody: args.draft.proposedReplyBody,
      confidenceScore: args.draft.confidenceScore,
      riskScore: args.draft.riskScore,
      escalationRecommended: args.draft.escalationRecommended,
      manifestVersion: args.manifestVersion,
      routingProvenance: args.routingProvenance,
      createdAt: args.createdAt
    });
  }

  async listReviewItems(args: {
    tenantId: string;
    status?: EmailDraftReviewStatus;
    accountId?: string;
    priority?: EmailPriority;
    limit?: number;
  }) {
    return this.repository.listEmailDraftReviewItems(args);
  }

  async getReviewItem(args: { tenantId: string; reviewItemId: string }) {
    return this.repository.getEmailDraftReviewItem(args);
  }

  async approveReviewItem(args: { tenantId: string; reviewItemId: string; actorId: string; note?: string; reviewedAt?: string }) {
    return this.transition({ ...args, toStatus: "approved" });
  }

  async rejectReviewItem(args: { tenantId: string; reviewItemId: string; actorId: string; note?: string; reviewedAt?: string }) {
    return this.transition({ ...args, toStatus: "rejected" });
  }

  async requestRevision(args: { tenantId: string; reviewItemId: string; actorId: string; note: string; reviewedAt?: string }) {
    return this.transition({ ...args, toStatus: "revision_requested" });
  }

  private async transition(args: {
    tenantId: string;
    reviewItemId: string;
    actorId: string;
    note?: string;
    reviewedAt?: string;
    toStatus: EmailDraftReviewStatus;
  }) {
    const current = await this.repository.getEmailDraftReviewItem({ tenantId: args.tenantId, reviewItemId: args.reviewItemId });
    if (!current) {
      throw new EmailDraftReviewStateError("email_review_item_not_found");
    }
    if (!ALLOWED_TRANSITIONS[current.reviewStatus].includes(args.toStatus)) {
      throw new EmailDraftReviewStateError(`invalid_email_review_transition:${current.reviewStatus}:${args.toStatus}`);
    }
    return this.repository.transitionEmailDraftReviewItem({
      tenantId: args.tenantId,
      reviewItemId: args.reviewItemId,
      fromStatus: current.reviewStatus,
      toStatus: args.toStatus,
      reviewedBy: args.actorId,
      reviewNote: args.note ?? null,
      reviewedAt: args.reviewedAt
    });
  }
}
