import type { FounderBriefingMode } from "./briefing-types.js";
import type { AaliyahFounderQueueItem, AaliyahQueueConfidenceLevel, AaliyahQueueInterruptionClass, AaliyahQueueRisk, AaliyahQueueUrgency } from "./review-queue-types.js";
import type { FollowThroughStatus, NextGovernedAction, WorkingItemClosureReason } from "./follow-through-types.js";

export type AaliyahTriageClass =
  | "act_now"
  | "review_today"
  | "blocked"
  | "stale"
  | "monitor"
  | "resolved_or_terminal";

export type AaliyahPriorityBand = "p0" | "p1" | "p2" | "p3";

export type AaliyahTriageReasonCode =
  | "release_blocking_incident"
  | "interrupt_now_signal"
  | "same_day_attention"
  | "founder_attention_required"
  | "approval_required"
  | "dispatch_ready"
  | "pending_review_over_sla"
  | "queue_item_over_sla"
  | "dispatch_blocked_by_policy"
  | "blocked_no_allowed_actions"
  | "blocked_missing_next_action"
  | "terminal_state"
  | "escalation_active"
  | "critical_risk"
  | "high_risk"
  | "low_confidence_wait"
  | "next_action_available"
  | "monitor_only";

export type AaliyahNextFounderAction =
  | "approve_review_item"
  | "reject_review_item"
  | "request_revision"
  | "dispatch_email"
  | "review_voice_escalation"
  | "review_incident"
  | "review_routing_preview"
  | "refresh_briefing"
  | "select_new_item"
  | "wait"
  | "none_terminal";

export type AaliyahFounderInboxItem = {
  inboxItemId: string;
  queueItemId: string;
  sourceSubsystem: AaliyahFounderQueueItem["sourceSubsystem"];
  sourceItemId: string;
  itemType: AaliyahFounderQueueItem["itemType"];
  title: string;
  summary: string;
  activeMode: FounderBriefingMode;
  urgency: AaliyahQueueUrgency;
  risk: AaliyahQueueRisk;
  triageClass: AaliyahTriageClass;
  priorityBand: AaliyahPriorityBand;
  reasonCodes: AaliyahTriageReasonCode[];
  nextFounderAction: AaliyahNextFounderAction;
  founderAttentionRequired: boolean;
  interruptionClass: AaliyahQueueInterruptionClass;
  confidenceLevel: AaliyahQueueConfidenceLevel;
  followThroughStatus: FollowThroughStatus | null;
  followThroughClosureReason: WorkingItemClosureReason | null;
  nextGovernedAction: NextGovernedAction | null;
  isBlocked: boolean;
  isStale: boolean;
  ageSeconds: number;
  provenanceSummary: AaliyahFounderQueueItem["provenanceSummary"];
  createdAt: string;
  updatedAt: string;
};

export type AaliyahFounderInboxSummary = {
  inboxId: string;
  generatedAt: string;
  activeMode: FounderBriefingMode;
  manifestVersion: string;
  totalItems: number;
  countsByTriageClass: Record<AaliyahTriageClass, number>;
  countsByPriorityBand: Record<AaliyahPriorityBand, number>;
  topActionableItems: AaliyahFounderInboxItem[];
  blockedItems: AaliyahFounderInboxItem[];
  staleItems: AaliyahFounderInboxItem[];
};

export type AaliyahPrioritizedQueueResult = AaliyahFounderInboxSummary & {
  items: AaliyahFounderInboxItem[];
};
