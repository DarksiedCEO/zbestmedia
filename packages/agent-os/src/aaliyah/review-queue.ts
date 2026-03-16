import { randomUUID } from "node:crypto";

import { AaliyahAccessControlService } from "./access.js";
import type { FounderBriefingMode, FounderRecommendedAction } from "./briefing-types.js";
import type {
  AaliyahFounderQueueAllowedAction,
  AaliyahFounderQueueItem,
  AaliyahFounderQueueItemType,
  AaliyahFounderReviewQueue,
  AaliyahFounderReviewQueueSummary,
  AaliyahQueueConfidenceLevel,
  AaliyahQueueInterruptionClass,
  AaliyahQueueRisk,
  AaliyahQueueUrgency
} from "./review-queue-types.js";
import { AaliyahFounderBriefingService } from "./briefing.js";
import { AgentOrgService } from "../org/service.js";
import type { EmailDraftReviewRecord } from "../email/review-types.js";
import type { EmailAssistantService } from "../email/service.js";
import type { AgentIncidentService } from "../incidents/service.js";
import type { VoiceRuntimeService } from "../voice/service.js";
import type { VoiceCallRecord } from "../voice/types.js";

const TYPE_PRECEDENCE: Record<AaliyahFounderQueueItemType, number> = {
  incident_attention: 100,
  approval_required: 90,
  dispatch_action: 80,
  voice_escalation: 70,
  routing_preview_action: 60,
  founder_recommended_action: 50
};

const INTERRUPTION_WEIGHT: Record<AaliyahQueueInterruptionClass, number> = {
  interrupt_now: 100,
  same_day_briefing: 60,
  passive_queue: 30,
  silent_log: 0
};

const URGENCY_WEIGHT: Record<AaliyahQueueUrgency, number> = {
  low: 10,
  normal: 25,
  high: 55,
  urgent: 90
};

const RISK_WEIGHT: Record<AaliyahQueueRisk, number> = {
  low: 5,
  medium: 15,
  high: 30,
  critical: 45
};

export class AaliyahFounderReviewQueueService {
  private readonly access = new AaliyahAccessControlService();

  constructor(
    private readonly org: AgentOrgService,
    private readonly briefing: AaliyahFounderBriefingService,
    private readonly email: EmailAssistantService,
    private readonly voice: VoiceRuntimeService,
    private readonly incidents: AgentIncidentService
  ) {}

  async getQueue(args: { tenantId: string; mode: FounderBriefingMode; generatedAt?: string }): Promise<AaliyahFounderReviewQueue> {
    this.access.assertFounderModeAccess({
      principalContext: "founder",
      activeMode: args.mode,
      requestedMode: args.mode,
      detailLevel: args.mode === "founder" ? "summary" : "detail"
    });
    const generatedAt = args.generatedAt ?? new Date().toISOString();
    const manifestVersion = this.org.getManifestVersion();
    const [briefing, pendingReviews, approvedReviews, voiceEscalations, openIncidents] = await Promise.all([
      this.briefing.generateBriefing({ tenantId: args.tenantId, mode: args.mode, generatedAt }),
      this.email.listReviewItems({ tenantId: args.tenantId, status: "pending_review", limit: 50 }),
      this.email.listReviewItems({ tenantId: args.tenantId, status: "approved", limit: 50 }),
      this.voice.listPendingEscalations({ tenantId: args.tenantId, limit: 50 }),
      this.incidents.listIncidents({ tenantId: args.tenantId, status: "open", limit: 50 })
    ]);

    const rawItems: AaliyahFounderQueueItem[] = [
      ...pendingReviews.map((item) => this.fromPendingReview(item, args.mode, manifestVersion)),
      ...approvedReviews
        .filter((item) => this.isDispatchRelevant(item))
        .map((item) => this.fromApprovedReview(item, args.mode, manifestVersion)),
      ...voiceEscalations.map((item) => this.fromVoiceEscalation(item, args.mode, manifestVersion)),
      ...openIncidents
        .filter((item) => item.releaseBlocking || item.severity === "critical")
        .map((item) => this.fromIncident(item, args.mode, manifestVersion)),
      ...briefing.recommendedActions.map((item) => this.fromRecommendedAction(item, args.mode, manifestVersion, generatedAt))
    ];

    const deduped = this.deduplicate(rawItems).sort((left, right) => this.score(right) - this.score(left));
    const summary = this.buildSummary({
      items: deduped,
      generatedAt,
      activeMode: args.mode,
      manifestVersion
    });

    return {
      ...summary,
      items: deduped
    };
  }

