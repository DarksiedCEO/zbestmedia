import { randomUUID } from "node:crypto";

import { AaliyahAccessControlService } from "./access.js";
import type {
  AaliyahFounderInboxItem,
  AaliyahFounderInboxSummary,
  AaliyahNextFounderAction,
  AaliyahPrioritizedQueueResult,
  AaliyahPriorityBand,
  AaliyahTriageClass,
  AaliyahTriageReasonCode
} from "./triage-types.js";
import type { FounderBriefingMode } from "./briefing-types.js";
import { AaliyahFounderReviewQueueService } from "./review-queue.js";
import type { AaliyahFounderQueueItem } from "./review-queue-types.js";
import type { AgentOrgService } from "../org/service.js";
import type { AgentOsRepository } from "../persistence/repository.js";

const STALE_THRESHOLDS_SECONDS: Record<AaliyahFounderQueueItem["itemType"], number> = {
  approval_required: 4 * 60 * 60,
  dispatch_action: 2 * 60 * 60,
  voice_escalation: 2 * 60 * 60,
  incident_attention: 60 * 60,
  routing_preview_action: 24 * 60 * 60,
  founder_recommended_action: 24 * 60 * 60
};

const TRIAGE_WEIGHT: Record<AaliyahTriageClass, number> = {
  act_now: 500,
  review_today: 350,
  blocked: 275,
  stale: 225,
  monitor: 100,
  resolved_or_terminal: 0
};

const PRIORITY_WEIGHT: Record<AaliyahPriorityBand, number> = {
  p0: 80,
  p1: 55,
  p2: 25,
  p3: 0
};

export class AaliyahFounderInboxTriageService {
  private readonly access = new AaliyahAccessControlService();

  constructor(
    private readonly org: AgentOrgService,
    private readonly reviewQueue: AaliyahFounderReviewQueueService,
    private readonly repository: AgentOsRepository
  ) {}

  async getPrioritizedInbox(args: {
    tenantId: string;
    actorId: string;
    principalContext: "founder" | "operator";
    mode: FounderBriefingMode;
    generatedAt?: string;
  }): Promise<AaliyahPrioritizedQueueResult> {
    this.access.assertFounderModeAccess({
      principalContext: args.principalContext,
      activeMode: args.mode,
      requestedMode: args.mode,
      detailLevel: args.mode === "founder" ? "summary" : "detail"
    });
    const generatedAt = args.generatedAt ?? new Date().toISOString();
    const queue = await this.reviewQueue.getQueue({ tenantId: args.tenantId, mode: args.mode, generatedAt });
    const followThroughRecords = await this.repository.listAaliyahFollowThroughRecordsBySourceIds({
      tenantId: args.tenantId,
      actorId: args.actorId,
      principalContext: args.principalContext,
      sourceItemIds: queue.items.map((item) => item.sourceItemId)
    });
    const followThroughMap = new Map(followThroughRecords.map((record) => [record.sourceItemId, record]));

    const items = queue.items
      .map((item) => this.toInboxItem(item, followThroughMap.get(item.sourceItemId) ?? null, generatedAt))
      .sort((left, right) => this.score(right) - this.score(left) || left.createdAt.localeCompare(right.createdAt));

    return this.buildSummary({
      items,
      activeMode: args.mode,
      generatedAt,
      manifestVersion: this.org.getManifestVersion()
    });
  }

  async getBlockedItems(args: {
    tenantId: string;
    actorId: string;
    principalContext: "founder" | "operator";
    mode: FounderBriefingMode;
    generatedAt?: string;
  }): Promise<AaliyahFounderInboxItem[]> {
    const inbox = await this.getPrioritizedInbox(args);
    return inbox.items.filter((item) => item.triageClass === "blocked");
  }

  async getStaleItems(args: {
    tenantId: string;
    actorId: string;
    principalContext: "founder" | "operator";
    mode: FounderBriefingMode;
    generatedAt?: string;
  }): Promise<AaliyahFounderInboxItem[]> {
    const inbox = await this.getPrioritizedInbox(args);
    return inbox.items.filter((item) => item.triageClass === "stale");
  }

