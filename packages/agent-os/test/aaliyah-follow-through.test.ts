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
      getAaliyahFollowThroughRecordBySource: vi.fn(async () => null),
      upsertAaliyahFollowThroughRecord: vi.fn(async ({ record }: { record: unknown }) => record),
      createAaliyahFollowThroughHistoryEntry: vi.fn(async ({ entry }: { entry: unknown }) => entry),
      upsertAaliyahSessionContext: vi.fn(async ({ session }: { session: typeof storedSession }) => {
        storedSession = session;
        return session;
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
    expect(repository.createAaliyahFollowThroughHistoryEntry).toHaveBeenCalled();
    expect(storedSession.interactionState.workingItem).toBeNull();
  });

  it("rejects escalation without an explicit escalation target or class", async () => {
    const storedSession = buildSession();
    const repository = {
      getAaliyahFollowThroughRecordBySource: vi.fn(async () => null),
      upsertAaliyahFollowThroughRecord: vi.fn(async ({ record }: { record: unknown }) => record),
      createAaliyahFollowThroughHistoryEntry: vi.fn(async ({ entry }: { entry: unknown }) => entry),
      upsertAaliyahSessionContext: vi.fn(async ({ session }: { session: typeof storedSession }) => session),
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
});