  async getQueueItem(args: { tenantId: string; mode: FounderBriefingMode; queueItemId: string }) {
    const queue = await this.getQueue({ tenantId: args.tenantId, mode: args.mode });
    return queue.items.find((item) => item.queueItemId === args.queueItemId) ?? null;
  }

  async getQueueSummary(args: { tenantId: string; mode: FounderBriefingMode; generatedAt?: string }): Promise<AaliyahFounderReviewQueueSummary> {
    const queue = await this.getQueue(args);
    return {
      queueId: queue.queueId,
      generatedAt: queue.generatedAt,
      activeMode: queue.activeMode,
      manifestVersion: queue.manifestVersion,
      itemCountsByType: queue.itemCountsByType,
      itemCountsByInterruptionClass: queue.itemCountsByInterruptionClass,
      topActionableItems: queue.topActionableItems,
      totalFounderActionableItems: queue.totalFounderActionableItems
    };
  }

  private fromPendingReview(item: EmailDraftReviewRecord, mode: FounderBriefingMode, manifestVersion: string): AaliyahFounderQueueItem {
    return {
      queueItemId: `queue:${item.reviewItemId}`,
      sourceSubsystem: "email_review_queue",
      sourceItemId: `review:${item.reviewItemId}`,
      itemType: "approval_required",
      title: item.proposedReplySubject,
      summary: item.draftSummary,
      urgency: item.priority,
      risk: item.riskLevel,
      confidenceLevel: this.scoreToConfidence(item.confidenceScore),
      interruptionClass: this.priorityToInterruption(item.priority),
      activeMode: mode,
      founderAttentionRequired: true,
      recommendedNextAction: "Review the draft and approve, reject, or request revision.",
      allowedNextActions: ["open_review_item", "approve_review_item", "reject_review_item", "request_review_revision"],
      provenanceSummary: {
        manifestVersion,
        references: [
          `review:${item.reviewItemId}`,
          ...(item.assignmentRecordId ? [`assignment:${item.assignmentRecordId}`] : []),
          ...(item.runRecordId ? [`run:${item.runRecordId}`] : [])
        ],
        contributingSourceItemIds: [`review:${item.reviewItemId}`]
      },
      createdAt: item.createdAt,
      updatedAt: item.updatedAt
    };
  }

  private fromApprovedReview(item: EmailDraftReviewRecord, mode: FounderBriefingMode, manifestVersion: string): AaliyahFounderQueueItem {
    return {
      queueItemId: `queue:dispatch:${item.reviewItemId}`,
      sourceSubsystem: "email_dispatch_queue",
      sourceItemId: `review:${item.reviewItemId}`,
      itemType: "dispatch_action",
      title: `Dispatch approved draft: ${item.proposedReplySubject}`,
      summary: item.draftSummary,
      urgency: item.priority,
      risk: item.riskLevel,
      confidenceLevel: this.scoreToConfidence(item.confidenceScore),
      interruptionClass: item.priority === "urgent" ? "same_day_briefing" : "passive_queue",
      activeMode: mode,
      founderAttentionRequired: item.priority === "urgent" || item.priority === "high",
      recommendedNextAction: "Dispatch the approved draft if it still matches intent and policy.",
      allowedNextActions: ["open_review_item", "dispatch_approved_email"],
      provenanceSummary: {
        manifestVersion,
        references: [`review:${item.reviewItemId}`],
        contributingSourceItemIds: [`review:${item.reviewItemId}`]
      },
      createdAt: item.createdAt,
      updatedAt: item.updatedAt
    };
  }

