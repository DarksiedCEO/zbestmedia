import { randomUUID } from "node:crypto";

import { AALIYAH_REGISTRY_VERSION } from "./registry-types.js";
import { AaliyahConfidenceControlService } from "./confidence.js";
import { AaliyahMemoryBoundaryService } from "./memory-boundary.js";
import { AaliyahPreferenceService } from "./preferences.js";
import type {
  AaliyahApprovalSummary,
  AaliyahCommandSurfaceContext,
  AaliyahFounderCommandSurface,
  AaliyahQuickAction,
  AaliyahQuickActionContext,
  AaliyahVoiceEscalationSummary
} from "./command-surface-types.js";
import type { FounderBriefingItem, FounderBriefingMode, FounderRecommendedAction } from "./briefing-types.js";
import type { AaliyahResolvedPreferences } from "./preference-types.js";
import { AaliyahFounderBriefingService } from "./briefing.js";
import { AgentOrgService } from "../org/service.js";
import type { DepartmentId, ExecutiveId, LeadAgentId, SubAgentId } from "../org/types.js";
import type { EmailAssistantService } from "../email/service.js";
import type { AgentTelemetryService } from "../telemetry/service.js";
import type { VoiceRuntimeService } from "../voice/service.js";
import type { VoiceCallRecord } from "../voice/types.js";

const PRIORITY_WEIGHT: Record<FounderBriefingItem["urgency"], number> = {
  low: 10,
  normal: 25,
  high: 60,
  urgent: 95
};

const INTERRUPT_WEIGHT: Record<FounderBriefingItem["interruptionClass"], number> = {
  interrupt_now: 40,
  review_soon: 20,
  can_wait: 0
};

export class AaliyahCommandSurfaceService {
  private readonly confidence = new AaliyahConfidenceControlService();
  private readonly boundary: AaliyahMemoryBoundaryService;

  constructor(
    private readonly org: AgentOrgService,
    private readonly briefing: AaliyahFounderBriefingService,
    private readonly email: EmailAssistantService,
    private readonly voice: VoiceRuntimeService,
    private readonly telemetry: AgentTelemetryService,
    private readonly preferences?: AaliyahPreferenceService,
    boundary?: AaliyahMemoryBoundaryService
  ) {
    this.boundary = boundary ?? new AaliyahMemoryBoundaryService();
  }