  async getInboxItem(args: {
    tenantId: string;
    actorId: string;
    principalContext: "founder" | "operator";
    mode: FounderBriefingMode;
    inboxItemId: string;
    generatedAt?: string;
  }): Promise<AaliyahFounderInboxItem | null> {
    const inbox = await this.getPrioritizedInbox(args);
    return inbox.items.find((item) => item.inboxItemId === args.inboxItemId) ?? null;
  }

  private buildSummary(args: {
    items: AaliyahFounderInboxItem[];
    generatedAt: string;
    activeMode: FounderBriefingMode;
    manifestVersion: string;
  }): AaliyahPrioritizedQueueResult {
    const countsByTriageClass: AaliyahFounderInboxSummary["countsByTriageClass"] = {
      act_now: 0,
      review_today: 0,
      blocked: 0,
      stale: 0,
      monitor: 0,
      resolved_or_terminal: 0
    };
    const countsByPriorityBand: AaliyahFounderInboxSummary["countsByPriorityBand"] = {
      p0: 0,
      p1: 0,
      p2: 0,
      p3: 0
    };

    for (const item of args.items) {
      countsByTriageClass[item.triageClass] += 1;
      countsByPriorityBand[item.priorityBand] += 1;
    }

    return {
      inboxId: `aaliyah-inbox:${randomUUID()}`,
      generatedAt: args.generatedAt,
      activeMode: args.activeMode,
      manifestVersion: args.manifestVersion,
      totalItems: args.items.length,
      countsByTriageClass,
      countsByPriorityBand,
      topActionableItems: args.items.filter((item) => item.triageClass !== "resolved_or_terminal").slice(0, 8),
      blockedItems: args.items.filter((item) => item.triageClass === "blocked"),
      staleItems: args.items.filter((item) => item.triageClass === "stale"),
      items: args.items
    };
  }

  private toInboxItem(item: AaliyahFounderQueueItem, followThrough: Awaited<ReturnType<AgentOsRepository["listAaliyahFollowThroughRecordsBySourceIds"]>>[number] | null, generatedAt: string): AaliyahFounderInboxItem {
    const ageSeconds = Math.max(0, Math.floor((new Date(generatedAt).getTime() - new Date(item.createdAt).getTime()) / 1000));
    const stale = ageSeconds >= STALE_THRESHOLDS_SECONDS[item.itemType];
    const terminal = followThrough ? followThrough.status !== "active" : false;
    const blocked = !terminal && (item.allowedNextActions.length === 0 || (item.itemType === "dispatch_action" && followThrough?.nextGovernedAction === "await_founder_review"));
    const triageClass = this.resolveTriageClass(item, { terminal, blocked, stale, followThrough });
    const reasonCodes = this.resolveReasonCodes(item, { terminal, blocked, stale, followThrough });
    const priorityBand = this.resolvePriorityBand(item, triageClass);
    const nextFounderAction = this.resolveNextFounderAction(item, triageClass, followThrough?.nextGovernedAction ?? null);

    return {
      inboxItemId: `inbox:${item.queueItemId}`,
      queueItemId: item.queueItemId,
      sourceSubsystem: item.sourceSubsystem,
      sourceItemId: item.sourceItemId,
      itemType: item.itemType,
      title: item.title,
      summary: item.summary,
      activeMode: item.activeMode,
      urgency: item.urgency,
      risk: item.risk,
      triageClass,
      priorityBand,
      reasonCodes,
      nextFounderAction,
      founderAttentionRequired: item.founderAttentionRequired,
      interruptionClass: item.interruptionClass,
      confidenceLevel: item.confidenceLevel,
      followThroughStatus: followThrough?.status ?? null,
      followThroughClosureReason: followThrough?.closureReason ?? null,
      nextGovernedAction: followThrough?.nextGovernedAction ?? null,
      isBlocked: blocked,
      isStale: stale,
      ageSeconds,
      provenanceSummary: item.provenanceSummary,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt
    };
  }

