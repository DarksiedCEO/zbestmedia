import { describe, expect, it, vi } from "vitest";

import { EmailDraftDispatchService } from "../src/email/dispatch.js";

function buildReviewItem(overrides: Record<string, unknown> = {}) {
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
    reviewStatus: "approved",
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
    routingProvenance: {
      intentCategory: "lead_inquiry",
      target: {
        targetType: "lead_agent",
        departmentId: "marketing",
        executiveId: "cmo",
        leadAgentId: "kobe",
        subAgentId: null,
        executionAgentId: "kobe",
        requiresEscalation: false
      },
      routingDecision: null,
      trace: []
    },
    createdAt: "2026-03-12T00:00:00.000Z",
    updatedAt: "2026-03-12T00:00:00.000Z",
    reviewedAt: "2026-03-12T00:01:00.000Z",
    reviewedBy: "actor-1",
    reviewNote: "approved",
    ...overrides
  };
}

function buildAccount(overrides: Record<string, unknown> = {}) {
  return {
    tenantId: "11111111-1111-4111-8111-111111111111",
    accountId: "email-account:1",
    provider: "gmail",
    principalId: "principal-1",
    accountEmailAddress: "ops@zbestmedia.com",
    connectionStatus: "connected",
    grantedScopes: [
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/gmail.compose"
    ],
    tokenReference: "secret:gmail:ops",
    externalAccountId: "gmail-user-1",
    draftOnlyMode: true,
    processingEnabled: true,
    processingMode: "poll",
    maxBatchThreads: 10,
    allowedLabelIds: ["INBOX", "UNREAD"],
    oauthState: null,
    oauthStateExpiresAt: null,
    lastProcessedAt: null,
    lastError: null,
    createdAt: "2026-03-12T00:00:00.000Z",
    updatedAt: "2026-03-12T00:00:00.000Z",
    ...overrides
  };
}

function buildDispatch(status: "dispatch_pending" | "dispatch_blocked" | "dispatch_succeeded" | "dispatch_failed") {
  return {
    tenantId: "11111111-1111-4111-8111-111111111111",
    dispatchId: "email-dispatch:1",
    reviewItemId: "email-review:1",
    draftId: "draft:1",
    accountId: "email-account:1",
    threadId: "thread-1",
    assignmentRecordId: "assignment:1",
    runRecordId: "run:1",
    dispatchStatus: status,
    dispatchPolicy: {
      allowed: status !== "dispatch_blocked",
      reason: status === "dispatch_blocked" ? "email_dispatch_requires_approved_review:pending_review" : "email_dispatch_policy_approved",
      hardBlocked: status === "dispatch_blocked"
    },
    requestedAt: "2026-03-12T00:02:00.000Z",
    dispatchedAt: status === "dispatch_succeeded" ? "2026-03-12T00:02:00.000Z" : null,
    failureCategory: status === "dispatch_failed" ? "gmail_dispatch_failure" : null,
    failureMessage: status === "dispatch_failed" ? "gmail_send_failed" : null,
    gmailMessageId: status === "dispatch_succeeded" ? "gmail-message-1" : null,
    gmailThreadId: status === "dispatch_succeeded" ? "thread-1" : null,
    auditMetadata: { actorId: "actor-1" },
    createdAt: "2026-03-12T00:02:00.000Z",
    updatedAt: "2026-03-12T00:02:00.000Z"
  };
}

