import type {
  AaliyahApprovalClass,
  AaliyahAtomicAgentId,
  AaliyahAtomicTaskId,
  AaliyahCompanyVisibility,
  AaliyahModeVisibility
} from "./registry-types.js";
import type { FounderBriefing, FounderBriefingMode } from "./briefing-types.js";
import type { EmailDraftReviewRecord } from "../email/review-types.js";
import type { EmailDispatchResult } from "../email/dispatch-types.js";
import type { AdminRoutingCategoryDescriptor } from "../admin/types.js";
import type { OpsStatusSummary, IncidentTelemetrySummary } from "../telemetry/types.js";
import type { RoutingDecision, RoutingTaskCategory, JingleRoutingMode } from "../org/routing-types.js";
import type { VoiceCallRecord, VoiceIntakePayload, VoiceProcessingResult } from "../voice/types.js";

export type AaliyahRuntimeConfidence = "high" | "medium" | "low";

export type AaliyahRuntimeFallbackOutcome =
  | "proceed_with_orchestration"
  | "delegate_to_specialist"
  | "escalate_for_clarification"
  | "deny_due_to_scope"
  | "defer_due_to_low_confidence"
  | "deny_due_to_mode_boundary";

export type AaliyahRuntimeMemoryRequest = {
  companies: AaliyahCompanyVisibility[];
  modes: AaliyahModeVisibility[];
};

export type AaliyahRuntimeRequest = {
  requestedAgentId: AaliyahAtomicAgentId;
  requestedAtomicTaskId?: AaliyahAtomicTaskId | null;
  confidence: AaliyahRuntimeConfidence;
  company: AaliyahCompanyVisibility;
  mode: AaliyahModeVisibility;
  principalContext: "founder" | "operator";
  approvalState: "not_required" | "required_missing" | "approved";
  memoryRequest?: AaliyahRuntimeMemoryRequest | null;
};

export type AaliyahRuntimeDecisionTrace = {
  requestedAgentId: AaliyahAtomicAgentId;
  requestedAtomicTaskId: AaliyahAtomicTaskId | null;
  resolvedAgentId: AaliyahAtomicAgentId;
  resolvedAtomicTaskId: AaliyahAtomicTaskId;
  confidence: AaliyahRuntimeConfidence;
  company: AaliyahCompanyVisibility;
  mode: AaliyahModeVisibility;
  principalContext: "founder" | "operator";
  approvalState: "not_required" | "required_missing" | "approved";
  approvalClass: AaliyahApprovalClass;
  reason: string;
};

export type AaliyahRuntimeDecision = {
  allowed: boolean;
  fallbackOutcome: AaliyahRuntimeFallbackOutcome;
  resolvedAgentId: AaliyahAtomicAgentId;
  resolvedAtomicTaskId: AaliyahAtomicTaskId;
  delegateToAgentId: AaliyahAtomicAgentId | null;
  trace: AaliyahRuntimeDecisionTrace;
};

export type AaliyahRuntimeMode = FounderBriefingMode;

export type AaliyahRuntimeIntent =
  | "get_founder_briefing"
  | "get_waiting_approvals"
  | "get_email_review_queue"
  | "approve_email_review_item"
  | "reject_email_review_item"
  | "request_email_revision"
  | "dispatch_approved_email"
  | "get_ops_status"
  | "get_incident_summary"
  | "switch_mode"
  | "preview_routing"
  | "process_voice_intake"
  | "get_voice_call_summary"
  | "get_pending_voice_escalations";

export type AaliyahRuntimePayloadType =
  | "founder_briefing"
  | "approval_queue"
  | "email_review_queue"
  | "email_review_action"
  | "email_dispatch_result"
  | "ops_status"
  | "incident_summary"
  | "mode_switch"
  | "routing_preview"
  | "voice_call_result"
  | "voice_call_summary"
  | "voice_escalations";

export type AaliyahRuntimeRequestInput = {
  intent: string;
  mode?: AaliyahRuntimeMode;
  parameters?: Record<string, unknown>;
};

export type AaliyahRuntimeRequestContext = {
  tenantId: string;
  actorId: string;
  requestId?: string;
  principalContext?: "founder" | "operator";
};

export type AaliyahRuntimeApprovalQueuePayload = {
  items: EmailDraftReviewRecord[];
  totalPending: number;
};

export type AaliyahRuntimeReviewActionPayload = {
  action: "approve" | "reject" | "request_revision";
  item: EmailDraftReviewRecord;
};

export type AaliyahRuntimeModeSwitchPayload = {
  previousMode: AaliyahRuntimeMode;
  activeMode: AaliyahRuntimeMode;
  supportedCategories: AdminRoutingCategoryDescriptor[];
};

export type AaliyahRuntimeRoutingPreviewPayload = {
  category: RoutingTaskCategory;
  jingleMode?: JingleRoutingMode;
  decision: RoutingDecision;
};

export type AaliyahRuntimeVoiceEscalationsPayload = {
  items: VoiceCallRecord[];
  totalPending: number;
};

export type AaliyahRuntimeSuccessPayload =
  | { payloadType: "founder_briefing"; payload: FounderBriefing }
  | { payloadType: "approval_queue"; payload: AaliyahRuntimeApprovalQueuePayload }
  | { payloadType: "email_review_queue"; payload: AaliyahRuntimeApprovalQueuePayload }
  | { payloadType: "email_review_action"; payload: AaliyahRuntimeReviewActionPayload }
  | { payloadType: "email_dispatch_result"; payload: EmailDispatchResult }
  | { payloadType: "ops_status"; payload: OpsStatusSummary }
  | { payloadType: "incident_summary"; payload: IncidentTelemetrySummary }
  | { payloadType: "mode_switch"; payload: AaliyahRuntimeModeSwitchPayload }
  | { payloadType: "routing_preview"; payload: AaliyahRuntimeRoutingPreviewPayload }
  | { payloadType: "voice_call_result"; payload: VoiceProcessingResult }
  | { payloadType: "voice_call_summary"; payload: VoiceCallRecord }
  | { payloadType: "voice_escalations"; payload: AaliyahRuntimeVoiceEscalationsPayload };

export type AaliyahRuntimeFallback = {
  outcome: Exclude<AaliyahRuntimeFallbackOutcome, "proceed_with_orchestration">;
  reason: string;
  delegateToAgentId: AaliyahAtomicAgentId | null;
};

export type AaliyahRuntimeResultProvenance = {
  manifestVersion: string;
  aaliyahRegistryVersion: string;
  requestId: string | null;
  generatedAt: string;
  invokedSurface: string;
  enforcement: AaliyahRuntimeDecisionTrace;
};

export type AaliyahRuntimeResult =
  | {
      runtimeRequestId: string;
      resolvedIntent: AaliyahRuntimeIntent;
      outcomeType: "completed";
      activeMode: AaliyahRuntimeMode;
      provenance: AaliyahRuntimeResultProvenance;
      fallback: null;
    } & AaliyahRuntimeSuccessPayload
  | {
      runtimeRequestId: string;
      resolvedIntent: AaliyahRuntimeIntent | null;
      outcomeType: "fallback";
      activeMode: AaliyahRuntimeMode;
      payloadType: null;
      payload: null;
      provenance: AaliyahRuntimeResultProvenance;
      fallback: AaliyahRuntimeFallback;
    };