  private resolveTriageClass(
    item: AaliyahFounderQueueItem,
    state: { terminal: boolean; blocked: boolean; stale: boolean; followThrough: Awaited<ReturnType<AgentOsRepository["listAaliyahFollowThroughRecordsBySourceIds"]>>[number] | null }
  ): AaliyahTriageClass {
    if (state.terminal) return "resolved_or_terminal";
    if (state.blocked) return "blocked";
    if (item.interruptionClass === "interrupt_now" || item.urgency === "urgent" || item.risk === "critical") return "act_now";
    if (state.stale) return "stale";
    if (item.founderAttentionRequired || item.interruptionClass === "same_day_briefing" || item.itemType === "approval_required" || item.itemType === "dispatch_action") {
      return "review_today";
    }
    return "monitor";
  }

  private resolvePriorityBand(item: AaliyahFounderQueueItem, triageClass: AaliyahTriageClass): AaliyahPriorityBand {
    if (triageClass === "resolved_or_terminal") return "p3";
    if (triageClass === "act_now") return "p0";
    if (triageClass === "blocked") return item.itemType === "incident_attention" ? "p0" : "p1";
    if (triageClass === "stale") return "p1";
    if (item.urgency === "high" || item.risk === "high") return "p1";
    if (triageClass === "review_today") return "p1";
    return "p2";
  }

  private resolveReasonCodes(
    item: AaliyahFounderQueueItem,
    state: { terminal: boolean; blocked: boolean; stale: boolean; followThrough: Awaited<ReturnType<AgentOsRepository["listAaliyahFollowThroughRecordsBySourceIds"]>>[number] | null }
  ): AaliyahTriageReasonCode[] {
    const codes = new Set<AaliyahTriageReasonCode>();
    if (state.terminal) codes.add("terminal_state");
    if (state.blocked) {
      if (item.allowedNextActions.length === 0) codes.add("blocked_no_allowed_actions");
      else codes.add("dispatch_blocked_by_policy");
    }
    if (state.stale) {
      codes.add(item.itemType === "approval_required" ? "pending_review_over_sla" : "queue_item_over_sla");
    }
    if (item.itemType === "incident_attention") codes.add("release_blocking_incident");
    if (item.interruptionClass === "interrupt_now") codes.add("interrupt_now_signal");
    if (item.interruptionClass === "same_day_briefing") codes.add("same_day_attention");
    if (item.founderAttentionRequired) codes.add("founder_attention_required");
    if (item.itemType === "approval_required") codes.add("approval_required");
    if (item.itemType === "dispatch_action") codes.add("dispatch_ready");
    if (item.risk === "critical") codes.add("critical_risk");
    if (item.risk === "high") codes.add("high_risk");
    if (item.confidenceLevel === "low") codes.add("low_confidence_wait");
    if (state.followThrough?.status === "escalated") codes.add("escalation_active");
    if (!state.blocked && !state.terminal) codes.add("next_action_available");
    if (codes.size === 0) codes.add("monitor_only");
    return [...codes];
  }

  private resolveNextFounderAction(
    item: AaliyahFounderQueueItem,
    triageClass: AaliyahTriageClass,
    nextGovernedAction: string | null
  ): AaliyahNextFounderAction {
    if (triageClass === "resolved_or_terminal") return "none_terminal";
    if (triageClass === "blocked") return nextGovernedAction === "refresh_briefing" ? "refresh_briefing" : "wait";
    if (item.allowedNextActions.includes("approve_review_item")) return "approve_review_item";
    if (item.allowedNextActions.includes("dispatch_approved_email")) return "dispatch_email";
    if (item.allowedNextActions.includes("open_voice_escalation")) return "review_voice_escalation";
    if (item.allowedNextActions.includes("open_incident")) return "review_incident";
    if (item.itemType === "routing_preview_action") return "review_routing_preview";
    if (item.allowedNextActions.includes("refresh_founder_briefing")) return "refresh_briefing";
    return nextGovernedAction === "select_new_queue_item" ? "select_new_item" : "wait";
  }

  private score(item: AaliyahFounderInboxItem): number {
    let score = TRIAGE_WEIGHT[item.triageClass] + PRIORITY_WEIGHT[item.priorityBand];
    if (item.reasonCodes.includes("critical_risk")) score += 30;
    if (item.reasonCodes.includes("founder_attention_required")) score += 25;
    if (item.reasonCodes.includes("pending_review_over_sla") || item.reasonCodes.includes("queue_item_over_sla")) score += 15;
    if (item.confidenceLevel === "low") score -= 15;
    return score;
  }
}
