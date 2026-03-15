import { describe, expect, it, vi } from "vitest";

import { AaliyahFounderBriefingService } from "../src/aaliyah/briefing.js";
import { AaliyahCommandSurfaceService } from "../src/aaliyah/command-surface.js";
import { AaliyahRuntimeService } from "../src/aaliyah/runtime.js";
import { AgentOrgService } from "../src/org/service.js";

describe("Aaliyah runtime agent", () => {
  const briefingService = {
    generateBriefing: vi.fn(async ({ mode }: { mode: "founder" | "zbestmedia" }) => ({
      briefingId: "briefing:1",
      generatedAt: "2026-03-14T00:00:00.000Z",
      activeMode: mode,
      manifestVersion: "2026-03-12.v1",
      topPriorities: [],
      waitingOnMe: [],
      revenueWatch: [],
      operationsWatch: [],
      calendarWatch: [],
      relationshipWatch: [],
      recommendedActions: [],
      interruptSummary: {
        interruptNowCount: 0,
        reviewSoonCount: 0,
        canWaitCount: 0
      },
      confidenceSummary: {
        status: "healthy",
        lowConfidenceSignals: 0,
        degradedSurfaces: []
      },
      sourceMetadata: {
        orgManifestVersion: "2026-03-12.v1",
        aaliyahRegistryVersion: "2026-03-12.aaliyah.v1",
        generatedFrom: {
          pendingReviewCount: 0,
          openIncidentCount: 0,
          releaseBlockingIncidentCount: 0,
          recentExecutionFailureCount: 0
        }
      }
    }))
  } as unknown as AaliyahFounderBriefingService;

  const emailService = {
    listReviewItems: vi.fn(async () => [
      {
        tenantId: "tenant",
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
        draftSummary: "summary",
        proposedReplySubject: "subject",
        proposedReplyBody: "body",
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
    ]),
    approveReviewItem: vi.fn(async () => ({
      reviewItemId: "review:1",
      reviewStatus: "approved"
    })),
    rejectReviewItem: vi.fn(async () => ({
      reviewItemId: "review:1",
      reviewStatus: "rejected"
    })),
    requestReviewRevision: vi.fn(async () => ({
      reviewItemId: "review:1",
      reviewStatus: "revision_requested"
    })),
    dispatchApprovedReviewItem: vi.fn(async () => ({
      sent: true,
      dispatch: {
        dispatchId: "dispatch:1",
        dispatchStatus: "dispatch_succeeded"
      }
    }))
  } as any;

  const commandSurfaceService = {
    generateCommandSurface: vi.fn(async ({ tenantId, mode }: { tenantId: string; mode: "founder" | "zbestmedia" }) => ({
      shellId: "shell:1",
      generatedAt: "2026-03-14T00:00:00.000Z",
      activeMode: mode,
      manifestVersion: "2026-03-12.v1",
      founderBriefingSummary: await briefingService.generateBriefing({ tenantId, mode }),
      whatMattersNow: [],
      waitingOnMe: [],
      openApprovals: {
        totalPending: 1,
        items: await emailService.listReviewItems()
      },
      openIncidentSummary: await telemetryService.getIncidentSummary(),
      opsStatusSummary: await telemetryService.getOpsStatusSummary(),
      openVoiceEscalations: {
        totalPending: 1,
        items: await voiceService.listPendingEscalations(),
        interruptNowCount: 1
      },
      recommendedNextActions: [],
      interruptQueueSummary: {
        interruptNowCount: 1,
        sameDayBriefingCount: 0,
        passiveQueueCount: 0,
        silentLogCount: 0
      },
      confidenceSummary: {
        generatedAt: "2026-03-14T00:00:00.000Z",
        activeMode: mode,
        overallConfidenceLevel: "high",
        highConfidenceCount: 2,
        mediumConfidenceCount: 0,
        lowConfidenceCount: 0,
        deferredCount: 0,
        suppressedCount: 0,
        topReasonCodes: ["data_complete"],
        items: []
      },
      interruptionQueue: {
        generatedAt: "2026-03-14T00:00:00.000Z",
        activeMode: mode,
        items: [],
        interruptNowCount: 1,
        sameDayBriefingCount: 0,
        passiveQueueCount: 0,
        silentLogCount: 0
      },
      founderReviewQueue: {
        queueId: "queue:1",
        generatedAt: "2026-03-14T00:00:00.000Z",
        activeMode: mode,
        manifestVersion: "2026-03-12.v1",
        itemCountsByType: {
          approval_required: 1,
          voice_escalation: 1,
          incident_attention: 0,
          dispatch_action: 0,
          routing_preview_action: 0,
          founder_recommended_action: 0
        },
        itemCountsByInterruptionClass: {
          interrupt_now: 1,
          same_day_briefing: 0,
          passive_queue: 0,
          silent_log: 0
        },
        topActionableItems: [],
        totalFounderActionableItems: 2
      },
      quickActions: [
        {
          actionId: "open_approval_queue",
          actionType: "open_approval_queue",
          label: "Open approvals (1)",
          targetIntent: "get_waiting_approvals",
          allowedParameters: ["limit"],
          defaultParameters: {},
          approvalRequired: false,
          availabilityStatus: "available",
          availabilityReason: null
        }
      ],
      provenanceSummary: {
        orgManifestVersion: "2026-03-12.v1",
        aaliyahRegistryVersion: "2026-03-12.aaliyah.v1",
        generatedFrom: {
          pendingApprovalCount: 1,
          pendingVoiceEscalationCount: 1,
          releaseBlockingIncidentCount: 0,
          degradedSurfaceCount: 0
        }
      }
    })),
    listQuickActions: vi.fn(() => [
      {
        actionId: "open_approval_queue",
        actionType: "open_approval_queue",
        label: "Open approvals (1)",
        targetIntent: "get_waiting_approvals",
        allowedParameters: ["limit"],
        defaultParameters: {},
        approvalRequired: false,
        availabilityStatus: "available",
        availabilityReason: null
      }
    ]),
    getInterruptionQueue: vi.fn(async ({ mode }: { mode: "founder" | "zbestmedia" }) => ({
      generatedAt: "2026-03-14T00:00:00.000Z",
      activeMode: mode,
      items: [],
      interruptNowCount: 1,
      sameDayBriefingCount: 0,
      passiveQueueCount: 0,
      silentLogCount: 0
    })),
    getConfidenceSummary: vi.fn(async ({ mode }: { mode: "founder" | "zbestmedia" }) => ({
      generatedAt: "2026-03-14T00:00:00.000Z",
      activeMode: mode,
      overallConfidenceLevel: "high",
      highConfidenceCount: 2,
      mediumConfidenceCount: 0,
      lowConfidenceCount: 0,
      deferredCount: 0,
      suppressedCount: 0,
      topReasonCodes: ["data_complete"],
      items: []
    })),
    getQuickActionById: vi.fn(() => ({
      actionId: "open_approval_queue",
      actionType: "open_approval_queue",
      label: "Open approvals (1)",
      targetIntent: "get_waiting_approvals",
      allowedParameters: ["limit"],
      defaultParameters: {},
      approvalRequired: false,
      availabilityStatus: "available",
      availabilityReason: null
    }))
  } as unknown as AaliyahCommandSurfaceService;

  const voiceService = {
    processInboundCall: vi.fn(async () => ({
      call: {
        callId: "voice-call:1",
        intent: "executive_access_request"
      },
      summary: {
        callerDisplay: "Taylor Client",
        founderAttentionRequired: true
      }
    })),
    getCall: vi.fn(async () => ({
      callId: "voice-call:1",
      intent: "executive_access_request"
    })),
    listPendingEscalations: vi.fn(async () => [{ callId: "voice-call:1" }])
  } as any;

  const telemetryService = {
    getOpsStatusSummary: vi.fn(async () => ({
      status: "warning",
      manifestVersion: "2026-03-12.v1",
      generatedAt: "2026-03-14T00:00:00.000Z",
      incidents: {
        manifestVersion: "2026-03-12.v1",
        generatedAt: "2026-03-14T00:00:00.000Z",
        openBySeverity: { info: 0, warning: 1, critical: 0 },
        openByType: {
          build_integrity_failure: 0,
          dependency_integrity_failure: 0,
          runtime_health_failure: 0,
          migration_integrity_failure: 0,
          route_contract_failure: 0,
          slo_integrity_failure: 0,
          execution_policy_failure: 0,
          execution_runtime_failure: 0
        },
        releaseBlockingOpenCount: 0,
        degradedSurfaces: []
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
          succeeded: 1,
          failed: 0
        },
        recentFailuresByCategory: {},
        routingFailureCount: 0,
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
          "slo-enforcer": 0
        },
        openIncidentCountBySignal: {
          build_breakage: 0,
          dependency_drift: 0,
          runtime_health: 0,
          migration_integrity: 0,
          route_contract: 0,
          slo_release_gate: 0
        },
        mostImpactedSubAgent: null
      },
      degradedSurfaces: []
    })),
    getIncidentSummary: vi.fn(async () => ({
      manifestVersion: "2026-03-12.v1",
      generatedAt: "2026-03-14T00:00:00.000Z",
      openBySeverity: { info: 0, warning: 1, critical: 0 },
      openByType: {
        build_integrity_failure: 0,
        dependency_integrity_failure: 0,
        runtime_health_failure: 0,
        migration_integrity_failure: 0,
        route_contract_failure: 0,
        slo_integrity_failure: 0,
        execution_policy_failure: 0,
        execution_runtime_failure: 0
      },
      releaseBlockingOpenCount: 0,
      degradedSurfaces: []
    }))
  } as any;

  const adminService = {
    getSupportedRoutingCategories: vi.fn(() => [
      {
        category: "brand_identity",
        responsibilityKey: "brand_identity_governance",
        operationalSignalType: null,
        requiresDisambiguation: false,
        supported: true
      }
    ]),
    previewRoutingDecision: vi.fn(() => ({
      requestedCategory: "brand_identity",
      resolvedDepartment: "marketing",
      resolvedExecutive: "cmo",
      resolvedLeadAgentId: "brandyn",
      resolvedSubAgentId: null,
      executionAgentId: "brandyn",
      responsibilityKey: "brand_identity_governance",
      operationalSignalType: null,
      policyValidated: true,
      trace: ["brand_identity -> brandyn"]
    }))
  } as any;

  const preferenceService = {
    listPreferences: vi.fn(async ({ mode }: { mode: "founder" | "zbestmedia" }) => ({
      generatedAt: "2026-03-15T00:00:00.000Z",
      activeMode: mode,
      defaults: {
        activeMode: mode,
        briefingLength: "standard",
        interruptionTolerance: "standard",
        approvalVisibility: "all_pending",
        tonePreference: "balanced",
        modeVisibility: "strict",
        appliedPreferences: []
      },
      items: []
    }))
  } as any;

  const memoryBoundaryService = {
    getSummary: vi.fn(({ activeMode }: { activeMode: "founder" | "zbestmedia" }) => ({
      generatedAt: "2026-03-15T00:00:00.000Z",
      activeMode,
      supportedModes: ["founder", "zbestmedia"],
      supportedCompanies: ["zbestmedia"],
      founderAggregationRule: "single_company_detail_allowed_multi_company_summary_only",
      decisions: []
    })),
    validate: vi.fn(({ activeMode, requestedMode }: { activeMode: "founder" | "zbestmedia"; requestedMode: "founder" | "zbestmedia" }) => ({
      decisionId: "boundary:1",
      activeMode,
      requestedMode,
      requestedCompanies: [requestedMode === "founder" ? "zbestmedia" : requestedMode],
      detailLevel: requestedMode === "founder" ? "summary" : "detail",
      access: "allowed",
      founderSummaryOnly: false,
      reasonCodes: ["valid_scope"]
    }))
  } as any;

  const baseSession = {
    sessionId: "aaliyah-session:1",
    tenantId: "tenant",
    actorId: "actor-1",
    principalContext: "founder",
    companyScope: "zbestmedia",
    activeModeState: {
      activeMode: "founder",
      previousMode: null,
      switchedAt: "2026-03-15T00:00:00.000Z",
      switchReason: "fallback_to_default",
      boundaryDecisionId: null
    },
    interactionState: {
      lastInteractionAt: "2026-03-15T00:00:00.000Z",
      lastIntent: null,
      lastResolvedIntent: null,
      intentTrail: [],
      workingItem: {
        contextId: "working:1",
        workingItemType: "founder_queue_item",
        sourceSubsystem: "email_review_queue",
        sourceItemId: "review:1",
        queueItemId: "queue:item:1",
        reviewItemId: "review:1",
        callId: null,
        incidentId: null,
        dispatchId: null,
        title: "subject",
        summary: "summary",
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
      reviewApprovalContext: {
        reviewItemId: "review:1",
        draftId: "draft:1",
        accountId: "account:1",
        threadId: "thread:1",
        reviewStatus: "pending_review",
        dispatchReady: false,
        setAt: "2026-03-15T00:00:00.000Z",
        updatedAt: "2026-03-15T00:00:00.000Z",
        invalidatedAt: null,
        invalidationReason: null
      },
      pendingDisambiguation: null
    },
    retentionPolicy: {
      intentTrailMaxEntries: 12,
      idleTtlSeconds: 14400,
      hardTtlSeconds: 86400,
      snapshotIntentTrailEntries: 6
    },
    createdAt: "2026-03-15T00:00:00.000Z",
    updatedAt: "2026-03-15T00:00:00.000Z",
    expiresAt: "2026-03-15T04:00:00.000Z",
    hardExpiresAt: "2026-03-16T00:00:00.000Z",
    lastResetAt: null,
    lastResetReason: null,
    version: 1
  };

  const sessionService = {
    resolveSession: vi.fn(async ({ requestedMode }: { requestedMode?: "founder" | "zbestmedia" }) => ({
      session: {
        ...baseSession,
        activeModeState: {
          ...baseSession.activeModeState,
          activeMode: requestedMode ?? "founder"
        }
      },
      activeMode: requestedMode ?? "founder",
      boundaryViolation: null
    })),
    applyRuntimeResult: vi.fn(async () => ({
      sessionId: "aaliyah-session:1",
      tenantId: "tenant",
      actorId: "actor-1",
      principalContext: "founder",
      activeModeState: baseSession.activeModeState,
      interactionState: {
        lastInteractionAt: "2026-03-15T00:05:00.000Z",
        lastIntent: "get_founder_briefing",
        lastResolvedIntent: "get_founder_briefing",
        intentTrail: [],
        workingItem: baseSession.interactionState.workingItem,
        reviewApprovalContext: baseSession.interactionState.reviewApprovalContext,
        pendingDisambiguation: null
      },
      retentionPolicy: baseSession.retentionPolicy,
      expiresAt: "2026-03-15T04:05:00.000Z",
      hardExpiresAt: "2026-03-16T00:00:00.000Z",
      lastResetAt: null,
      lastResetReason: null,
      updatedAt: "2026-03-15T00:05:00.000Z",
      version: 2
    })),
    getSessionSnapshot: vi.fn(async () => ({
      sessionId: "aaliyah-session:1",
      tenantId: "tenant",
      actorId: "actor-1",
      principalContext: "founder",
      activeModeState: baseSession.activeModeState,
      interactionState: {
        lastInteractionAt: "2026-03-15T00:05:00.000Z",
        lastIntent: "get_founder_queue_item",
        lastResolvedIntent: "get_founder_queue_item",
        intentTrail: [],
        workingItem: baseSession.interactionState.workingItem,
        reviewApprovalContext: baseSession.interactionState.reviewApprovalContext,
        pendingDisambiguation: null
      },
      retentionPolicy: baseSession.retentionPolicy,
      expiresAt: "2026-03-15T04:05:00.000Z",
      hardExpiresAt: "2026-03-16T00:00:00.000Z",
      lastResetAt: null,
      lastResetReason: null,
      updatedAt: "2026-03-15T00:05:00.000Z",
      version: 2
    })),
    resetSession: vi.fn(async () => ({
      resetReason: "manual_reset",
      session: {
        sessionId: "aaliyah-session:1",
        tenantId: "tenant",
        actorId: "actor-1",
        principalContext: "founder",
        activeModeState: {
          activeMode: "founder",
          previousMode: "zbestmedia",
          switchedAt: "2026-03-15T00:06:00.000Z",
          switchReason: "fallback_to_default",
          boundaryDecisionId: null
        },
        interactionState: {
          lastInteractionAt: null,
          lastIntent: null,
          lastResolvedIntent: null,
          intentTrail: [],
          workingItem: null,
          reviewApprovalContext: null,
          pendingDisambiguation: null
        },
        retentionPolicy: baseSession.retentionPolicy,
        expiresAt: "2026-03-15T04:06:00.000Z",
        hardExpiresAt: "2026-03-16T00:06:00.000Z",
        lastResetAt: "2026-03-15T00:06:00.000Z",
        lastResetReason: "manual_reset",
        updatedAt: "2026-03-15T00:06:00.000Z",
        version: 3
      }
    })),
    resolveQueueItemId: vi.fn((parameters?: Record<string, unknown>) => typeof parameters?.queueItemId === "string" ? parameters.queueItemId : "queue:item:1"),
    resolveReviewItemId: vi.fn((parameters?: Record<string, unknown>) => typeof parameters?.reviewItemId === "string" ? parameters.reviewItemId : "review:1"),
    resolveVoiceCallId: vi.fn((parameters?: Record<string, unknown>) => typeof parameters?.callId === "string" ? parameters.callId : "voice-call:1")
  } as any;

  const reviewQueueService = {
    getQueue: vi.fn(async ({ mode }: { mode: "founder" | "zbestmedia" }) => ({
      queueId: "queue:1",
      generatedAt: "2026-03-15T00:00:00.000Z",
      activeMode: mode,
      manifestVersion: "2026-03-12.v1",
      itemCountsByType: {
        approval_required: 1,
        voice_escalation: 1,
        incident_attention: 0,
        dispatch_action: 0,
        routing_preview_action: 0,
        founder_recommended_action: 0
      },
      itemCountsByInterruptionClass: {
        interrupt_now: 1,
        same_day_briefing: 0,
        passive_queue: 0,
        silent_log: 0
      },
      topActionableItems: [],
      totalFounderActionableItems: 2,
      items: [
        {
          queueItemId: "queue:item:1",
          sourceSubsystem: "email_review_queue",
          sourceItemId: "review:1",
          itemType: "approval_required",
          title: "subject",
          summary: "summary",
          urgency: "high",
          risk: "medium",
          confidenceLevel: "high",
          interruptionClass: "same_day_briefing",
          activeMode: mode,
          founderAttentionRequired: true,
          recommendedNextAction: "Review it.",
          allowedNextActions: ["approve_review_item"],
          provenanceSummary: {
            manifestVersion: "2026-03-12.v1",
            references: ["review:1"],
            contributingSourceItemIds: ["review:1"]
          },
          createdAt: "2026-03-15T00:00:00.000Z",
          updatedAt: "2026-03-15T00:00:00.000Z"
        }
      ]
    })),
    getQueueItem: vi.fn(async () => ({
      queueItemId: "queue:item:1",
      sourceSubsystem: "email_review_queue",
      sourceItemId: "review:1",
      itemType: "approval_required",
      title: "subject",
      summary: "summary",
      urgency: "high",
      risk: "medium",
      confidenceLevel: "high",
      interruptionClass: "same_day_briefing",
      activeMode: "founder",
      founderAttentionRequired: true,
      recommendedNextAction: "Review it.",
      allowedNextActions: ["approve_review_item"],
      provenanceSummary: {
        manifestVersion: "2026-03-12.v1",
        references: ["review:1"],
        contributingSourceItemIds: ["review:1"]
      },
      createdAt: "2026-03-15T00:00:00.000Z",
      updatedAt: "2026-03-15T00:00:00.000Z"
    })),
    getQueueSummary: vi.fn(async ({ mode }: { mode: "founder" | "zbestmedia" }) => ({
      queueId: "queue:1",
      generatedAt: "2026-03-15T00:00:00.000Z",
      activeMode: mode,
      manifestVersion: "2026-03-12.v1",
      itemCountsByType: {
        approval_required: 1,
        voice_escalation: 1,
        incident_attention: 0,
        dispatch_action: 0,
        routing_preview_action: 0,
        founder_recommended_action: 0
      },
      itemCountsByInterruptionClass: {
        interrupt_now: 1,
        same_day_briefing: 0,
        passive_queue: 0,
        silent_log: 0
      },
      topActionableItems: [],
      totalFounderActionableItems: 2
    }))
  } as any;

  const followThroughService = {
    getActiveFollowThrough: vi.fn(async () => null),
    getFollowThroughHistory: vi.fn(async () => []),
    applyAction: vi.fn(async () => ({
      record: {
        tenantId: "tenant",
        followThroughId: "follow-through:1",
        sessionId: "session:1",
        actorId: "actor-1",
        principalContext: "founder",
        activeMode: "founder",
        companyScope: "zbestmedia",
        workingItemType: "founder_queue_item",
        sourceSubsystem: "email_review_queue",
        sourceItemId: "review:1",
        queueItemId: "queue:1",
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
          queueItemId: "queue:1",
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
        tenantId: "tenant",
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
        actorId: "actor-1",
        createdAt: "2026-03-15T00:05:00.000Z"
      },
      nextGovernedAction: "select_new_queue_item"
    }))
  } as any;

  const service = new AaliyahRuntimeService(
    new AgentOrgService(),
    briefingService,
    commandSurfaceService,
    emailService,
    voiceService,
    telemetryService,
    adminService,
    reviewQueueService,
    sessionService,
    followThroughService,
    preferenceService,
    memoryBoundaryService
  );

  it("returns founder briefing payloads", async () => {
    const result = await service.execute({
      tenantId: "tenant",
      actorId: "actor-1",
      requestId: "req-1",
      request: {
        intent: "get_founder_briefing",
        mode: "founder"
      }
    });

    expect(result.outcomeType).toBe("completed");
    expect(result.payloadType).toBe("founder_briefing");
    if (result.outcomeType !== "completed" || result.payloadType !== "founder_briefing") {
      throw new Error("unexpected runtime result");
    }
    expect(result.payload.activeMode).toBe("founder");
  });

  it("returns founder command surface payloads", async () => {
    const result = await service.execute({
      tenantId: "tenant",
      actorId: "actor-1",
      request: {
        intent: "get_founder_command_surface",
        mode: "zbestmedia"
      }
    });

    expect(result.outcomeType).toBe("completed");
    expect(result.payloadType).toBe("founder_command_surface");
  });

  it("returns deterministic quick actions", async () => {
    const result = await service.execute({
      tenantId: "tenant",
      actorId: "actor-1",
      request: {
        intent: "get_quick_actions"
      }
    });

    expect(result.outcomeType).toBe("completed");
    expect(result.payloadType).toBe("quick_actions");
  });

  it("returns active follow-through payloads", async () => {
    const result = await service.execute({
      tenantId: "tenant",
      actorId: "actor-1",
      request: {
        intent: "get_active_follow_through"
      }
    });

    expect(result.outcomeType).toBe("completed");
    expect(result.payloadType).toBe("follow_through_active");
    expect(followThroughService.getActiveFollowThrough).toHaveBeenCalled();
  });

  it("applies explicit closure actions through the follow-through service", async () => {
    const result = await service.execute({
      tenantId: "tenant",
      actorId: "actor-1",
      request: {
        intent: "complete_active_item",
        parameters: {
          closureReason: "founder_declared_completed",
          founderDeclaredCompletion: true
        }
      }
    });

    expect(result.outcomeType).toBe("completed");
    expect(result.payloadType).toBe("follow_through_action");
    expect(followThroughService.applyAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "complete",
        closureReason: "founder_declared_completed",
        founderDeclaredCompletion: true
      })
    );
  });

  it("returns interrupt queue and confidence summaries through governed runtime", async () => {
    const interruptions = await service.execute({
      tenantId: "tenant",
      actorId: "actor-1",
      request: {
        intent: "get_interrupt_queue",
        mode: "founder"
      }
    });
    const confidence = await service.execute({
      tenantId: "tenant",
      actorId: "actor-1",
      request: {
        intent: "get_confidence_summary",
        mode: "zbestmedia"
      }
    });

    expect(interruptions.outcomeType).toBe("completed");
    expect(interruptions.payloadType).toBe("interrupt_queue");
    expect(confidence.outcomeType).toBe("completed");
    expect(confidence.payloadType).toBe("confidence_summary");
  });

  it("returns founder preferences and memory-boundary summaries through governed runtime", async () => {
    const preferences = await service.execute({
      tenantId: "tenant",
      actorId: "actor-1",
      request: {
        intent: "get_founder_preferences",
        mode: "founder"
      }
    });
    const boundaries = await service.execute({
      tenantId: "tenant",
      actorId: "actor-1",
      request: {
        intent: "get_memory_boundary_summary",
        mode: "zbestmedia"
      }
    });

    expect(preferences.outcomeType).toBe("completed");
    expect(preferences.payloadType).toBe("founder_preferences");
    expect(boundaries.outcomeType).toBe("completed");
    expect(boundaries.payloadType).toBe("memory_boundary_summary");
  });

  it("returns unified founder review queue views through governed runtime", async () => {
    const queue = await service.execute({
      tenantId: "tenant",
      actorId: "actor-1",
      request: {
        intent: "get_founder_review_queue",
        mode: "founder"
      }
    });
    const item = await service.execute({
      tenantId: "tenant",
      actorId: "actor-1",
      request: {
        intent: "get_founder_queue_item",
        parameters: { queueItemId: "queue:item:1" }
      }
    });
    const summary = await service.execute({
      tenantId: "tenant",
      actorId: "actor-1",
      request: {
        intent: "get_founder_queue_summary"
      }
    });

    expect(queue.payloadType).toBe("founder_review_queue");
    expect(item.payloadType).toBe("founder_queue_item");
    expect(summary.payloadType).toBe("founder_queue_summary");
  });

  it("returns session snapshot and reset through governed runtime", async () => {
    const snapshot = await service.execute({
      tenantId: "tenant",
      actorId: "actor-1",
      request: {
        intent: "get_session_snapshot"
      }
    });
    const reset = await service.execute({
      tenantId: "tenant",
      actorId: "actor-1",
      request: {
        intent: "reset_session_context",
        parameters: { scope: "hard" }
      }
    });

    expect(snapshot.payloadType).toBe("session_snapshot");
    expect(reset.payloadType).toBe("session_reset");
  });

  it("uses active review context when review item id is omitted", async () => {
    const result = await service.execute({
      tenantId: "tenant",
      actorId: "actor-1",
      request: {
        intent: "approve_email_review_item",
        parameters: {
          note: "approve it"
        }
      }
    });

    expect(result.outcomeType).toBe("completed");
    expect(emailService.approveReviewItem).toHaveBeenCalledWith({
      tenantId: "tenant",
      reviewItemId: "review:1",
      actorId: "actor-1",
      note: "approve it"
    });
  });

  it("passes review actions through governed email services", async () => {
    const result = await service.execute({
      tenantId: "tenant",
      actorId: "actor-1",
      request: {
        intent: "approve_email_review_item",
        parameters: {
          reviewItemId: "review:1",
          note: "approve it"
        }
      }
    });

    expect(result.outcomeType).toBe("completed");
    expect(result.payloadType).toBe("email_review_action");
    expect(emailService.approveReviewItem).toHaveBeenCalledWith({
      tenantId: "tenant",
      reviewItemId: "review:1",
      actorId: "actor-1",
      note: "approve it"
    });
  });

  it("executes quick actions through governed intent delegation", async () => {
    const result = await service.execute({
      tenantId: "tenant",
      actorId: "actor-1",
      request: {
        intent: "execute_quick_action",
        parameters: {
          actionId: "open_approval_queue"
        }
      }
    });

    expect(result.outcomeType).toBe("completed");
    expect(result.payloadType).toBe("approval_queue");
  });

  it("dispatches approved email through the governed dispatch surface", async () => {
    const result = await service.execute({
      tenantId: "tenant",
      actorId: "actor-1",
      request: {
        intent: "dispatch_approved_email",
        parameters: {
          reviewItemId: "review:1"
        }
      }
    });

    expect(result.outcomeType).toBe("completed");
    expect(result.payloadType).toBe("email_dispatch_result");
    expect(emailService.dispatchApprovedReviewItem).toHaveBeenCalledWith({
      tenantId: "tenant",
      actorId: "actor-1",
      reviewItemId: "review:1"
    });
  });

  it("switches modes explicitly and returns supported routing categories", async () => {
    const result = await service.execute({
      tenantId: "tenant",
      actorId: "actor-1",
      request: {
        intent: "switch_mode",
        mode: "founder",
        parameters: {
          targetMode: "zbestmedia"
        }
      }
    });

    expect(result.outcomeType).toBe("completed");
    expect(result.activeMode).toBe("zbestmedia");
    expect(result.payloadType).toBe("mode_switch");
  });

  it("fails closed on unsupported intents", async () => {
    const result = await service.execute({
      tenantId: "tenant",
      actorId: "actor-1",
      request: {
        intent: "do_everything"
      }
    });

    expect(result.outcomeType).toBe("fallback");
    expect(result.fallback?.outcome).toBe("escalate_for_clarification");
  });

  it("fails closed on missing routing disambiguation", async () => {
    const result = await service.execute({
      tenantId: "tenant",
      actorId: "actor-1",
      request: {
        intent: "preview_routing",
        parameters: {
          category: "jingle_music"
        }
      }
    });

    expect(result.outcomeType).toBe("fallback");
    expect(result.fallback?.outcome).toBe("defer_due_to_low_confidence");
  });

  it("passes governed voice intake through the voice runtime surface", async () => {
    const result = await service.execute({
      tenantId: "tenant",
      actorId: "actor-1",
      request: {
        intent: "process_voice_intake",
        parameters: {
          payload: {
            sourceSystem: "voice-gateway",
            caller: { phoneNumber: "+13105551212" },
            transcript: "I need to speak to the founder today."
          }
        }
      }
    });

    expect(result.outcomeType).toBe("completed");
    expect(result.payloadType).toBe("voice_call_result");
    expect(voiceService.processInboundCall).toHaveBeenCalled();
  });

  it("returns governed voice call summaries without absorbing voice work", async () => {
    const result = await service.execute({
      tenantId: "tenant",
      actorId: "actor-1",
      request: {
        intent: "get_voice_call_summary",
        parameters: {
          callId: "voice-call:1"
        }
      }
    });

    expect(result.outcomeType).toBe("completed");
    expect(result.payloadType).toBe("voice_call_summary");
    expect(voiceService.getCall).toHaveBeenCalledWith({
      tenantId: "tenant",
      callId: "voice-call:1"
    });
  });

  it("returns pending voice escalations through governed runtime passthrough", async () => {
    const result = await service.execute({
      tenantId: "tenant",
      actorId: "actor-1",
      request: {
        intent: "get_pending_voice_escalations"
      }
    });

    expect(result.outcomeType).toBe("completed");
    expect(result.payloadType).toBe("voice_escalations");
    expect(voiceService.listPendingEscalations).toHaveBeenCalledWith({
      tenantId: "tenant",
      limit: undefined
    });
  });
});