describe("email draft dispatch service", () => {
  it("dispatches an approved review item", async () => {
    const repository = {
      getEmailDraftReviewItem: vi.fn(async () => buildReviewItem()),
      getLatestEmailDispatchRecordForReviewItem: vi.fn(async () => null),
      getEmailAccountConnection: vi.fn(async () => buildAccount()),
      createEmailDispatchRecord: vi.fn(async () => buildDispatch("dispatch_pending")),
      updateEmailDispatchRecord: vi.fn(async () => buildDispatch("dispatch_succeeded")),
      getExecutionRunRecord: vi.fn(async () => ({ executionId: "execution:1" })),
      appendExecutionStep: vi.fn(async () => ({ executionStepId: "step:1" }))
    };
    const incidents = {
      createFromExecutionFailure: vi.fn()
    };
    const gmailRuntime = {
      createConnector: vi.fn(async () => ({
        sendApprovedDraft: vi.fn(async () => ({
          providerMessageId: "gmail-message-1",
          providerThreadId: "thread-1",
          sentAt: "2026-03-12T00:02:00.000Z"
        }))
      }))
    };

    const service = new EmailDraftDispatchService(repository as never, incidents as never, gmailRuntime as never);
    const result = await service.dispatchApprovedReviewItem({
      tenantId: "11111111-1111-4111-8111-111111111111",
      actorId: "actor-1",
      reviewItemId: "email-review:1"
    });

    expect(result.sent).toBe(true);
    expect(result.dispatch.dispatchStatus).toBe("dispatch_succeeded");
    expect(gmailRuntime.createConnector).toHaveBeenCalledTimes(1);
  });

  it("blocks non-approved review items", async () => {
    const repository = {
      getEmailDraftReviewItem: vi.fn(async () => buildReviewItem({ reviewStatus: "pending_review" })),
      getLatestEmailDispatchRecordForReviewItem: vi.fn(async () => null),
      getEmailAccountConnection: vi.fn(async () => buildAccount()),
      createEmailDispatchRecord: vi.fn(async () => buildDispatch("dispatch_pending")),
      updateEmailDispatchRecord: vi.fn(async () => buildDispatch("dispatch_blocked")),
      getExecutionRunRecord: vi.fn(async () => ({ executionId: "execution:1" })),
      appendExecutionStep: vi.fn(async () => ({ executionStepId: "step:1" }))
    };
    const incidents = {
      createFromExecutionFailure: vi.fn(async () => ({ incidentId: "incident:1" }))
    };
    const gmailRuntime = {
      createConnector: vi.fn()
    };

    const service = new EmailDraftDispatchService(repository as never, incidents as never, gmailRuntime as never);
    const result = await service.dispatchApprovedReviewItem({
      tenantId: "11111111-1111-4111-8111-111111111111",
      actorId: "actor-1",
      reviewItemId: "email-review:1"
    });

    expect(result.sent).toBe(false);
    expect(result.dispatch.dispatchStatus).toBe("dispatch_blocked");
    expect(incidents.createFromExecutionFailure).toHaveBeenCalledTimes(1);
    expect(gmailRuntime.createConnector).not.toHaveBeenCalled();
  });

  it("records dispatch failure when connector send fails", async () => {
    const repository = {
      getEmailDraftReviewItem: vi.fn(async () => buildReviewItem()),
      getLatestEmailDispatchRecordForReviewItem: vi.fn(async () => null),
      getEmailAccountConnection: vi.fn(async () => buildAccount()),
      createEmailDispatchRecord: vi.fn(async () => buildDispatch("dispatch_pending")),
      updateEmailDispatchRecord: vi.fn(async () => buildDispatch("dispatch_failed")),
      getExecutionRunRecord: vi.fn(async () => ({ executionId: "execution:1" })),
      appendExecutionStep: vi.fn(async () => ({ executionStepId: "step:1" }))
    };
    const incidents = {
      createFromExecutionFailure: vi.fn(async () => ({ incidentId: "incident:1" }))
    };
    const gmailRuntime = {
      createConnector: vi.fn(async () => ({
        sendApprovedDraft: vi.fn(async () => {
          throw new Error("gmail_send_failed");
        })
      }))
    };

    const service = new EmailDraftDispatchService(repository as never, incidents as never, gmailRuntime as never);
    const result = await service.dispatchApprovedReviewItem({
      tenantId: "11111111-1111-4111-8111-111111111111",
      actorId: "actor-1",
      reviewItemId: "email-review:1"
    });

    expect(result.sent).toBe(false);
    expect(result.dispatch.dispatchStatus).toBe("dispatch_failed");
    expect(incidents.createFromExecutionFailure).toHaveBeenCalledTimes(1);
  });

  it("reuses a previously succeeded dispatch instead of sending the same approved draft twice", async () => {
    const repository = {
      claimAaliyahMutationIdempotency: vi.fn(async () => ({
        status: "claimed",
        record: {
          tenantId: "11111111-1111-4111-8111-111111111111",
          actorId: "actor-1",
          principalContext: "founder",
          operationName: "email_dispatch",
          idempotencyKey: "dispatch-idem-1",
          requestFingerprint: "fingerprint",
          state: "in_progress",
          responsePayload: null,
          errorCode: null,
          createdAt: "2026-03-12T00:02:00.000Z",
          updatedAt: "2026-03-12T00:02:00.000Z",
          completedAt: null
        }
      })),
      completeAaliyahMutationIdempotency: vi.fn(async () => ({})),
      failAaliyahMutationIdempotency: vi.fn(async () => ({})),
      getEmailDraftReviewItem: vi.fn(async () => buildReviewItem()),
      getLatestEmailDispatchRecordForReviewItem: vi.fn(async () => buildDispatch("dispatch_succeeded")),
      getEmailAccountConnection: vi.fn(async () => buildAccount()),
      createEmailDispatchRecord: vi.fn(),
      updateEmailDispatchRecord: vi.fn(),
      getExecutionRunRecord: vi.fn(async () => ({ executionId: "execution:1" })),
      appendExecutionStep: vi.fn(async () => ({ executionStepId: "step:1" }))
    };
    const incidents = {
      createFromExecutionFailure: vi.fn()
    };
    const gmailRuntime = {
      createConnector: vi.fn()
    };

    const service = new EmailDraftDispatchService(repository as never, incidents as never, gmailRuntime as never);
    const result = await service.dispatchApprovedReviewItem({
      tenantId: "11111111-1111-4111-8111-111111111111",
      actorId: "actor-1",
      reviewItemId: "email-review:1"
    });

    expect(result.sent).toBe(true);
    expect(result.dispatch.dispatchStatus).toBe("dispatch_succeeded");
    expect(repository.createEmailDispatchRecord).not.toHaveBeenCalled();
    expect(gmailRuntime.createConnector).not.toHaveBeenCalled();
  });
});
