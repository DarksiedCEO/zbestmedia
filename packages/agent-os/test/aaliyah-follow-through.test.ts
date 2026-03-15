import { describe, expect, it, vi } from "vitest";

import { AaliyahFollowThroughService } from "../src/aaliyah/follow-through.js";
import { createInitialAaliyahSession, setWorkingItemContext } from "../src/aaliyah/session-state.js";

describe("Aaliyah follow-through service", () => {
  function buildSession() {
    const session = createInitialAaliyahSession({
      tenantId: "11111111-1111-4111-8111-111111111111",
      actorId: "actor-1",
      principalContext: "founder",
      activeMode: "founder",
      generatedAt: "2026-03-15T00:00:00.000Z"
    });

    return setWorkingItemContext(
      session,
      {
        contextId: "working:1",
        workingItemType: "founder_queue_item",
        sourceSubsystem: "email_review_queue",
        sourceItemId: "review:1",
        queueItemId: "queue:item:1",
        reviewItemId: "review:1",
        callId: null,
        incidentId: null,
        dispatchId: null,
        title: "Review founder email",
        summary: "Founder approval is needed.",
        founderAttentionRequired: true,
        confidenceLevel: "high",
        interruptionClass: "same_day_briefing",
        setByIntent: "get_founder_queue_item",
        setAt: "2026-03-15T00:00:00.000Z",
        updatedAt: "2026-03-15T00:00:00.000Z",
        closureState: "open",
        closureReason: null,
        closedAt: null,
        closedByIntent: null
      },
      "2026-03-15T00:00:00.000Z"
    );
  }

  it("records explicit founder-declared completion and clears active session context", async () => {
    let storedSession = buildSession();
    const repository = {
      createOrGetAaliyahFollowThroughRecord: vi.fn(async ({ record }: { record: any }) => record),
      commitAaliyahFollowThroughTransition: vi.fn(async ({ session, record, historyEntry }: { session: typeof storedSession; record: any; historyEntry: any }) => {
        storedSession = session;
        return { session, record, historyEntry };
      }),
      listAaliyahFollowThroughHistory: vi.fn(async () => [])
    } as any;
    const sessions = {
      resolveSession: vi.fn(async () => ({ session: storedSession, activeMode: "founder", boundaryViolation: null }))
    } as any;

    const service = new AaliyahFollowThroughService(repository, sessions);
    const result = await service.applyAction({
      tenantId: storedSession.tenantId,
      actorId: storedSession.actorId,
      principalContext: "founder",
      mode: "founder",
      action: "complete",
      closureReason: "founder_declared_completed",
      founderDeclaredCompletion: true,
      generatedAt: "2026-03-15T00:05:00.000Z"
    });

    expect(result.record.status).toBe("completed");
    expect(result.record.nextGovernedAction).toBe("select_new_queue_item");
    expect(repository.commitAaliyahFollowThroughTransition).toHaveBeenCalled();
    expect(storedSession.interactionState.workingItem).toBeNull();
  });

  it("rejects escalation without an explicit escalation target or class", async () => {
    const storedSession = buildSession();
    const repository = {
      createOrGetAaliyahFollowThroughRecord: vi.fn(async ({ record }: { record: any }) => record),
      commitAaliyahFollowThroughTransition: vi.fn(async ({ session, record, historyEntry }: { session: typeof storedSession; record: any; historyEntry: any }) => ({ session, record, historyEntry })),
      listAaliyahFollowThroughHistory: vi.fn(async () => [])
    } as any;
    const sessions = {
      resolveSession: vi.fn(async () => ({ session: storedSession, activeMode: "founder", boundaryViolation: null }))
    } as any;

    const service = new AaliyahFollowThroughService(repository, sessions);

    await expect(
      service.applyAction({
        tenantId: storedSession.tenantId,
        actorId: storedSession.actorId,
        principalContext: "founder",
        mode: "founder",
        action: "escalate",
        closureReason: "founder_declared_escalated",
        generatedAt: "2026-03-15T00:06:00.000Z"
      })
    ).rejects.toThrow("aaliyah_follow_through_escalation_target_required");
  });

  it("replays a completed idempotent follow-through action without committing twice", async () => {
    const storedSession = buildSession();
    const cachedResult = {
      record: {
        tenantId: storedSession.tenantId,
        followThroughId: "follow-through:1",
        version: 2,
        sessionId: storedSession.sessionId,
        actorId: storedSession.actorId,
        principalContext: "founder",
        activeMode: "founder",
        companyScope: "zbestmedia",
        workingItemType: "founder_queue_item",
        sourceSubsystem: "email_review_queue",
        sourceItemId: "review:1",
        queueItemId: "queue:item:1",
        reviewItemId: "review:1",
        callId: null,
        incidentId: null,
        dispatchId: null,
        title: "Review founder email",
        summary: "Founder approval is needed.",
        status: "completed",
        closureState: "completed",
        closureReason: "founder_declared_completed",
        nextGovernedAction: "select_new_queue_item",
        founderDeclaredCompletion: true,
        downstreamActionRef: null,
        escalationTarget: null,
        escalationClass: null,
        escalationRationale: null,
        escalationProvenance: null,
        note: null,
        provenance: {
          queueItemId: "queue:item:1",
          reviewItemId: "review:1",
          callId: null,
          incidentId: null,
          dispatchId: null,
          sessionVersion: 1
        },
        createdAt: "2026-03-15T00:00:00.000Z",
        updatedAt: "2026-03-15T00:05:00.000Z",
        closedAt: "2026-03-15T00:05:00.000Z"
      },
      historyEntry: {
        tenantId: storedSession.tenantId,
        eventId: "follow-through-event:1",
        followThroughId: "follow-through:1",
        action: "complete",
        previousStatus: "active",
        resultingStatus: "completed",
        closureState: "completed",
        closureReason: "founder_declared_completed",
        nextGovernedAction: "select_new_queue_item",
        founderDeclaredCompletion: true,
        downstreamActionRef: null,
        escalationTarget: null,
        escalationClass: null,
        escalationRationale: null,
        escalationProvenance: null,
        note: null,
        actorId: storedSession.actorId,
        createdAt: "2026-03-15T00:05:00.000Z"
      },
      nextGovernedAction: "select_new_queue_item"
    };
    const repository = {
      claimAaliyahMutationIdempotency: vi.fn(async () => ({
        status: "completed",
        record: {
          tenantId: storedSession.tenantId,
          actorId: storedSession.actorId,
          principalContext: "founder",
          operationName: "follow_through_action",
          idempotencyKey: "idem-1",
          requestFingerprint: "fingerprint",
          state: "completed",
          responsePayload: cachedResult,
          errorCode: null,
          createdAt: "2026-03-15T00:05:00.000Z",
          updatedAt: "2026-03-15T00:05:00.000Z",
          completedAt: "2026-03-15T00:05:00.000Z"
        }
      })),
      createOrGetAaliyahFollowThroughRecord: vi.fn(),
      commitAaliyahFollowThroughTransition: vi.fn(),
      listAaliyahFollowThroughHistory: vi.fn(async () => [])
    } as any;
    const sessions = {
      resolveSession: vi.fn(async () => ({ session: storedSession, activeMode: "founder", boundaryViolation: null }))
    } as any;

    const service = new AaliyahFollowThroughService(repository, sessions);
    const result = await service.applyAction({
      tenantId: storedSession.tenantId,
      actorId: storedSession.actorId,
      principalContext: "founder",
      mode: "founder",
      action: "complete",
      closureReason: "founder_declared_completed",
      founderDeclaredCompletion: true,
      idempotencyKey: "idem-1",
      generatedAt: "2026-03-15T00:05:00.000Z"
    });

    expect(result.record.followThroughId).toBe("follow-through:1");
    expect(repository.createOrGetAaliyahFollowThroughRecord).not.toHaveBeenCalled();
    expect(repository.commitAaliyahFollowThroughTransition).not.toHaveBeenCalled();
  });

  it("fails fast when a concurrent follow-through transition wins the version race", async () => {
    const storedSession = buildSession();
    const repository = {
      claimAaliyahMutationIdempotency: vi.fn(async () => ({
        status: "claimed",
        record: {
          tenantId: storedSession.tenantId,
          actorId: storedSession.actorId,
          principalContext: "founder",
          operationName: "follow_through_action",
          idempotencyKey: "idem-race",
          requestFingerprint: "fingerprint",
          state: "in_progress",
          responsePayload: null,
          errorCode: null,
          createdAt: "2026-03-15T00:05:00.000Z",
          updatedAt: "2026-03-15T00:05:00.000Z",
          completedAt: null
        }
      })),
      createOrGetAaliyahFollowThroughRecord: vi.fn(async ({ record }: { record: any }) => record),
      commitAaliyahFollowThroughTransition: vi.fn(async () => {
        throw new Error("aaliyah_follow_through_version_conflict");
      }),
      failAaliyahMutationIdempotency: vi.fn(async () => ({})),
      listAaliyahFollowThroughHistory: vi.fn(async () => [])
    } as any;
    const sessions = {
      resolveSession: vi.fn(async () => ({ session: storedSession, activeMode: "founder", boundaryViolation: null }))
    } as any;

    const service = new AaliyahFollowThroughService(repository, sessions);

    await expect(
      service.applyAction({
        tenantId: storedSession.tenantId,
        actorId: storedSession.actorId,
        principalContext: "founder",
        mode: "founder",
        action: "complete",
        closureReason: "founder_declared_completed",
        founderDeclaredCompletion: true,
        idempotencyKey: "idem-race",
        generatedAt: "2026-03-15T00:05:00.000Z"
      })
    ).rejects.toThrow("aaliyah_follow_through_version_conflict");
  });
});
