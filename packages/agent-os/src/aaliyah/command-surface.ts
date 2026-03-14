import { randomUUID } from "node:crypto";

import { AALIYAH_REGISTRY_VERSION } from "./registry-types.js";
import type {
  AaliyahApprovalSummary,
  AaliyahCommandSurfaceContext,
  AaliyahFounderCommandSurface,
  AaliyahQuickAction,
  AaliyahQuickActionContext,
  AaliyahVoiceEscalationSummary
} from "./command-surface-types.js";
import type { FounderBriefingItem, FounderBriefingMode, FounderRecommendedAction } from "./briefing-types.js";
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
  constructor(
    private readonly org: AgentOrgService,
    private readonly briefing: AaliyahFounderBriefingService,
    private readonly email: EmailAssistantService,
    private readonly voice: VoiceRuntimeService,
    private readonly telemetry: AgentTelemetryService
  ) {}

  async generateCommandSurface(args: AaliyahCommandSurfaceContext): Promise<AaliyahFounderCommandSurface> {
    const generatedAt = args.generatedAt ?? new Date().toISOString();
    const [briefing, approvals, voiceEscalations, openIncidentSummary, opsStatusSummary] = await Promise.all([
      this.briefing.generateBriefing({ tenantId: args.tenantId, mode: args.mode, generatedAt }),
      this.email.listReviewItems({ tenantId: args.tenantId, status: "pending_review", limit: 10 }),
      this.voice.listPendingEscalations({ tenantId: args.tenantId, limit: 10 }),
      this.telemetry.getIncidentSummary({ tenantId: args.tenantId }),
      this.telemetry.getOpsStatusSummary({ tenantId: args.tenantId })
    ]);

    const openApprovals: AaliyahApprovalSummary = {
      totalPending: approvals.length,
      items: approvals
    };

    const openVoiceEscalations: AaliyahVoiceEscalationSummary = {
      totalPending: voiceEscalations.length,
      items: voiceEscalations,
      interruptNowCount: voiceEscalations.filter((item) => item.interruptionClass === "interrupt_now").length
    };

    const whatMattersNow = [
      ...briefing.topPriorities,
      ...this.voiceEscalationsToItems(voiceEscalations, args.mode)
    ]
      .sort((a, b) => this.scoreItem(b) - this.scoreItem(a))
      .slice(0, 6);

    const recommendedNextActions = this.buildRecommendedActions(
      briefing.recommendedActions,
      voiceEscalations,
      args.mode
    ).slice(0, 6);

    const quickActions = this.listQuickActions({
      tenantId: args.tenantId,
      mode: args.mode,
      pendingApprovalCount: approvals.length,
      pendingVoiceEscalationCount: voiceEscalations.length
    });

    const interruptQueueSummary = {
      interruptNowCount: whatMattersNow.filter((item) => item.interruptionClass === "interrupt_now").length,
      reviewSoonCount: whatMattersNow.filter((item) => item.interruptionClass === "review_soon").length,
      canWaitCount: whatMattersNow.filter((item) => item.interruptionClass === "can_wait").length
    };

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
      interruptQueueSummary,
      quickActions,
      provenanceSummary: {
        orgManifestVersion: this.org.getManifestVersion(),
        aaliyahRegistryVersion: AALIYAH_REGISTRY_VERSION,
        generatedFrom: {
          pendingApprovalCount: approvals.length,
          pendingVoiceEscalationCount: voiceEscalations.length,
          releaseBlockingIncidentCount: openIncidentSummary.releaseBlockingOpenCount,
          degradedSurfaceCount: opsStatusSummary.degradedSurfaces.length
        }
      }
    };
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
    mode: FounderBriefingMode
  ): FounderRecommendedAction[] {
    const voiceActions = voiceEscalations
      .filter((call) => call.founderAttentionRequired)
      .map((call, index) => ({
        actionId: `voice-action:${index + 1}`,
        title: `Review voice escalation from ${call.callerDisplayName ?? call.callerPhoneNumber}`,
        action: call.recommendedNextAction,
        urgency: call.urgency === "critical" ? "urgent" : call.urgency === "high" ? "high" : "normal",
        sourceItemId: `voice:${call.callId}`
      } satisfies FounderRecommendedAction));

    return [...actions, ...voiceActions].sort((a, b) => this.scoreAction(b) - this.scoreAction(a));
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
}
