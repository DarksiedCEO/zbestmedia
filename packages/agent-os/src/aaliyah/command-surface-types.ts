import type { FounderBriefing, FounderBriefingItem, FounderBriefingMode, FounderRecommendedAction } from "./briefing-types.js";
import type { AaliyahConfidenceSummary, AaliyahInterruptionSummary } from "./confidence-types.js";
import type { AaliyahFounderReviewQueueSummary } from "./review-queue-types.js";
import type { EmailDraftReviewRecord } from "../email/review-types.js";
import type { IncidentTelemetrySummary, OpsStatusSummary } from "../telemetry/types.js";
import type { VoiceCallRecord } from "../voice/types.js";

export type AaliyahQuickActionType =
  | "refresh_founder_briefing"
  | "open_approval_queue"
  | "review_voice_escalations"
  | "get_incident_summary"
  | "get_ops_status"
  | "switch_mode"
  | "preview_routing";

export type AaliyahQuickActionTargetIntent =
  | "get_founder_briefing"
  | "get_waiting_approvals"
  | "get_pending_voice_escalations"
  | "get_incident_summary"
  | "get_ops_status"
  | "switch_mode"
  | "preview_routing";

export type AaliyahQuickActionAvailability = "available" | "requires_parameters" | "disabled";

export type AaliyahQuickAction = {
  actionId: string;
  actionType: AaliyahQuickActionType;
  label: string;
  targetIntent: AaliyahQuickActionTargetIntent;
  allowedParameters: string[];
  defaultParameters: Record<string, unknown>;
  approvalRequired: boolean;
  availabilityStatus: AaliyahQuickActionAvailability;
  availabilityReason: string | null;
};

export type AaliyahCommandSurfaceInterruptSummary = {
  interruptNowCount: number;
  sameDayBriefingCount: number;
  passiveQueueCount: number;
  silentLogCount: number;
};

export type AaliyahCommandSurfaceProvenanceSummary = {
  orgManifestVersion: string;
  aaliyahRegistryVersion: string;
  generatedFrom: {
    pendingApprovalCount: number;
    pendingVoiceEscalationCount: number;
    releaseBlockingIncidentCount: number;
    degradedSurfaceCount: number;
  };
};

export type AaliyahVoiceEscalationSummary = {
  totalPending: number;
  items: VoiceCallRecord[];
  interruptNowCount: number;
};

export type AaliyahApprovalSummary = {
  totalPending: number;
  items: EmailDraftReviewRecord[];
};

export type AaliyahFounderCommandSurface = {
  shellId: string;
  generatedAt: string;
  activeMode: FounderBriefingMode;
  manifestVersion: string;
  founderBriefingSummary: FounderBriefing;
  whatMattersNow: FounderBriefingItem[];
  waitingOnMe: FounderBriefingItem[];
  openApprovals: AaliyahApprovalSummary;
  openIncidentSummary: IncidentTelemetrySummary;
  opsStatusSummary: OpsStatusSummary;
  openVoiceEscalations: AaliyahVoiceEscalationSummary;
  recommendedNextActions: FounderRecommendedAction[];
  interruptQueueSummary: AaliyahCommandSurfaceInterruptSummary;
  confidenceSummary: AaliyahConfidenceSummary;
  interruptionQueue: AaliyahInterruptionSummary;
  founderReviewQueue: AaliyahFounderReviewQueueSummary;
  quickActions: AaliyahQuickAction[];
  provenanceSummary: AaliyahCommandSurfaceProvenanceSummary;
};

export type AaliyahCommandSurfaceContext = {
  tenantId: string;
  mode: FounderBriefingMode;
  generatedAt?: string;
};

export type AaliyahQuickActionContext = {
  tenantId: string;
  mode: FounderBriefingMode;
};

export type AaliyahQuickActionExecutionRequest = {
  actionId: string;
  parameters?: Record<string, unknown>;
};
