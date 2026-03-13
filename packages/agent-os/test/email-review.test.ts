import { describe, expect, it, vi } from "vitest";

import { EmailDraftReviewService } from "../src/email/review.js";

function buildItem(status: "pending_review" | "approved" | "rejected" | "revision_requested" = "pending_review") {
  return {
    tenantId: "11111111-1111-4111-8111-111111111111",
    reviewItemId: "email-review:1",
    draftId: "draft:1",
    accountId: "email-account:1",
    threadId: "thread-1",
    assignmentRecordId: "assignment:1",
    runRecordId: "run:1",
    intentCategory: "lead_inquiry",
    priority: "high",
    riskLevel: "medium",
    requiredApproval: true,
    reviewStatus: status,
    recommendedExecutiveId: "cmo",
    recommendedDepartmentId: "marketing",
    recommendedLeadAgentId: "kobe",
    recommendedSubAgentId: null,
    draftSummary: "summary",
    proposedReplySubject: "Re: hello",
    proposedReplyBody: "reply",
    confidenceScore: 0.8,
    riskScore: 0.3,
    escalationRecommended: false,
    blockedAutoSend: true,
    manifestVersion: "2026-03-12.v1",
    routingProvenance: { intentCategory: "lead_inquiry", target: { targetType: "lead_agent", departmentId: "marketing", executiveId: "cmo", leadAgentId: "kobe", subAgentId: null, executionAgentId: "kobe", requiresEscalation: false }, routingDecision: null, trace: [] },
    createdAt: "2026-03-12T00:00:00.000Z",
    updatedAt: "2026-03-12T00:00:00.000Z",
    reviewedAt: null,
    reviewedBy: null,
    reviewNote: null
  } as const;
}

describe("email draft review service", () => {
  it("creates review items in pending state", async () => {
    const repository = {
      createEmailDraftReviewItem: vi.fn(async (args) => buildItem(args.reviewStatus ?? "pending_review")),
      getEmailDraftReviewItem: vi.fn(),
      transitionEmailDraftReviewItem: vi.fn(),
      listEmailDraftReviewItems: vi.fn()
    };
    const service = new EmailDraftReviewService(repository as never);
    const item = await service.createReviewItem({
      tenantId: "11111111-1111-4111-8111-111111111111",
      draft: {
        draftId: "draft:1",
        threadId: "thread-1",
        summary: "summary",
        proposedReplySubject: "Re: hello",
        proposedReplyBody: "reply",
        confidenceScore: 0.8,
        riskScore: 0.3,
        approvalRequirement: "required",
        approvalRequired: true,
        blockedAutoSend: true,
        escalationRecommended: false,
        recommendedOwner: { targetType: "lead_agent", departmentId: "marketing", executiveId: "cmo", leadAgentId: "kobe", subAgentId: null, executionAgentId: "kobe", requiresEscalation: false },
        routingProvenance: { intentCategory: "lead_inquiry", target: { targetType: "lead_agent", departmentId: "marketing", executiveId: "cmo", leadAgentId: "kobe", subAgentId: null, executionAgentId: "kobe", requiresEscalation: false }, routingDecision: null, trace: [] }
      },
      accountId: "email-account:1",
      assignmentRecordId: "assignment:1",
      runRecordId: "run:1",
      intentCategory: "lead_inquiry",
      priority: "high",
      riskLevel: "medium",
      manifestVersion: "2026-03-12.v1",
      routingProvenance: { intentCategory: "lead_inquiry", target: { targetType: "lead_agent", departmentId: "marketing", executiveId: "cmo", leadAgentId: "kobe", subAgentId: null, executionAgentId: "kobe", requiresEscalation: false }, routingDecision: null, trace: [] }
    });
    expect(item.reviewStatus).toBe("pending_review");
  });

  it("allows valid approval transition", async () => {
    const repository = {
      getEmailDraftReviewItem: vi.fn(async () => buildItem()),
      transitionEmailDraftReviewItem: vi.fn(async (args) => ({ ...buildItem(args.toStatus), reviewedBy: args.reviewedBy, reviewNote: args.reviewNote ?? null, reviewedAt: args.reviewedAt ?? "2026-03-12T00:01:00.000Z" }))
    };
    const service = new EmailDraftReviewService(repository as never);
    const item = await service.approveReviewItem({ tenantId: buildItem().tenantId, reviewItemId: buildItem().reviewItemId, actorId: "actor-1", note: "looks good" });
    expect(item.reviewStatus).toBe("approved");
  });

  it("rejects invalid transitions", async () => {
    const repository = {
      getEmailDraftReviewItem: vi.fn(async () => buildItem("approved")),
      transitionEmailDraftReviewItem: vi.fn()
    };
    const service = new EmailDraftReviewService(repository as never);
    await expect(service.rejectReviewItem({ tenantId: buildItem().tenantId, reviewItemId: buildItem().reviewItemId, actorId: "actor-1" })).rejects.toThrow("invalid_email_review_transition");
  });
});
