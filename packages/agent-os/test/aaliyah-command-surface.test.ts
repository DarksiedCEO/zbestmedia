import { describe, expect, it, vi } from "vitest";

import { AaliyahCommandSurfaceService } from "../src/aaliyah/command-surface.js";

describe("Aaliyah command surface", () => {
  const org = {
    getManifestVersion: vi.fn(() => "2026-03-12.v1")
  } as any;

  const briefing = {
    generateBriefing: vi.fn(async ({ mode }: { mode: "founder" | "zbestmedia" }) => ({
      briefingId: "briefing:1",
      generatedAt: "2026-03-14T00:00:00.000Z",
      activeMode: mode,
      manifestVersion: "2026-03-12.v1",
      topPriorities: [
        {
          itemId: "incident:1",
          category: "top_priorities",
          title: "Release gate degraded",
          summary: "Critical ops issue.",
          urgency: "urgent",
          owner: {
            executiveId: "cto",
            departmentId: "technology-engineering",
            leadAgentId: "code-sentinel",
            subAgentId: "slo-enforcer",
            sourceLane: "code-sentinel"
          },
          recommendedAction: "Clear release blocker.",
          interruptionClass: "interrupt_now",
          requiresFounderAttention: true,
          provenanceReferences: ["incident:1"]
        }
      ],
      waitingOnMe: [],
      revenueWatch: [],
      operationsWatch: [],
      calendarWatch: [],
      relationshipWatch: [],
      recommendedActions: [
        {
          actionId: "briefing-action:1",
          title: "Clear release blocker",
          action: "Clear release blocker.",
          urgency: "urgent",
          sourceItemId: "incident:1"
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
  } as any;

  const email = {
    listReviewItems: vi.fn(async () => [
      {
        reviewItemId: "review:1",
        draftId: "draft:1",
        accountId: "account:1",
        threadId: "thread:1",
        assignmentRecordId: "assignment:1",
        runRecordId: "run:1",
        intentCategory: "lead_inquiry",
        priority: "high",
        riskLevel: "medium",
        requiredApproval: true,
        reviewStatus: "pending_review",
        recommendedExecutiveId: "cmo",
        recommendedDepartmentId: "marketing",
        recommendedLeadAgentId: "kobe",
        recommendedSubAgentId: null,
        draftSummary: "High-value lead",
        proposedReplySubject: "Re: Lead",
        proposedReplyBody: "reply",
        confidenceScore: 0.8,
        riskScore: 0.2,
        escalationRecommended: false,
        blockedAutoSend: true,
        manifestVersion: "2026-03-12.v1",
        routingProvenance: {},
        createdAt: "2026-03-14T00:00:00.000Z",
        updatedAt: "2026-03-14T00:00:00.000Z",
        reviewedAt: null,
        reviewedBy: null,
        reviewNote: null
      }
    ])
  } as any;

  const voice = {
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
        callSummaryText: "urgent founder request",
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
        recommendedNextAction: "Review founder access request.",
        createdAt: "2026-03-14T00:00:00.000Z",
        updatedAt: "2026-03-14T00:00:00.000Z"
      }
    ])
  } as any;

  const telemetry = {
    getIncidentSummary: vi.fn(async () => ({
      manifestVersion: "2026-03-12.v1",
      generatedAt: "2026-03-14T00:00:00.000Z",
      openBySeverity: { info: 0, warning: 0, critical: 1 },
      openByType: {
        build_integrity_failure: 0,
        dependency_integrity_failure: 0,
        runtime_health_failure: 0,
        migration_integrity_failure: 0,
        route_contract_failure: 0,
        slo_integrity_failure: 1,
        execution_policy_failure: 0,
        execution_runtime_failure: 0
      },
      releaseBlockingOpenCount: 1,
      degradedSurfaces: ["slo"]
    })),
    getOpsStatusSummary: vi.fn(async () => ({
      status: "critical",
      manifestVersion: "2026-03-12.v1",
      generatedAt: "2026-03-14T00:00:00.000Z",
      incidents: {
        manifestVersion: "2026-03-12.v1",
        generatedAt: "2026-03-14T00:00:00.000Z",
        openBySeverity: { info: 0, warning: 0, critical: 1 },
        openByType: {
          build_integrity_failure: 0,
          dependency_integrity_failure: 0,
          runtime_health_failure: 0,
          migration_integrity_failure: 0,
          route_contract_failure: 0,
          slo_integrity_failure: 1,
          execution_policy_failure: 0,
          execution_runtime_failure: 0
        },
        releaseBlockingOpenCount: 1,
        degradedSurfaces: ["slo"]
      },
      executions: {
        manifestVersion: "2026-03-12.v1",
        generatedAt: "2026-03-14T00:00:00.000Z",
        recentByState: {
          requested: 0,
          validated: 0,
          routed: 0,
          blocked: 0,
          executing: 0,
          retriable: 0,
          succeeded: 0,
          failed: 1
        },
        recentFailuresByCategory: { routing_failure: 1 },
        routingFailureCount: 1,
        policyRejectionCount: 0
      },
      codeSentinel: {
        manifestVersion: "2026-03-12.v1",
        generatedAt: "2026-03-14T00:00:00.000Z",
        openIncidentCountBySubAgent: {
          "build-monitor": 0,
          "dependency-watcher": 0,
          "runtime-health-monitor": 0,
          "migration-guardian": 0,
          "route-contract-watcher": 0,
          "slo-enforcer": 1
        },
        openIncidentCountBySignal: {
          build_breakage: 0,
          dependency_drift: 0,
          runtime_health: 0,
          migration_integrity: 0,
          route_contract: 0,
          slo_release_gate: 1
        },
        mostImpactedSubAgent: "slo-enforcer"
      },
      degradedSurfaces: ["slo"]
    }))
  } as any;

  const service = new AaliyahCommandSurfaceService(
    org,
    briefing,
    email,
    voice,
    telemetry,
    {
      getQueue: vi.fn(async ({ mode }: { mode: "founder" | "zbestmedia" }) => ({
        queueId: "queue:1",
        generatedAt: "2026-03-14T00:00:00.000Z",
        activeMode: mode,
        manifestVersion: "2026-03-12.v1",
        itemCountsByType: {
          approval_required: 1,
          voice_escalation: 1,
          incident_attention: 1,
          dispatch_action: 0,
          routing_preview_action: 0,
          founder_recommended_action: 0
        },
        itemCountsByInterruptionClass: {
          interrupt_now: 1,
          same_day_briefing: 1,
          passive_queue: 0,
          silent_log: 0
        },
        topActionableItems: [
          {
            queueItemId: "queue:incident:1",
            sourceSubsystem: "incident_pipeline",
            sourceItemId: "incident:1",
            itemType: "incident_attention",
            title: "Release gate degraded",
            summary: "Critical ops issue.",
            urgency: "urgent",
            risk: "critical",
            confidenceLevel: "high",
            interruptionClass: "interrupt_now",
            activeMode: mode,
            founderAttentionRequired: true,
            recommendedNextAction: "Clear release blocker.",
            allowedNextActions: ["open_incident"],
            provenanceSummary: {
              manifestVersion: "2026-03-12.v1",
              references: ["incident:1"],
              contributingSourceItemIds: ["incident:1"]
            },
            createdAt: "2026-03-14T00:00:00.000Z",
            updatedAt: "2026-03-14T00:00:00.000Z"
          }
        ],
        totalFounderActionableItems: 3,
        items: []
      }))
    } as never,
    {
      getPrioritizedInbox: vi.fn(async ({ mode }: { mode: "founder" | "zbestmedia" }) => ({
        inboxId: "inbox:1",
        generatedAt: "2026-03-14T00:00:00.000Z",
        activeMode: mode,
        manifestVersion: "2026-03-12.v1",
        totalItems: 3,
        countsByTriageClass: {
          act_now: 1,
          review_today: 1,
          blocked: 0,
          stale: 1,
          monitor: 0,
          resolved_or_terminal: 0
        },
        countsByPriorityBand: { p0: 1, p1: 2, p2: 0, p3: 0 },
        topActionableItems: [
          {
            inboxItemId: "inbox:incident:1",
            queueItemId: "queue:incident:1",
            sourceSubsystem: "incident_pipeline",
            sourceItemId: "incident:1",
            itemType: "incident_attention",
            title: "Release gate degraded",
            summary: "Critical ops issue.",
            activeMode: mode,
            urgency: "urgent",
            risk: "critical",
            triageClass: "act_now",
            priorityBand: "p0",
            reasonCodes: ["release_blocking_incident", "interrupt_now_signal"],
            nextFounderAction: "review_incident",
            founderAttentionRequired: true,
            interruptionClass: "interrupt_now",
            confidenceLevel: "high",
            followThroughStatus: null,
            followThroughClosureReason: null,
            nextGovernedAction: null,
            isBlocked: false,
            isStale: false,
            ageSeconds: 600,
            provenanceSummary: {
              manifestVersion: "2026-03-12.v1",
              references: ["incident:1"],
              contributingSourceItemIds: ["incident:1"]
            },
            createdAt: "2026-03-14T00:00:00.000Z",
            updatedAt: "2026-03-14T00:00:00.000Z"
          }
        ],
        blockedItems: [],
        staleItems: [],
        items: []
      }))
    } as never,
    {
      resolvePreferences: vi.fn(async ({ mode }: { mode: "founder" | "zbestmedia" }) => ({
        activeMode: mode,
        briefingLength: "compact",
        interruptionTolerance: "minimal",
        approvalVisibility: "urgent_only",
        tonePreference: "concise",
        modeVisibility: "strict",
        appliedPreferences: []
      }))
    } as never
  );

  it("composes a founder command surface from governed subsystems", async () => {
    const shell = await service.generateCommandSurface({
      tenantId: "tenant",
      mode: "founder"
    });

    expect(shell.activeMode).toBe("founder");
    expect(shell.openApprovals.totalPending).toBe(1);
    expect(shell.openVoiceEscalations.totalPending).toBe(1);
    expect(shell.quickActions.some((action) => action.actionId === "open_approval_queue")).toBe(true);
    expect(shell.whatMattersNow[0]?.itemId).toBe("queue:incident:1");
    expect(shell.confidenceSummary.overallConfidenceLevel).toBe("high");
    expect(shell.interruptionQueue.interruptNowCount).toBeGreaterThan(0);
    expect(shell.founderReviewQueue.totalFounderActionableItems).toBe(3);
    expect(shell.founderInbox.totalItems).toBe(3);
  });

  it("marks voice review quick action disabled when there are no pending escalations", () => {
    const actions = service.listQuickActions({
      tenantId: "tenant",
      mode: "zbestmedia",
      pendingApprovalCount: 0,
      pendingVoiceEscalationCount: 0
    });

    const voiceAction = actions.find((action) => action.actionId === "review_voice_escalations");
    expect(voiceAction?.availabilityStatus).toBe("disabled");
    expect(actions.find((action) => action.actionType === "switch_mode")?.defaultParameters).toEqual({
      targetMode: "founder"
    });
  });

  it("uses founder preferences to reduce noise in the shell", async () => {
    const shell = await service.generateCommandSurface({
      tenantId: "tenant",
      mode: "founder"
    });

    expect(shell.openApprovals.totalPending).toBe(1);
    expect(shell.whatMattersNow.length).toBeLessThanOrEqual(2);
    expect(shell.recommendedNextActions[0]?.action.length).toBeLessThanOrEqual(90);
  });
});
