import { z } from "zod";

import { DepartmentIdSchema, ExecutiveIdSchema } from "../org/types.js";

export const AALIYAH_REGISTRY_VERSION = "2026-03-12.aaliyah.v1" as const;

export const AaliyahModeVisibilitySchema = z.enum([
  "receptionist",
  "executive_assistant",
  "email_drafting"
]);
export type AaliyahModeVisibility = z.infer<typeof AaliyahModeVisibilitySchema>;

export const AaliyahCompanyVisibilitySchema = z.enum(["zbestmedia"]);
export type AaliyahCompanyVisibility = z.infer<typeof AaliyahCompanyVisibilitySchema>;

export const AaliyahApprovalClassSchema = z.enum([
  "orchestration_only",
  "always_required",
  "operator_action_required",
  "system_guarded"
]);
export type AaliyahApprovalClass = z.infer<typeof AaliyahApprovalClassSchema>;

export const AaliyahAtomicTaskIdSchema = z.enum([
  "executive_orchestration_founder_protection",
  "email_thread_normalization",
  "email_intent_classification",
  "email_urgency_scoring",
  "email_risk_scoring",
  "email_company_mode_resolution",
  "email_contact_tier_assignment",
  "email_ownership_resolution",
  "email_approval_requirement_decision",
  "email_escalation_decision",
  "email_interrupt_classification",
  "email_draft_composition",
  "email_review_item_creation",
  "email_review_status_transition",
  "email_dispatch_eligibility_validation",
  "email_approved_draft_dispatch",
  "email_audit_trace_recording",
  "email_policy_compliance_validation",
  "email_memory_boundary_enforcement",
  "email_scope_drift_detection",
  "email_overlap_detection",
  "email_fallback_decision"
]);
export type AaliyahAtomicTaskId = z.infer<typeof AaliyahAtomicTaskIdSchema>;

export const AaliyahAtomicAgentIdSchema = z.enum([
  "aaliyah",
  "aaliyah-thread-normalizer",
  "aaliyah-intent-classifier",
  "aaliyah-urgency-scorer",
  "aaliyah-risk-scorer",
  "aaliyah-company-mode-resolver",
  "aaliyah-contact-tier-assigner",
  "aaliyah-ownership-resolver",
  "aaliyah-approval-requirement-decider",
  "aaliyah-escalation-decider",
  "aaliyah-interrupt-classifier",
  "aaliyah-draft-composer",
  "aaliyah-review-item-creator",
  "aaliyah-review-state-manager",
  "aaliyah-dispatch-eligibility-validator",
  "aaliyah-approved-draft-dispatcher",
  "aaliyah-audit-trace-recorder",
  "aaliyah-policy-compliance-validator",
  "aaliyah-memory-boundary-enforcer",
  "aaliyah-scope-drift-detector",
  "aaliyah-overlap-detector",
  "aaliyah-fallback-decider"
]);
export type AaliyahAtomicAgentId = z.infer<typeof AaliyahAtomicAgentIdSchema>;

export const AaliyahAtomicAgentRecordSchema = z.object({
  agentId: AaliyahAtomicAgentIdSchema,
  displayName: z.string().min(1),
  parentLayer: z.enum(["aaliyah-control", "aaliyah-email-runtime", "aaliyah-safety"]),
  exactAtomicTaskId: AaliyahAtomicTaskIdSchema,
  exactAtomicTask: z.string().min(1),
  owningExecutiveId: ExecutiveIdSchema,
  owningDepartmentId: DepartmentIdSchema,
  allowedInputContract: z.array(z.string().min(1)).min(1),
  allowedOutputContract: z.array(z.string().min(1)).min(1),
  forbiddenScope: z.array(z.string().min(1)).min(1),
  escalationTriggers: z.array(z.string().min(1)).min(1),
  fallbackBehavior: z.string().min(1),
  approvalClass: AaliyahApprovalClassSchema,
  companyVisibility: z.array(AaliyahCompanyVisibilitySchema).min(1),
  modeVisibility: z.array(AaliyahModeVisibilitySchema).min(1)
});
export type AaliyahAtomicAgentRecord = z.infer<typeof AaliyahAtomicAgentRecordSchema>;

export const AaliyahAtomicRegistrySchema = z.object({
  registryVersion: z.literal(AALIYAH_REGISTRY_VERSION),
  constitutionVersion: z.literal("aaliyah_safety_constitution_v1"),
  items: z.array(AaliyahAtomicAgentRecordSchema).min(1)
});
export type AaliyahAtomicRegistry = z.infer<typeof AaliyahAtomicRegistrySchema>;