  async generateCommandSurface(args: AaliyahCommandSurfaceContext): Promise<AaliyahFounderCommandSurface> {
    const generatedAt = args.generatedAt ?? new Date().toISOString();
    const boundaryDecision = this.boundary.validate({
      activeMode: args.mode,
      requestedMode: args.mode,
      requestedCompanies: [args.mode === "founder" ? "zbestmedia" : args.mode],
      detailLevel: args.mode === "founder" ? "summary" : "detail"
    });
    if (boundaryDecision.access === "denied") {
      throw new Error(`aaliyah_memory_boundary_denied:${boundaryDecision.reasonCodes.join(",")}`);
    }

    const resolvedPreferences: AaliyahResolvedPreferences = this.preferences
      ? await this.preferences.resolvePreferences({ tenantId: args.tenantId, mode: args.mode })
      : {
          activeMode: args.mode,
          briefingLength: "standard",
          interruptionTolerance: "standard",
          approvalVisibility: "all_pending",
          tonePreference: "balanced",
          modeVisibility: "strict",
          appliedPreferences: []
        };
    const [briefing, approvals, voiceEscalations, openIncidentSummary, opsStatusSummary] = await Promise.all([
      this.briefing.generateBriefing({ tenantId: args.tenantId, mode: args.mode, generatedAt }),
      this.email.listReviewItems({ tenantId: args.tenantId, status: "pending_review", limit: 10 }),
      this.voice.listPendingEscalations({ tenantId: args.tenantId, limit: 10 }),
      this.telemetry.getIncidentSummary({ tenantId: args.tenantId }),
      this.telemetry.getOpsStatusSummary({ tenantId: args.tenantId })
    ]);

    const visibleApprovals = approvals.filter((item) =>
      resolvedPreferences.approvalVisibility === "all_pending" || item.priority === "high" || item.priority === "urgent"
    );

    const openApprovals: AaliyahApprovalSummary = {
      totalPending: visibleApprovals.length,
      items: visibleApprovals
    };

    const openVoiceEscalations: AaliyahVoiceEscalationSummary = {
      totalPending: voiceEscalations.length,
      items: voiceEscalations,
      interruptNowCount: voiceEscalations.filter((item) => item.interruptionClass === "interrupt_now").length
    };

    const evaluatedInterruptions = this.buildInterruptions({
      generatedAt,
      mode: args.mode,
      topPriorities: briefing.topPriorities,
      approvals: visibleApprovals,
      voiceEscalations
    });

    const whatMattersNow = [
      ...briefing.topPriorities,
      ...this.voiceEscalationsToItems(voiceEscalations, args.mode)
    ]
      .filter((item) =>
        evaluatedInterruptions.summary.items.some(
          (queueItem: (typeof evaluatedInterruptions.summary.items)[number]) =>
            queueItem.sourceItemId === item.itemId &&
            this.isVisibleUnderTolerance(queueItem.visibilityAction, resolvedPreferences.interruptionTolerance)
        )
      )
      .sort((a, b) => this.scoreItem(b) - this.scoreItem(a))
      .slice(0, this.sectionLimit(resolvedPreferences.briefingLength));

    const recommendedNextActions = this.buildRecommendedActions(
      briefing.recommendedActions,
      voiceEscalations,
      args.mode,
      resolvedPreferences.tonePreference
    ).slice(0, this.sectionLimit(resolvedPreferences.briefingLength));

    const quickActions = this.listQuickActions({
      tenantId: args.tenantId,
      mode: args.mode,
      pendingApprovalCount: approvals.length,
      pendingVoiceEscalationCount: voiceEscalations.length
    });

    const confidenceSummary = this.confidence.summarizeConfidence({
      generatedAt,
      activeMode: args.mode,
      evaluations: evaluatedInterruptions.evaluations
    });

    return {
      shellId: `aaliyah-shell:${randomUUID()}`,
      generatedAt,
      activeMode: args.mode,
      manifestVersion: this.org.getManifestVersion(),
      founderBriefingSummary: briefing,
      whatMattersNow,
      waitingOnMe: briefing.waitingOnMe,
      openApprovals,
      openIncidentSummary,
      opsStatusSummary,
      openVoiceEscalations,
      recommendedNextActions,
      interruptQueueSummary: {
        interruptNowCount: evaluatedInterruptions.summary.interruptNowCount,
        sameDayBriefingCount: evaluatedInterruptions.summary.sameDayBriefingCount,
        passiveQueueCount: evaluatedInterruptions.summary.passiveQueueCount,
        silentLogCount: evaluatedInterruptions.summary.silentLogCount
      },
      confidenceSummary,
      interruptionQueue: evaluatedInterruptions.summary,
      quickActions,
      provenanceSummary: {
        orgManifestVersion: this.org.getManifestVersion(),
        aaliyahRegistryVersion: AALIYAH_REGISTRY_VERSION,
        generatedFrom: {
          pendingApprovalCount: visibleApprovals.length,
          pendingVoiceEscalationCount: voiceEscalations.length,
          releaseBlockingIncidentCount: openIncidentSummary.releaseBlockingOpenCount,
          degradedSurfaceCount: opsStatusSummary.degradedSurfaces.length
        }
      }
    };
  }

  async getConfidenceSummary(args: AaliyahCommandSurfaceContext) {
    const generatedAt = args.generatedAt ?? new Date().toISOString();
    const interruptions = await this.buildInterruptionsFromContext({
      tenantId: args.tenantId,
      mode: args.mode,
      generatedAt
    });
    return this.confidence.summarizeConfidence({
      generatedAt,
      activeMode: args.mode,
      evaluations: interruptions.evaluations
    });
  }

  async getInterruptionQueue(args: AaliyahCommandSurfaceContext) {
    const generatedAt = args.generatedAt ?? new Date().toISOString();
    const interruptions = await this.buildInterruptionsFromContext({
      tenantId: args.tenantId,
      mode: args.mode,
      generatedAt
    });
    return interruptions.summary;
  }

