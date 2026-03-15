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

  const service = new AaliyahRuntimeService(
    new AgentOrgService(),
    briefingService,
    commandSurfaceService,
    emailService,
    voiceService,
    telemetryService,
    adminService
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
