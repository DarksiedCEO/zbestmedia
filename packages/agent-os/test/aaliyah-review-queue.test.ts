import { describe, expect, it, vi } from "vitest";

import { AaliyahFounderReviewQueueService } from "../src/aaliyah/review-queue.js";
import { AgentOrgService } from "../src/org/service.js";

describe("Aaliyah unified founder review queue", () => {
  const service = new AaliyahFounderReviewQueueService(
    new AgentOrgService(),
    {
      generateBriefing: vi.fn(async ({ mode }: { mode: "founder" | "zbestmedia" }) => ({
        briefingId: "briefing:1",
        generatedAt: "2026-03-15T00:00:00.000Z",
        activeMode: mode,
        manifestVersion: "2026-03-12.v1",
        topPriorities: [],
        waitingOnMe: [],
        revenueWatch: [],
        operationsWatch: [],
        calendarWatch: [],
        relationshipWatch: [],
        recommendedActions: [
          {
            actionId: "action:incident",
            title: "Worker SLO degradation",
            action: "Clear the worker freshness issue before release.",
            urgency: "urgent",
            sourceItemId: "incident:incident:1"
          }
        ],
        interruptSummary: {
          interruptNowCount: 1,
          reviewSoonCount: 0,
          canWaitCount: 0
        },
        confidenceSummary: {
          status: "critical",
          lowConfidenceSignals: 0,
          degradedSurfaces: ["slo"]
        },
        sourceMetadata: {
          orgManifestVersion: "2026-03-12.v1",
          aaliyahRegistryVersion: "2026-03-12.aaliyah.v1",
          generatedFrom: {
            pendingReviewCount: 1,
            openIncidentCount: 1,
            releaseBlockingIncidentCount: 1,
            recentExecutionFailureCount: 0
          }
        }
      }))
    } as never,
    {
      listReviewItems: vi.fn(async ({ status }: { status?: string }) => {
        if (status === "approved") {
          return [
            {
              reviewItemId: "review:approved:1",
              draftId: "draft:approved:1",
              accountId: "account:1",
              threadId: "thread:approved:1",
              assignmentRecordId: "assignment:approved:1",
              runRecordId: "run:approved:1",
              intentCategory: "lead_inquiry",
              priority: "high",
              riskLevel: "low",
              requiredApproval: true,
              reviewStatus: "approved",
              recommendedExecutiveId: "cmo",
              recommendedDepartmentId: "marketing",
              recommendedLeadAgentId: "kobe",
              recommendedSubAgentId: null,
              draftSummary: "Approved high-priority lead reply.",
              proposedReplySubject: "Lead follow-up",
              proposedReplyBody: "body",
              confidenceScore: 0.91,
              riskScore: 0.2,
              escalationRecommended: false,
              blockedAutoSend: true,
              manifestVersion: "2026-03-12.v1",
              routingProvenance: {},
              createdAt: "2026-03-15T00:00:00.000Z",
              updatedAt: "2026-03-15T00:00:00.000Z",
              reviewedAt: "2026-03-15T00:10:00.000Z",
              reviewedBy: "actor-1",
              reviewNote: null
            }
          ];
        }
        return [
          {
            reviewItemId: "review:1",
            draftId: "draft:1",
            accountId: "account:1",
            threadId: "thread:1",
            assignmentRecordId: "assignment:1",
            runRecordId: "run:1",
            intentCategory: "meeting_request",
            priority: "urgent",
            riskLevel: "medium",
            requiredApproval: true,
            reviewStatus: "pending_review",
            recommendedExecutiveId: "coo",
            recommendedDepartmentId: "operations",
            recommendedLeadAgentId: null,
            recommendedSubAgentId: null,
            draftSummary: "Need founder approval for a time-sensitive meeting reply.",
            proposedReplySubject: "Meeting request reply",
            proposedReplyBody: "body",
            confidenceScore: 0.88,
            riskScore: 0.3,
            escalationRecommended: false,
            blockedAutoSend: true,
            manifestVersion: "2026-03-12.v1",
            routingProvenance: {},
            createdAt: "2026-03-15T00:00:00.000Z",
            updatedAt: "2026-03-15T00:00:00.000Z",
            reviewedAt: null,
            reviewedBy: null,
            reviewNote: null
          }
        ];
      })
    } as never,
    {
      listPendingEscalations: vi.fn(async () => [
        {
          tenantId: "tenant",
          callId: "voice:1",
          externalCallId: null,
          sourceSystem: "voice-gateway",
          callerPhoneNumber: "+13105551212",
          callerDisplayName: "Taylor Client",
          callerOrganizationName: null,
          transcript: "Need founder now.",
          callSummaryText: "Urgent founder access request.",
          durationSeconds: 30,
          intent: "executive_access_request",
          urgency: "high",
          riskLevel: "high",
          companyMode: "zbestmedia",
          routingTarget: {
            targetType: "founder_review",
            executiveId: "coo",
            departmentId: "operations",
            leadAgentId: null,
            subAgentId: null,
            executionAgentId: null,
            requiresEscalation: true
          },
          assignmentRecordId: "assignment:voice:1",
          runRecordId: "run:voice:1",
          outcome: "escalated",
          founderAttentionRequired: true,
          escalationRecommended: true,
          interruptionClass: "interrupt_now",
          recommendedNextAction: "Review the founder access request.",
          createdAt: "2026-03-15T00:00:00.000Z",
          updatedAt: "2026-03-15T00:00:00.000Z"
        }
      ])
    } as never,
    {
      listIncidents: vi.fn(async () => [
        {
          tenantId: "tenant",
          incidentId: "incident:1",
          incidentType: "slo_integrity_failure",
          severity: "critical",
          status: "open",
          owningExecutiveId: "cto",
          owningDepartmentId: "technology-engineering",
          owningLeadAgentId: "code-sentinel",
          owningSubAgentId: "slo-enforcer",
          sourceSystem: "ops",
          relatedSignalType: "slo_release_gate",
          relatedAssignmentRecordId: null,
          relatedRunRecordId: null,
          title: "Worker SLO degradation",
          summary: "Worker freshness is release-blocking.",
          details: {},
          recommendedAction: "Clear the worker freshness issue before release.",
          releaseBlocking: true,
          createdAt: "2026-03-15T00:00:00.000Z",
          updatedAt: "2026-03-15T00:00:00.000Z",
          acknowledgedAt: null,
          acknowledgedBy: null,
          resolvedAt: null,
          resolvedBy: null,
          resolutionNote: null
        }
      ])
    } as never
  );

  it("composes queue items from governed sources", async () => {
    const queue = await service.getQueue({ tenantId: "tenant", mode: "founder" });

    expect(queue.totalFounderActionableItems).toBeGreaterThan(0);
    expect(queue.itemCountsByType.approval_required).toBe(1);
    expect(queue.itemCountsByType.voice_escalation).toBe(1);
    expect(queue.itemCountsByType.dispatch_action).toBe(1);
  });

  it("deduplicates briefing actions behind higher-precedence incident items", async () => {
    const queue = await service.getQueue({ tenantId: "tenant", mode: "founder" });
    const incidentItems = queue.items.filter((item) => item.sourceItemId === "incident:incident:1");

    expect(incidentItems).toHaveLength(1);
    expect(incidentItems[0]?.itemType).toBe("incident_attention");
    expect(incidentItems[0]?.provenanceSummary.contributingSourceItemIds).toContain("incident:incident:1");
  });
});