  private fromVoiceEscalation(item: VoiceCallRecord, mode: FounderBriefingMode, manifestVersion: string): AaliyahFounderQueueItem {
    return {
      queueItemId: `queue:voice:${item.callId}`,
      sourceSubsystem: "voice_intake",
      sourceItemId: `voice:${item.callId}`,
      itemType: "voice_escalation",
      title: `Voice escalation: ${item.callerDisplayName ?? item.callerPhoneNumber}`,
      summary: item.callSummaryText ?? item.recommendedNextAction,
      urgency: item.urgency === "critical" ? "urgent" : item.urgency,
      risk: item.riskLevel === "moderate" ? "medium" : item.riskLevel,
      confidenceLevel: "high",
      interruptionClass: item.interruptionClass === "review_soon" ? "same_day_briefing" : item.interruptionClass === "can_wait" ? "passive_queue" : "interrupt_now",
      activeMode: mode,
      founderAttentionRequired: item.founderAttentionRequired,
      recommendedNextAction: item.recommendedNextAction,
      allowedNextActions: ["open_voice_escalation"],
      provenanceSummary: {
        manifestVersion,
        references: [`voice:${item.callId}`],
        contributingSourceItemIds: [`voice:${item.callId}`]
      },
      createdAt: item.createdAt,
      updatedAt: item.updatedAt
    };
  }

  private fromIncident(item: Awaited<ReturnType<AgentIncidentService["listIncidents"]>>[number], mode: FounderBriefingMode, manifestVersion: string): AaliyahFounderQueueItem {
    return {
      queueItemId: `queue:incident:${item.incidentId}`,
      sourceSubsystem: "incident_pipeline",
      sourceItemId: `incident:${item.incidentId}`,
      itemType: "incident_attention",
      title: item.title,
      summary: item.summary,
      urgency: item.releaseBlocking ? "urgent" : item.severity === "critical" ? "high" : "normal",
      risk: item.severity === "critical" ? "critical" : item.severity === "warning" ? "medium" : "low",
      confidenceLevel: "high",
      interruptionClass: item.releaseBlocking ? "interrupt_now" : "same_day_briefing",
      activeMode: mode,
      founderAttentionRequired: item.releaseBlocking || item.severity === "critical",
      recommendedNextAction: item.recommendedAction,
      allowedNextActions: ["open_incident"],
      provenanceSummary: {
        manifestVersion,
        references: [`incident:${item.incidentId}`],
        contributingSourceItemIds: [`incident:${item.incidentId}`]
      },
      createdAt: item.createdAt,
      updatedAt: item.updatedAt
    };
  }

  private fromRecommendedAction(
    item: FounderRecommendedAction,
    mode: FounderBriefingMode,
    manifestVersion: string,
    generatedAt: string
  ): AaliyahFounderQueueItem {
    return {
      queueItemId: `queue:action:${item.actionId}`,
      sourceSubsystem: "founder_briefing",
      sourceItemId: item.sourceItemId,
      itemType: item.sourceItemId.startsWith("route:") ? "routing_preview_action" : "founder_recommended_action",
      title: item.title,
      summary: item.action,
      urgency: item.urgency,
      risk: item.urgency === "urgent" ? "high" : item.urgency === "high" ? "medium" : "low",
      confidenceLevel: "medium",
      interruptionClass: item.urgency === "urgent" ? "same_day_briefing" : "passive_queue",
      activeMode: mode,
      founderAttentionRequired: item.urgency === "urgent" || item.urgency === "high",
      recommendedNextAction: item.action,
      allowedNextActions: item.sourceItemId.startsWith("route:") ? ["refresh_founder_briefing"] : [],
      provenanceSummary: {
        manifestVersion,
        references: [item.sourceItemId],
        contributingSourceItemIds: [item.sourceItemId]
      },
      createdAt: generatedAt,
      updatedAt: generatedAt
    };
  }