  listQuickActions(
    args: AaliyahQuickActionContext & {
      pendingApprovalCount?: number;
      pendingVoiceEscalationCount?: number;
    }
  ): AaliyahQuickAction[] {
    const pendingApprovalCount = args.pendingApprovalCount ?? 0;
    const pendingVoiceEscalationCount = args.pendingVoiceEscalationCount ?? 0;
    const switchTargetMode: FounderBriefingMode = args.mode === "founder" ? "zbestmedia" : "founder";

    return [
      {
        actionId: "refresh_founder_briefing",
        actionType: "refresh_founder_briefing",
        label: "Refresh briefing",
        targetIntent: "get_founder_briefing",
        allowedParameters: [],
        defaultParameters: {},
        approvalRequired: false,
        availabilityStatus: "available",
        availabilityReason: null
      },
      {
        actionId: "open_approval_queue",
        actionType: "open_approval_queue",
        label: pendingApprovalCount > 0 ? `Open approvals (${pendingApprovalCount})` : "Open approvals",
        targetIntent: "get_waiting_approvals",
        allowedParameters: ["limit"],
        defaultParameters: {},
        approvalRequired: false,
        availabilityStatus: "available",
        availabilityReason: null
      },
      {
        actionId: "review_voice_escalations",
        actionType: "review_voice_escalations",
        label: pendingVoiceEscalationCount > 0 ? `Review voice escalations (${pendingVoiceEscalationCount})` : "Review voice escalations",
        targetIntent: "get_pending_voice_escalations",
        allowedParameters: ["limit"],
        defaultParameters: {},
        approvalRequired: false,
        availabilityStatus: pendingVoiceEscalationCount > 0 ? "available" : "disabled",
        availabilityReason: pendingVoiceEscalationCount > 0 ? null : "no_pending_voice_escalations"
      },
      {
        actionId: "open_incident_summary",
        actionType: "get_incident_summary",
        label: "View incident summary",
        targetIntent: "get_incident_summary",
        allowedParameters: [],
        defaultParameters: {},
        approvalRequired: false,
        availabilityStatus: "available",
        availabilityReason: null
      },
      {
        actionId: "open_ops_status",
        actionType: "get_ops_status",
        label: "View ops status",
        targetIntent: "get_ops_status",
        allowedParameters: [],
        defaultParameters: {},
        approvalRequired: false,
        availabilityStatus: "available",
        availabilityReason: null
      },
      {
        actionId: `switch_mode:${switchTargetMode}`,
        actionType: "switch_mode",
        label: `Switch to ${switchTargetMode}`,
        targetIntent: "switch_mode",
        allowedParameters: ["targetMode"],
        defaultParameters: { targetMode: switchTargetMode },
        approvalRequired: false,
        availabilityStatus: "available",
        availabilityReason: null
      },
      {
        actionId: "preview_routing",
        actionType: "preview_routing",
        label: "Preview routing",
        targetIntent: "preview_routing",
        allowedParameters: ["category", "jingleMode"],
        defaultParameters: {},
        approvalRequired: false,
        availabilityStatus: "requires_parameters",
        availabilityReason: "routing_preview_requires_category"
      }
    ];
  }

  getQuickActionById(
    args: AaliyahQuickActionContext & {
      actionId: string;
      pendingApprovalCount?: number;
      pendingVoiceEscalationCount?: number;
    }
  ): AaliyahQuickAction | null {
    return (
      this.listQuickActions(args).find((action) => action.actionId === args.actionId) ?? null
    );
  }

  private voiceEscalationsToItems(calls: AaliyahVoiceEscalationSummary["items"], mode: FounderBriefingMode): FounderBriefingItem[] {
    return calls.map((call) => ({
      itemId: `voice:${call.callId}`,
      category: "top_priorities",
      title: `Voice escalation: ${call.callerDisplayName ?? call.callerPhoneNumber}`,
      summary: call.recommendedNextAction,
      urgency: call.urgency === "critical" ? "urgent" : call.urgency === "high" ? "high" : "normal",
      owner: {
        executiveId: call.routingTarget.executiveId as ExecutiveId | null,
        departmentId: call.routingTarget.departmentId as DepartmentId | null,
        leadAgentId: call.routingTarget.leadAgentId as LeadAgentId | null,
        subAgentId: call.routingTarget.subAgentId as SubAgentId | null,
        sourceLane: mode === "founder" ? "aaliyah-founder-review" : "aaliyah-voice"
      },
      recommendedAction: call.recommendedNextAction,
      interruptionClass: call.interruptionClass,
      requiresFounderAttention: call.founderAttentionRequired,
      provenanceReferences: [
        `voice_call:${call.callId}`,
        ...(call.assignmentRecordId ? [`assignment:${call.assignmentRecordId}`] : []),
        ...(call.runRecordId ? [`run:${call.runRecordId}`] : [])
      ]
    }));
  }

