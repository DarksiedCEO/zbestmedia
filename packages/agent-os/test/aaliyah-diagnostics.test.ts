import { describe, expect, it, vi } from "vitest";

import { AaliyahDiagnosticsService } from "../src/aaliyah/diagnostics.js";

describe("Aaliyah diagnostics service", () => {
  it("aggregates bounded-window drift, closure, interruption, and reset signals from durable sources", async () => {
    const repository = {
      listAaliyahDiagnosticsEvents: vi.fn(async () => [
        {
          tenantId: "11111111-1111-4111-8111-111111111111",
          eventId: "event:1",
          actorId: "actor-1",
          principalContext: "founder",
          activeMode: "founder",
          eventType: "runtime_result",
          eventSource: "aaliyah_runtime",
          signalKey: "runtime_fallback:ambiguous_request",
          payload: {
            fallbackOutcome: "escalate_for_clarification",
            fallbackReason: "ambiguous_request"
          },
          createdAt: "2026-03-15T00:00:00.000Z"
        },
        {
          tenantId: "11111111-1111-4111-8111-111111111111",
          eventId: "event:2",
          actorId: "actor-1",
          principalContext: "founder",
          activeMode: "founder",
          eventType: "runtime_result",
          eventSource: "aaliyah_runtime",
          signalKey: "runtime_fallback:low_confidence",
          payload: {
            fallbackOutcome: "defer_due_to_low_confidence",
            fallbackReason: "low_confidence"
          },
          createdAt: "2026-03-15T00:10:00.000Z"
        },
        {
          tenantId: "11111111-1111-4111-8111-111111111111",
          eventId: "event:3",
          actorId: "actor-1",
          principalContext: "founder",
          activeMode: "founder",
          eventType: "session_reset",
          eventSource: "aaliyah_session",
          signalKey: "session_reset:idle_expired",
          payload: {
            resetReason: "idle_expired",
            resetScope: "soft",
            expiredPendingDisambiguation: true
          },
          createdAt: "2026-03-15T00:20:00.000Z"
        },
        {
          tenantId: "11111111-1111-4111-8111-111111111111",
          eventId: "event:4",
          actorId: "actor-1",
          principalContext: "founder",
          activeMode: "founder",
          eventType: "follow_through_invalid_action",
          eventSource: "aaliyah_follow_through",
          signalKey: "aaliyah_follow_through_terminal_immutable",
          payload: {
            action: "complete"
          },
          createdAt: "2026-03-15T00:30:00.000Z"
        }
      ]),
      listAaliyahFollowThroughHistoryWindow: vi.fn(async () => [
        {
          tenantId: "11111111-1111-4111-8111-111111111111",
          eventId: "fth:1",
          followThroughId: "follow:1",
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
          actorId: "actor-1",
          createdAt: "2026-03-15T00:40:00.000Z"
        },
        {
          tenantId: "11111111-1111-4111-8111-111111111111",
          eventId: "fth:2",
          followThroughId: "follow:2",
          action: "escalate",
          previousStatus: "active",
          resultingStatus: "escalated",
          closureState: "escalated",
          closureReason: "founder_declared_escalated",
          nextGovernedAction: "await_founder_review",
          founderDeclaredCompletion: false,
          downstreamActionRef: null,
          escalationTarget: "cto",
          escalationClass: "founder_attention",
          escalationRationale: "critical issue",
          escalationProvenance: { incidentId: "incident:1" },
          note: null,
          actorId: "actor-1",
          createdAt: "2026-03-15T00:50:00.000Z"
        }
      ]),
      listVoiceCallRecordsWindow: vi.fn(async () => [
        {
          interruptionClass: "interrupt_now",
          createdAt: "2026-03-15T00:05:00.000Z"
        },
        {
          interruptionClass: "review_soon",
          createdAt: "2026-03-15T00:15:00.000Z"
        }
      ]),
      listEmailDraftReviewItems: vi.fn(async () => [
        { createdAt: "2026-03-14T23:00:00.000Z" },
        { createdAt: "2026-03-14T20:00:00.000Z" }
      ]),
      listIncidentRecords: vi.fn(async () => [
        { severity: "critical" },
        { severity: "high" }
      ])
    } as any;

    const service = new AaliyahDiagnosticsService(repository);
    const summary = await service.getSummary({
      tenantId: "11111111-1111-4111-8111-111111111111",
      actorId: "actor-1",
      principalContext: "founder",
      window: "7d",
      generatedAt: "2026-03-15T01:00:00.000Z"
    });

    expect(summary.snapshot.window).toBe("7d");
    expect(summary.snapshot.enforcementTriggers.lowConfidenceDeferCount).toBe(1);
    expect(summary.snapshot.enforcementTriggers.ambiguityFallbackCount).toBe(1);
    expect(summary.snapshot.closureQuality.founderDeclaredCompletionCount).toBe(1);
    expect(summary.snapshot.interruptionLoad.interruptNowCount).toBe(1);
    expect(summary.snapshot.sessionReset.disambiguationExpiryCount).toBe(1);
    expect(summary.snapshot.founderFriction.openCriticalIncidentCount).toBe(1);
    expect(summary.snapshot.reviewQueueLatency.pendingReviewCount).toBe(2);
  });
});