  private deduplicate(items: AaliyahFounderQueueItem[]): AaliyahFounderQueueItem[] {
    const grouped = new Map<string, AaliyahFounderQueueItem[]>();
    for (const item of items) {
      const key = this.groupingKey(item);
      const bucket = grouped.get(key) ?? [];
      bucket.push(item);
      grouped.set(key, bucket);
    }

    return [...grouped.values()].map((bucket) => {
      const winner = [...bucket].sort((left, right) => TYPE_PRECEDENCE[right.itemType] - TYPE_PRECEDENCE[left.itemType])[0]!;
      const mergedAllowedActions = [...new Set(bucket.flatMap((item) => item.allowedNextActions))] as AaliyahFounderQueueAllowedAction[];
      const mergedReferences = [...new Set(bucket.flatMap((item) => item.provenanceSummary.references))];
      const mergedSourceIds = [...new Set(bucket.map((item) => item.sourceItemId))];
      return {
        ...winner,
        allowedNextActions: mergedAllowedActions,
        provenanceSummary: {
          ...winner.provenanceSummary,
          references: mergedReferences,
          contributingSourceItemIds: mergedSourceIds
        }
      };
    });
  }

  private buildSummary(args: {
    items: AaliyahFounderQueueItem[];
    generatedAt: string;
    activeMode: FounderBriefingMode;
    manifestVersion: string;
  }): AaliyahFounderReviewQueueSummary {
    const itemCountsByType: AaliyahFounderReviewQueueSummary["itemCountsByType"] = {
      approval_required: 0,
      voice_escalation: 0,
      incident_attention: 0,
      dispatch_action: 0,
      routing_preview_action: 0,
      founder_recommended_action: 0
    };
    const itemCountsByInterruptionClass: AaliyahFounderReviewQueueSummary["itemCountsByInterruptionClass"] = {
      interrupt_now: 0,
      same_day_briefing: 0,
      passive_queue: 0,
      silent_log: 0
    };

    for (const item of args.items) {
      itemCountsByType[item.itemType] += 1;
      itemCountsByInterruptionClass[item.interruptionClass] += 1;
    }

    return {
      queueId: `founder-queue:${randomUUID()}`,
      generatedAt: args.generatedAt,
      activeMode: args.activeMode,
      manifestVersion: args.manifestVersion,
      itemCountsByType,
      itemCountsByInterruptionClass,
      topActionableItems: args.items.slice(0, 8),
      totalFounderActionableItems: args.items.length
    };
  }

  private groupingKey(item: AaliyahFounderQueueItem): string {
    if (item.sourceItemId.startsWith("incident:")) return item.sourceItemId;
    if (item.sourceItemId.startsWith("review:")) return item.sourceItemId;
    if (item.sourceItemId.startsWith("voice:")) return item.sourceItemId;
    return `${item.itemType}:${item.sourceItemId}`;
  }

  private score(item: AaliyahFounderQueueItem): number {
    let score = TYPE_PRECEDENCE[item.itemType] + INTERRUPTION_WEIGHT[item.interruptionClass] + URGENCY_WEIGHT[item.urgency] + RISK_WEIGHT[item.risk];
    if (item.founderAttentionRequired) score += 40;
    if (item.itemType === "approval_required") score += 20;
    if (item.itemType === "dispatch_action") score += 10;
    if (item.confidenceLevel === "medium") score -= 5;
    if (item.confidenceLevel === "low") score -= 20;
    return score;
  }

  private scoreToConfidence(score: number): AaliyahQueueConfidenceLevel {
    if (score >= 0.75) return "high";
    if (score >= 0.5) return "medium";
    return "low";
  }

  private priorityToInterruption(priority: EmailDraftReviewRecord["priority"]): AaliyahQueueInterruptionClass {
    if (priority === "urgent") return "interrupt_now";
    if (priority === "high") return "same_day_briefing";
    if (priority === "normal") return "passive_queue";
    return "silent_log";
  }

  private isDispatchRelevant(item: EmailDraftReviewRecord): boolean {
    return item.priority === "urgent" || item.priority === "high" || item.escalationRecommended;
  }
}