  private buildRecommendedActions(
    actions: FounderRecommendedAction[],
    voiceEscalations: VoiceCallRecord[],
    mode: FounderBriefingMode,
    tonePreference: "concise" | "balanced" | "detailed"
  ): FounderRecommendedAction[] {
    const voiceActions = voiceEscalations
      .filter((call) => call.founderAttentionRequired)
      .map((call, index) => ({
        actionId: `voice-action:${index + 1}`,
        title: `Review voice escalation from ${call.callerDisplayName ?? call.callerPhoneNumber}`,
        action: this.formatText(call.recommendedNextAction, tonePreference),
        urgency: call.urgency === "critical" ? "urgent" : call.urgency === "high" ? "high" : "normal",
        sourceItemId: `voice:${call.callId}`
      } satisfies FounderRecommendedAction));

    return [
      ...actions.map((action) => ({ ...action, action: this.formatText(action.action, tonePreference) })),
      ...voiceActions
    ].sort((a, b) => this.scoreAction(b) - this.scoreAction(a));
  }

  private scoreAction(action: FounderRecommendedAction): number {
    return PRIORITY_WEIGHT[action.urgency];
  }

  private scoreItem(item: FounderBriefingItem): number {
    let score = PRIORITY_WEIGHT[item.urgency] + INTERRUPT_WEIGHT[item.interruptionClass];
    if (item.requiresFounderAttention) score += 50;
    if (item.category === "waiting_on_me") score += 25;
    if (item.category === "top_priorities") score += 35;
    if (item.owner.sourceLane === "code-sentinel") score += 20;
    return score;
  }

  private async buildInterruptionsFromContext(args: AaliyahCommandSurfaceContext & { generatedAt: string }) {
    const [briefing, approvals, voiceEscalations] = await Promise.all([
      this.briefing.generateBriefing({ tenantId: args.tenantId, mode: args.mode, generatedAt: args.generatedAt }),
      this.email.listReviewItems({ tenantId: args.tenantId, status: "pending_review", limit: 10 }),
      this.voice.listPendingEscalations({ tenantId: args.tenantId, limit: 10 })
    ]);

    return this.buildInterruptions({
      generatedAt: args.generatedAt,
      mode: args.mode,
      topPriorities: briefing.topPriorities,
      approvals,
      voiceEscalations
    });
  }

