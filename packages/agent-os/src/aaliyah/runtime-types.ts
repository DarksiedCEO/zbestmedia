import type {
  AaliyahApprovalClass,
  AaliyahAtomicAgentId,
  AaliyahAtomicTaskId,
  AaliyahCompanyVisibility,
  AaliyahModeVisibility
} from "./registry-types.js";

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
