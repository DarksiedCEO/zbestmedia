import { describe, expect, it, vi } from "vitest";

import { AaliyahFounderInboxTriageService } from "../src/aaliyah/triage.js";

describe("Aaliyah founder inbox triage", () => {
  const org = {
    getManifestVersion: vi.fn(() => "2026-03-12.v1")
  } as any;

  const reviewQueue = {
    getQueue: vi.fn(async ({ mode }: { mode: "founder" | "zbestmedia" }) => ({
      queueId: "queue:1",
      generatedAt: "2026-03-15T12:00:00.000Z",
      activeMode: mode,
      manifestVersion: "2026-03-12.v1",
      itemCountsByType: {
        approval_required: 1,
        voice_escalation: 0,
        incident_attention: 1,
        dispatch_action: 1,
        routing_preview_action: 0,
        founder_recommended_action: 1
      },
      itemCountsByInterruptionClass: {
        interrupt_now: 1,
        same_day_briefing: 1,
        passive_queue: 1,
        silent_log: 1
      },
      topActionableItems: [],
      totalFounderActionableItems: 4,
      items: [
        {
          queueItemId: "queue:incident:1",
          sourceSubsystem: "incident_pipeline",
          sourceItemId: "incident:1",
          itemType: "incident_attention",
          title: "Release gate degraded",
          summary: "Critical issue blocking release.",
          urgency: "urgent",
          risk: "critical",
          confidenceLevel: "high",
          interruptionClass: "interrupt_now",
          activeMode: mode,
          founderAttentionRequired: true,
          recommendedNextAction: "Review incident.",
          allowedNextActions: ["open_incident"],
          provenanceSummary: {
            manifestVersion: "2026-03-12.v1",
            references: ["incident:1"],
            contributingSourceItemIds: ["incident:1"]
          },
          createdAt: "2026-03-15T11:30:00.000Z",
          updatedAt: "2026-03-15T11:30:00.000Z"
        },
        {
          queueItemId: "queue:review:1",
          sourceSubsystem: "email_review_queue",
          sourceItemId: "review:1",
          itemType: "approval_required",
          title: "Review founder reply",
          summary: "Approval is waiting.",
          urgency: "high",
          risk: "medium",
          confidenceLevel: "high",
          interruptionClass: "same_day_briefing",
          activeMode: mode,
          founderAttentionRequired: true,
          recommendedNextAction: "Approve or revise.",
          allowedNextActions: ["approve_review_item", "reject_review_item"],
          provenanceSummary: {
            manifestVersion: "2026-03-12.v1",
            references: ["review:1"],
            contributingSourceItemIds: ["review:1"]
          },
          createdAt: "2026-03-15T06:00:00.000Z",
          updatedAt: "2026-03-15T06:00:00.000Z"
        },
        {
          queueItemId: "queue:dispatch:1",
          sourceSubsystem: "email_dispatch",
          sourceItemId: "dispatch:1",
          itemType: "dispatch_action",
          title: "Dispatch approved email",
          summary: "Ready to send if policy allows.",
          urgency: "normal",
          risk: "medium",
          confidenceLevel: "medium",
          interruptionClass: "passive_queue",
          activeMode: mode,
          founderAttentionRequired: true,
          recommendedNextAction: "Dispatch it.",
          allowedNextActions: [],
          provenanceSummary: {
            manifestVersion: "2026-03-12.v1",
            references: ["dispatch:1"],
            contributingSourceItemIds: ["dispatch:1"]
          },
          createdAt: "2026-03-15T09:00:00.000Z",
          updatedAt: "2026-03-15T09:00:00.000Z"
        },
        {
          queueItemId: "queue:recommendation:1",
          sourceSubsystem: "briefing_runtime",
          sourceItemId: "recommendation:1",
          itemType: "founder_recommended_action",
          title: "Briefing follow-up",
          summary: "Already closed.",
          urgency: "low",
          risk: "low",
          confidenceLevel: "high",
          interruptionClass: "silent_log",
          activeMode: mode,
          founderAttentionRequired: false,
          recommendedNextAction: "None.",
          allowedNextActions: ["refresh_founder_briefing"],
          provenanceSummary: {
            manifestVersion: "2026-03-12.v1",
            references: ["recommendation:1"],
            contributingSourceItemIds: ["recommendation:1"]
          },
          createdAt: "2026-03-15T11:55:00.000Z",
          updatedAt: "2026-03-15T11:55:00.000Z"
        }
      ]
    }))
  } as any;

  const repository = {
    listAaliyahFollowThroughRecordsBySourceIds: vi.fn(async ({ sourceItemIds }: { sourceItemIds: string[] }) =>
      sourceItemIds
        .filter((sourceItemId) => sourceItemId === "recommendation:1")
        .map((sourceItemId) => ({
          tenantId: "tenant",
          followThroughId: `follow-through:${sourceItemId}`,
          version: 1,
          sessionId: "session:1",
          actorId: "actor-1",
          principalContext: "founder",
          activeMode: "founder",
          companyScope: "zbestmedia",
          workingItemType: "founder_queue_item",
          sourceSubsystem: "briefing_runtime",
          sourceItemId,
          queueItemId: "queue:recommendation:1",
          reviewItemId: null,
          callId: null,
          incidentId: null,
          dispatchId: null,
          title: "Briefing follow-up",
          summary: "Already closed.",
          status: "completed",
          closureState: "completed",
          closureReason: "founder_declared_completed",
          nextGovernedAction: "none_terminal",
          founderDeclaredCompletion: true,
          downstreamActionRef: null,
          escalationTarget: null,
          escalationClass: null,
          escalationRationale: null,
          escalationProvenance: null,
          note: null,
          provenance: {
            queueItemId: "queue:recommendation:1",
            reviewItemId: null,
            callId: null,
            incidentId: null,
            dispatchId: null,
            sessionVersion: 1
          },
          createdAt: "2026-03-15T11:56:00.000Z",
          updatedAt: "2026-03-15T11:56:00.000Z",
          closedAt: "2026-03-15T11:56:00.000Z"
        }))
    )
  } as any;

  const service = new AaliyahFounderInboxTriageService(org, reviewQueue, repository);

  it("ranks founder inbox items deterministically and exposes reason codes", async () => {
    const inbox = await service.getPrioritizedInbox({
      tenantId: "tenant",
      actorId: "actor-1",
      principalContext: "founder",
      mode: "founder",
      generatedAt: "2026-03-15T12:00:00.000Z"
    });

    expect(inbox.items.map((item) => item.queueItemId)).toEqual([
      "queue:incident:1",
      "queue:dispatch:1",
      "queue:review:1",
      "queue:recommendation:1"
    ]);
    expect(inbox.items[0]?.triageClass).toBe("act_now");
    expect(inbox.items[0]?.reasonCodes).toContain("release_blocking_incident");
    expect(inbox.items[1]?.triageClass).toBe("blocked");
    expect(inbox.items[1]?.reasonCodes).toContain("blocked_no_allowed_actions");
    expect(inbox.items[2]?.triageClass).toBe("stale");
    expect(inbox.items[2]?.reasonCodes).toContain("pending_review_over_sla");
    expect(inbox.items[3]?.triageClass).toBe("resolved_or_terminal");
    expect(inbox.items[3]?.reasonCodes).toContain("terminal_state");
  });

  it("returns filtered blocked and stale subsets from the prioritized inbox", async () => {
    const blocked = await service.getBlockedItems({
      tenantId: "tenant",
      actorId: "actor-1",
      principalContext: "founder",
      mode: "founder",
      generatedAt: "2026-03-15T12:00:00.000Z"
    });
    const stale = await service.getStaleItems({
      tenantId: "tenant",
      actorId: "actor-1",
      principalContext: "founder",
      mode: "founder",
      generatedAt: "2026-03-15T12:00:00.000Z"
    });

    expect(blocked).toHaveLength(1);
    expect(blocked[0]?.queueItemId).toBe("queue:dispatch:1");
    expect(stale).toHaveLength(1);
    expect(stale[0]?.queueItemId).toBe("queue:review:1");
  });

  it("denies operator principal contexts from reading the prioritized founder inbox", async () => {
    await expect(service.getPrioritizedInbox({
      tenantId: "tenant",
      actorId: "actor-1",
      principalContext: "operator",
      mode: "founder",
      generatedAt: "2026-03-15T12:00:00.000Z"
    })).rejects.toThrowError("aaliyah_principal_context_denied");
  });
});