  private buildInterruptions(args: {
    generatedAt: string;
    mode: FounderBriefingMode;
    topPriorities: FounderBriefingItem[];
    approvals: AaliyahApprovalSummary["items"];
    voiceEscalations: VoiceCallRecord[];
  }) {
    const itemEvaluations = args.topPriorities.map((item) => {
      const evaluation = this.confidence.evaluate({
        sourceSubsystem: item.owner.sourceLane === "code-sentinel" ? "ops" : "briefing",
        assessedItemType: "briefing_item",
        sourceItemId: item.itemId,
        urgency: item.urgency,
        risk: item.urgency === "urgent" ? "critical" : item.urgency === "high" ? "high" : "medium",
        founderRelevance: item.requiresFounderAttention || item.category === "waiting_on_me" || item.category === "top_priorities",
        founderApprovalRequired: item.category === "waiting_on_me",
        releaseBlocking: item.owner.sourceLane === "code-sentinel" && item.requiresFounderAttention,
        timeSensitivity:
          item.interruptionClass === "interrupt_now"
            ? "immediate"
            : item.interruptionClass === "review_soon"
              ? "same_day"
              : "routine",
        dataComplete: item.summary.trim().length > 0 && item.recommendedAction.trim().length > 0,
        routingCertain: item.owner.sourceLane !== "aaliyah-founder-review",
        policyCertain: true,
        modeCertain: true,
        sourceReliability: item.owner.sourceLane === "code-sentinel" ? "high" : "medium"
      });

      return {
        evaluation,
        queueItem: {
          sourceItemId: item.itemId,
          title: item.title,
          summary: item.summary,
          recommendedAction: item.recommendedAction,
          visibilityAction: evaluation.interruption.recommendedVisibilityAction,
          confidenceLevel: evaluation.assessment.confidenceLevel,
          founderRelevance: evaluation.interruption.founderRelevance,
          reasonCodes: evaluation.interruption.reasonCodes
        }
      };
    });

    const approvalEvaluations = args.approvals.map((item) => {
      const evaluation = this.confidence.evaluate({
        sourceSubsystem: "email_review_queue",
        assessedItemType: "email_review",
        sourceItemId: `review:${item.reviewItemId}`,
        urgency: item.priority,
        risk: item.riskLevel,
        founderRelevance: true,
        founderApprovalRequired: true,
        releaseBlocking: false,
        timeSensitivity: item.priority === "urgent" ? "immediate" : item.priority === "high" ? "same_day" : "routine",
        dataComplete: item.draftSummary.trim().length > 0 && item.proposedReplySubject.trim().length > 0,
        routingCertain: !item.escalationRecommended,
        policyCertain: true,
        modeCertain: true,
        sourceReliability: "medium"
      });

      return {
        evaluation,
        queueItem: {
          sourceItemId: `review:${item.reviewItemId}`,
          title: item.proposedReplySubject,
          summary: item.draftSummary,
          recommendedAction: "Review and decide whether to approve, reject, or request revision.",
          visibilityAction: evaluation.interruption.recommendedVisibilityAction,
          confidenceLevel: evaluation.assessment.confidenceLevel,
          founderRelevance: true,
          reasonCodes: evaluation.interruption.reasonCodes
        }
      };
    });

    const voiceEvaluations = args.voiceEscalations.map((item) => {
      const evaluation = this.confidence.evaluate({
        sourceSubsystem: "voice_intake",
        assessedItemType: "voice_call",
        sourceItemId: `voice:${item.callId}`,
        urgency: item.urgency === "critical" ? "urgent" : item.urgency,
        risk: item.riskLevel === "moderate" ? "medium" : item.riskLevel,
        founderRelevance: item.founderAttentionRequired,
        founderApprovalRequired: false,
        releaseBlocking: false,
        timeSensitivity: item.interruptionClass === "interrupt_now" ? "immediate" : item.interruptionClass === "review_soon" ? "same_day" : "routine",
        dataComplete: item.transcript.trim().length > 0,
        routingCertain: true,
        policyCertain: true,
        modeCertain: args.mode === "founder" || item.companyMode === args.mode,
        sourceReliability: "medium"
      });

      return {
        evaluation,
        queueItem: {
          sourceItemId: `voice:${item.callId}`,
          title: `Voice escalation: ${item.callerDisplayName ?? item.callerPhoneNumber}`,
          summary: item.callSummaryText ?? item.recommendedNextAction,
          recommendedAction: item.recommendedNextAction,
          visibilityAction: evaluation.interruption.recommendedVisibilityAction,
          confidenceLevel: evaluation.assessment.confidenceLevel,
          founderRelevance: item.founderAttentionRequired,
          reasonCodes: evaluation.interruption.reasonCodes
        }
      };
    });

    const evaluations = [...itemEvaluations, ...approvalEvaluations, ...voiceEvaluations];

    return {
      evaluations: evaluations.map((entry) => entry.evaluation),
      summary: this.confidence.summarizeInterruptions({
        generatedAt: args.generatedAt,
        activeMode: args.mode,
        items: evaluations
          .map((entry) => entry.queueItem)
          .sort((a, b) => this.visibilityWeight(b.visibilityAction) - this.visibilityWeight(a.visibilityAction))
      })
    };
  }

  private visibilityWeight(action: "interrupt_now" | "same_day_briefing" | "passive_queue" | "silent_log") {
    switch (action) {
    case "interrupt_now":
      return 100;
    case "same_day_briefing":
      return 60;
    case "passive_queue":
      return 30;
    case "silent_log":
      return 0;
    }
  }

  private sectionLimit(length: "compact" | "standard" | "expanded"): number {
    if (length === "compact") return 4;
    if (length === "expanded") return 8;
    return 6;
  }

  private isVisibleUnderTolerance(
    visibilityAction: "interrupt_now" | "same_day_briefing" | "passive_queue" | "silent_log",
    tolerance: "minimal" | "standard" | "high"
  ): boolean {
    if (visibilityAction === "interrupt_now") return true;
    if (tolerance === "minimal") return false;
    if (tolerance === "standard") return visibilityAction === "same_day_briefing";
    return visibilityAction !== "silent_log";
  }

  private formatText(text: string, tone: "concise" | "balanced" | "detailed"): string {
    if (tone === "detailed") return text;
    const maxLength = tone === "concise" ? 90 : 150;
    if (text.length <= maxLength) return text;
    return `${text.slice(0, maxLength - 1).trimEnd()}…`;
  }
}
