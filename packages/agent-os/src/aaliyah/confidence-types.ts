import type { FounderBriefingMode } from "./briefing-types.js";

export type AaliyahConfidenceLevel = "high" | "medium" | "low";
export type AaliyahConfidenceReasonCode =
  | "data_complete"
  | "data_incomplete"
  | "routing_certain"
  | "routing_ambiguous"
  | "policy_certain"
  | "policy_uncertain"
  | "mode_certain"
  | "mode_uncertain"
  | "source_reliable"
  | "source_unverified"
  | "release_blocking"
  | "founder_relevant"
  | "founder_approval_required";

export type AaliyahConfidenceFallbackAction = "proceed" | "defer" | "escalate" | "suppress";
export type AaliyahInterruptionVisibilityAction = "interrupt_now" | "same_day_briefing" | "passive_queue" | "silent_log";

export type AaliyahConfidenceAssessment = {
  confidenceId: string;
  sourceSubsystem: string;
  assessedItemType: string;
  confidenceLevel: AaliyahConfidenceLevel;
  confidenceBand: number;
  reasonCodes: AaliyahConfidenceReasonCode[];
  recommendedFallbackAction: AaliyahConfidenceFallbackAction;
};

export type AaliyahInterruptionDecision = {
  decisionId: string;
  sourceItemId: string;
  urgency: "low" | "normal" | "high" | "urgent";
  risk: "low" | "medium" | "high" | "critical";
  founderRelevance: boolean;
  timeSensitivity: "routine" | "same_day" | "immediate";
  confidenceLevel: AaliyahConfidenceLevel;
  recommendedVisibilityAction: AaliyahInterruptionVisibilityAction;
  reasonCodes: string[];
};

export type AaliyahConfidenceInput = {
  sourceSubsystem: string;
  assessedItemType: string;
  sourceItemId: string;
  urgency: "low" | "normal" | "high" | "urgent";
  risk: "low" | "medium" | "high" | "critical";
  founderRelevance: boolean;
  founderApprovalRequired: boolean;
  releaseBlocking: boolean;
  timeSensitivity: "routine" | "same_day" | "immediate";
  dataComplete: boolean;
  routingCertain: boolean;
  policyCertain: boolean;
  modeCertain: boolean;
  sourceReliability: "high" | "medium" | "low";
};

export type AaliyahConfidenceSummary = {
  generatedAt: string;
  activeMode: FounderBriefingMode;
  overallConfidenceLevel: AaliyahConfidenceLevel;
  highConfidenceCount: number;
  mediumConfidenceCount: number;
  lowConfidenceCount: number;
  deferredCount: number;
  suppressedCount: number;
  topReasonCodes: string[];
  items: AaliyahConfidenceAssessment[];
};

export type AaliyahInterruptQueueItem = {
  sourceItemId: string;
  title: string;
  summary: string;
  recommendedAction: string;
  visibilityAction: AaliyahInterruptionVisibilityAction;
  confidenceLevel: AaliyahConfidenceLevel;
  founderRelevance: boolean;
  reasonCodes: string[];
};

export type AaliyahInterruptionSummary = {
  generatedAt: string;
  activeMode: FounderBriefingMode;
  items: AaliyahInterruptQueueItem[];
  interruptNowCount: number;
  sameDayBriefingCount: number;
  passiveQueueCount: number;
  silentLogCount: number;
};

export type AaliyahConfidenceEvaluation = {
  assessment: AaliyahConfidenceAssessment;
  interruption: AaliyahInterruptionDecision;
};
