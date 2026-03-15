import type { FounderBriefingMode } from "./briefing-types.js";

export type AaliyahFounderQueueItemType =
  | "approval_required"
  | "voice_escalation"
  | "incident_attention"
  | "dispatch_action"
  | "routing_preview_action"
  | "founder_recommended_action";

export type AaliyahFounderQueueSourceSubsystem =
  | "email_review_queue"
  | "email_dispatch_queue"
  | "voice_intake"
  | "incident_pipeline"
  | "founder_briefing";

export type AaliyahFounderQueueAllowedAction =
  | "open_review_item"
  | "approve_review_item"
  | "reject_review_item"
  | "request_review_revision"
  | "dispatch_approved_email"
  | "open_voice_escalation"
  | "open_incident"
  | "refresh_founder_briefing";

export type AaliyahQueueConfidenceLevel = "high" | "medium" | "low";
export type AaliyahQueueInterruptionClass = "interrupt_now" | "same_day_briefing" | "passive_queue" | "silent_log";
export type AaliyahQueueUrgency = "low" | "normal" | "high" | "urgent";
export type AaliyahQueueRisk = "low" | "medium" | "high" | "critical";

export type AaliyahFounderQueueItem = {
  queueItemId: string;
  sourceSubsystem: AaliyahFounderQueueSourceSubsystem;
  sourceItemId: string;
  itemType: AaliyahFounderQueueItemType;
  title: string;
  summary: string;
  urgency: AaliyahQueueUrgency;
  risk: AaliyahQueueRisk;
  confidenceLevel: AaliyahQueueConfidenceLevel;
  interruptionClass: AaliyahQueueInterruptionClass;
  activeMode: FounderBriefingMode;
  founderAttentionRequired: boolean;
  recommendedNextAction: string;
  allowedNextActions: AaliyahFounderQueueAllowedAction[];
  provenanceSummary: {
    manifestVersion: string;
    references: string[];
    contributingSourceItemIds: string[];
  };
  createdAt: string;
  updatedAt: string;
};

export type AaliyahFounderReviewQueueSummary = {
  queueId: string;
  generatedAt: string;
  activeMode: FounderBriefingMode;
  manifestVersion: string;
  itemCountsByType: Record<AaliyahFounderQueueItemType, number>;
  itemCountsByInterruptionClass: Record<AaliyahQueueInterruptionClass, number>;
  topActionableItems: AaliyahFounderQueueItem[];
  totalFounderActionableItems: number;
};

export type AaliyahFounderReviewQueue = AaliyahFounderReviewQueueSummary & {
  items: AaliyahFounderQueueItem[];
};
