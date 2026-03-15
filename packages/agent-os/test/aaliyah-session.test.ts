import { describe, expect, it, vi } from "vitest";

import { AaliyahSessionContextService } from "../src/aaliyah/session.js";

describe("Aaliyah session context", () => {
  it("persists active mode and reuses current review context for follow-ups", async () => {
    let sessionRecord: any = null;
    const repository = {
      getAaliyahSessionContext: vi.fn(async () => sessionRecord),
      upsertAaliyahSessionContext: vi.fn(async ({ session }) => {
        sessionRecord = session;
        return session;
      })
    } as any;

    const service = new AaliyahSessionContextService(repository);
    const resolved = await service.resolveSession({
      tenantId: "11111111-1111-4111-8111-111111111111",
      actorId: "actor-1",
      principalContext: "founder",
      requestedMode: "zbestmedia",
      generatedAt: "2026-03-15T00:00:00.000Z"
    });

    const runtimeResult = {
      runtimeRequestId: "runtime:1",
      resolvedIntent: "get_founder_queue_item",
      outcomeType: "completed",
      activeMode: "zbestmedia",
      payloadType: "founder_queue_item",
      payload: {
        queueItemId: "queue:item:1",
        sourceSubsystem: "email_review_queue",
        sourceItemId: "review:1",
        itemType: "approval_required",
        title: "Review founder email",
        summary: "Founder approval required.",
        urgency: "high",
        risk: "medium",
        confidenceLevel: "high",
        interruptionClass: "same_day_briefing",
        activeMode: "zbestmedia",
        founderAttentionRequired: true,
        recommendedNextAction: "Approve or reject.",
        allowedNextActions: ["approve_review_item"],
        provenanceSummary: {
          manifestVersion: "2026-03-12.v1",
          references: ["review:1"],
          contributingSourceItemIds: ["review:1"]
        },
        createdAt: "2026-03-15T00:00:00.000Z",
        updatedAt: "2026-03-15T00:00:00.000Z"
      },
      provenance: {
        manifestVersion: "2026-03-12.v1",
        aaliyahRegistryVersion: "2026-03-12.aaliyah.v1",
        requestId: "req-1",
        generatedAt: "2026-03-15T00:00:00.000Z",
        invokedSurface: "aaliyah-review-queue",
        enforcement: {
          requestedAgentId: "aaliyah",
          requestedAtomicTaskId: "executive_orchestration_founder_protection",
          resolvedAgentId: "aaliyah",
          resolvedAtomicTaskId: "executive_orchestration_founder_protection",
          confidence: "high",
          company: "zbestmedia",
          mode: "executive_assistant",
          principalContext: "founder",
          approvalState: "not_required",
          approvalClass: "orchestration_only",
          reason: "allowed"
        }
      },
      fallback: null
    } as any;

    const snapshot = await service.applyRuntimeResult({
      session: resolved.session,
      request: {
        intent: "get_founder_queue_item",
        mode: "zbestmedia",
        parameters: { queueItemId: "queue:item:1" }
      },
      result: runtimeResult,
      generatedAt: "2026-03-15T00:00:00.000Z"
    });

    expect(snapshot.activeModeState.activeMode).toBe("zbestmedia");
    expect(snapshot.interactionState.reviewApprovalContext?.reviewItemId).toBe("1");
    expect(service.resolveReviewItemId({}, sessionRecord)).toBe("1");
  });

  it("resets bounded state when the session idles out", async () => {
    const repository = {
      getAaliyahSessionContext: vi.fn(async () => ({
        sessionId: "aaliyah-session:1",
        tenantId: "11111111-1111-4111-8111-111111111111",
        actorId: "actor-1",
        principalContext: "founder",
        companyScope: "zbestmedia",
        activeModeState: {
          activeMode: "zbestmedia",
          previousMode: "founder",
          switchedAt: "2026-03-14T00:00:00.000Z",
          switchReason: "explicit_request",
          boundaryDecisionId: null
        },
        interactionState: {
          lastInteractionAt: "2026-03-14T00:00:00.000Z",
          lastIntent: "get_founder_queue_item",
          lastResolvedIntent: "get_founder_queue_item",
          intentTrail: [],
          workingItem: null,
          reviewApprovalContext: null,
          pendingDisambiguation: null
        },
        retentionPolicy: {
          intentTrailMaxEntries: 12,
          idleTtlSeconds: 60,
          hardTtlSeconds: 86400,
          snapshotIntentTrailEntries: 6
        },
        createdAt: "2026-03-14T00:00:00.000Z",
        updatedAt: "2026-03-14T00:00:00.000Z",
        expiresAt: "2026-03-14T00:01:00.000Z",
        hardExpiresAt: "2026-03-16T00:00:00.000Z",
        lastResetAt: null,
        lastResetReason: null,
        version: 1
      })),
      upsertAaliyahSessionContext: vi.fn(async ({ session }) => session)
    } as any;

    const service = new AaliyahSessionContextService(repository);
    const resolved = await service.resolveSession({
      tenantId: "11111111-1111-4111-8111-111111111111",
      actorId: "actor-1",
      principalContext: "founder",
      generatedAt: "2026-03-14T01:10:00.000Z"
    });

    expect(resolved.session.lastResetReason).toBe("idle_expired");
    expect(resolved.activeMode).toBe("zbestmedia");
  });
});
