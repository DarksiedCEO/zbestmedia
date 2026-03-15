import { z } from "zod";

import { AgentTaskDomainSchema } from "../agents/domains.js";
import {
  IncidentRecordSchema,
  IncidentSeveritySchema,
  IncidentStatusSchema,
  IncidentTypeSchema
} from "../incidents/types.js";
import type {
  EmailAccountConnectionRecord as EmailAccountConnectionRecordShape,
  EmailAccountConnectionStatus,
  EmailProvider
} from "../email/types.js";
import type { EmailDraftReviewRecord as EmailDraftReviewRecordShape, EmailDraftReviewStatus } from "../email/review-types.js";
import type {
  EmailDispatchPolicyResult as EmailDispatchPolicyResultShape,
  EmailDispatchRecord as EmailDispatchRecordShape,
  EmailDispatchStatus
} from "../email/dispatch-types.js";
import type { VoiceCallRecord as VoiceCallRecordShape } from "../voice/types.js";
import {
  AssignmentPolicyDecisionSchema,
  AssignmentRecordSchema,
  ExecutionRunRecordSchema,
  ExecutionRunStateSchema
} from "../execution/records.js";
import type { AgentId } from "../agents/registry.js";
import type {
  AaliyahFounderPreferenceRecord as AaliyahFounderPreferenceRecordShape,
  AaliyahPreferenceCategory,
  AaliyahPreferenceConfidenceLevel,
  AaliyahPreferenceScope,
  AaliyahPreferenceSourceType,
  AaliyahPreferenceValue
} from "../aaliyah/preference-types.js";
import type {
  AaliyahActiveModeState as AaliyahActiveModeStateShape,
  AaliyahBoundaryViolationResult as AaliyahBoundaryViolationResultShape,
  AaliyahFounderInteractionState as AaliyahFounderInteractionStateShape,
  AaliyahIntentTrailEntry as AaliyahIntentTrailEntryShape,
  AaliyahReviewApprovalContext as AaliyahReviewApprovalContextShape,
  AaliyahSessionContext as AaliyahSessionContextShape,
  AaliyahSessionResetReason,
  AaliyahSessionRetentionPolicy as AaliyahSessionRetentionPolicyShape,
  AaliyahSessionSnapshotView as AaliyahSessionSnapshotViewShape,
  AaliyahWorkingItemContext as AaliyahWorkingItemContextShape
} from "../aaliyah/session-types.js";
import type {
  FollowThroughActionType,
  FollowThroughEscalationClass,
  FollowThroughHistoryEntry as FollowThroughHistoryEntryShape,
  FollowThroughRecord as FollowThroughRecordShape,
  FollowThroughStatus as FollowThroughStatusShape,
  NextGovernedAction as NextGovernedActionShape,
  WorkingItemClosureReason as WorkingItemClosureReasonShape,
  WorkingItemClosureState as WorkingItemClosureStateShape
} from "../aaliyah/follow-through-types.js";
import type {
  AaliyahClosureQualitySignal as AaliyahClosureQualitySignalShape,
  AaliyahDiagnosticsEvent as AaliyahDiagnosticsEventShape,
  AaliyahDiagnosticsEventType,
  AaliyahDiagnosticsSummary as AaliyahDiagnosticsSummaryShape,
  AaliyahDiagnosticsWindow,
  AaliyahDriftSignal as AaliyahDriftSignalShape,
  AaliyahEnforcementTriggerSignal as AaliyahEnforcementTriggerSignalShape,
  AaliyahFounderFrictionSignal as AaliyahFounderFrictionSignalShape,
  AaliyahInterruptionLoadSignal as AaliyahInterruptionLoadSignalShape,
  AaliyahPerformanceSnapshot as AaliyahPerformanceSnapshotShape,
  AaliyahQueueLatencySignal as AaliyahQueueLatencySignalShape,
  AaliyahSessionResetSignal as AaliyahSessionResetSignalShape
} from "../aaliyah/diagnostics-types.js";
import type {
  AssignmentPolicyDecision,
  AssignmentRecord,
  ExecutionRunRecord,
  ExecutionRunState
} from "../execution/record-types.js";
import type { IncidentRecord, IncidentSeverity, IncidentStatus, IncidentType } from "../incidents/types.js";
import { AgentLifecycleStatusSchema } from "../lifecycle/config.js";

export const ApprovalStatusSchema = z.enum(["PENDING", "APPROVED", "REJECTED"]);
export type ApprovalStatus = z.infer<typeof ApprovalStatusSchema>;

export const EvalRunStatusSchema = z.enum(["PENDING", "RUNNING", "COMPLETED", "FAILED"]);
export type EvalRunStatus = z.infer<typeof EvalRunStatusSchema>;

export const ApprovalDecisionSchema = z.enum(["APPROVE", "REJECT"]);
export type ApprovalDecision = z.infer<typeof ApprovalDecisionSchema>;

export const ExecutionStatusSchema = z.enum([
  "QUEUED",
  "PENDING_APPROVAL",
  "RUNNING",
  "COMPLETED",
  "FAILED"
]);
export type ExecutionStatus = z.infer<typeof ExecutionStatusSchema>;

export const ExecutionStepStatusSchema = z.enum(["PENDING", "COMPLETED", "FAILED", "SKIPPED"]);
export type ExecutionStepStatus = z.infer<typeof ExecutionStepStatusSchema>;

export { AssignmentPolicyDecisionSchema, AssignmentRecordSchema, ExecutionRunRecordSchema, ExecutionRunStateSchema };
export type { AssignmentPolicyDecision, AssignmentRecord, ExecutionRunRecord, ExecutionRunState };
export { IncidentRecordSchema, IncidentSeveritySchema, IncidentStatusSchema, IncidentTypeSchema };
export type { IncidentRecord, IncidentSeverity, IncidentStatus, IncidentType };

export const AgentRecordSchema = z.object({
  tenantId: z.string().uuid(),
  agentId: z.custom<AgentId>(),
  displayName: z.string().min(1),
  taskDomain: AgentTaskDomainSchema,
  workflowRole: z.enum(["brand_brain", "visual_law", "distribution_operator", "intelligence_analyst", "revenue_strategist", "orchestrator"]),
  policyProfileId: z.string().min(1),
  memoryPartitionId: z.string().min(1),
  lifecycleProfileId: z.string().min(1),
  evalProfileId: z.string().min(1),
  currentVersionId: z.string().min(1),
  currentStatus: AgentLifecycleStatusSchema,
  prohibitedDomains: z.array(AgentTaskDomainSchema),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  retiredAt: z.string().datetime().nullable().optional()
});
export type AgentRecord = z.infer<typeof AgentRecordSchema>;

export const AgentVersionRecordSchema = z.object({
  tenantId: z.string().uuid(),
  agentVersionId: z.string().min(1),
  agentId: z.custom<AgentId>(),
  versionLabel: z.string().min(1),
  definitionSnapshot: z.record(z.string(), z.unknown()),
  createdBy: z.string().min(1),
  createdAt: z.string().datetime(),
  replacedByVersionId: z.string().nullable().optional()
});
export type AgentVersionRecord = z.infer<typeof AgentVersionRecordSchema>;

export const AgentPolicyProfileRecordSchema = z.object({
  tenantId: z.string().uuid(),
  policyProfileId: z.string().min(1),
  agentId: z.custom<AgentId>(),
  allowedCapabilities: z.array(z.string().min(1)),
  deniedCapabilities: z.array(z.string().min(1)),
  profileSnapshot: z.record(z.string(), z.unknown()),
  createdAt: z.string().datetime()
});
export type AgentPolicyProfileRecord = z.infer<typeof AgentPolicyProfileRecordSchema>;

export const AgentMemoryPartitionRecordSchema = z.object({
  tenantId: z.string().uuid(),
  partitionId: z.string().min(1),
  agentId: z.custom<AgentId>(),
  namespace: z.string().min(1),
  ownedCollections: z.array(z.string().min(1)),
  sharedAccess: z.array(z.string().min(1)),
  partitionSnapshot: z.record(z.string(), z.unknown()),
  createdAt: z.string().datetime()
});
export type AgentMemoryPartitionRecord = z.infer<typeof AgentMemoryPartitionRecordSchema>;

export const AgentLifecycleEventRecordSchema = z.object({
  tenantId: z.string().uuid(),
  lifecycleEventId: z.string().min(1),
  agentId: z.custom<AgentId>(),
  fromStatus: AgentLifecycleStatusSchema.nullable(),
  toStatus: AgentLifecycleStatusSchema,
  actorId: z.string().min(1),
  reason: z.string().min(1),
  metricsSnapshot: z.record(z.string(), z.unknown()),
  metadata: z.record(z.string(), z.unknown()),
  createdAt: z.string().datetime()
});
export type AgentLifecycleEventRecord = z.infer<typeof AgentLifecycleEventRecordSchema>;

export const ApprovalRequestRecordSchema = z.object({
  tenantId: z.string().uuid(),
  approvalRequestId: z.string().min(1),
  agentId: z.custom<AgentId>(),
  subjectType: z.string().min(1),
  subjectId: z.string().min(1),
  requestedBy: z.string().min(1),
  requiredApprovers: z.array(z.string().min(1)).min(1),
  status: ApprovalStatusSchema,
  payload: z.record(z.string(), z.unknown()),
  createdAt: z.string().datetime(),
  resolvedAt: z.string().datetime().nullable().optional(),
  escalatedAt: z.string().datetime().nullable().optional(),
  escalationCount: z.number().int().nonnegative()
});
export type ApprovalRequestRecord = z.infer<typeof ApprovalRequestRecordSchema>;

export const ApprovalDecisionRecordSchema = z.object({
  tenantId: z.string().uuid(),
  approvalDecisionId: z.string().min(1),
  approvalRequestId: z.string().min(1),
  approverId: z.string().min(1),
  decision: ApprovalDecisionSchema,
  rationale: z.string().min(1),
  payload: z.record(z.string(), z.unknown()),
  createdAt: z.string().datetime()
});
export type ApprovalDecisionRecord = z.infer<typeof ApprovalDecisionRecordSchema>;

export const EvalRunRecordSchema = z.object({
  tenantId: z.string().uuid(),
  evalRunId: z.string().min(1),
  agentId: z.custom<AgentId>(),
  agentVersionId: z.string().min(1),
  suiteName: z.string().min(1),
  status: EvalRunStatusSchema,
  scoreSummary: z.record(z.string(), z.unknown()),
  retryCount: z.number().int().nonnegative(),
  maxRetries: z.number().int().nonnegative(),
  nextRetryAt: z.string().datetime().nullable().optional(),
  deadLetteredAt: z.string().datetime().nullable().optional(),
  createdBy: z.string().min(1),
  createdAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable().optional()
});
export type EvalRunRecord = z.infer<typeof EvalRunRecordSchema>;

export const EvalScoreRecordSchema = z.object({
  tenantId: z.string().uuid(),
  evalScoreId: z.string().min(1),
  evalRunId: z.string().min(1),
  metric: z.string().min(1),
  score: z.number(),
  thresholdMin: z.number().nullable().optional(),
  thresholdMax: z.number().nullable().optional(),
  passed: z.boolean(),
  metadata: z.record(z.string(), z.unknown()),
  createdAt: z.string().datetime()
});
export type EvalScoreRecord = z.infer<typeof EvalScoreRecordSchema>;

export const ExecutionRecordSchema = z.object({
  tenantId: z.string().uuid(),
  executionId: z.string().min(1),
  agentId: z.custom<AgentId>(),
  agentVersionId: z.string().min(1),
  correlationId: z.string().min(1),
  requestSource: z.string().min(1),
  requestedBy: z.string().min(1),
  subjectType: z.string().min(1),
  subjectId: z.string().min(1),
  status: ExecutionStatusSchema,
  inputPayload: z.record(z.string(), z.unknown()),
  outputPayload: z.record(z.string(), z.unknown()).nullable().optional(),
  failureClass: z.string().nullable().optional(),
  failureMessage: z.string().nullable().optional(),
  approvalRequestId: z.string().nullable().optional(),
  retryCount: z.number().int().nonnegative(),
  maxRetries: z.number().int().nonnegative(),
  nextRetryAt: z.string().datetime().nullable().optional(),
  deadLetteredAt: z.string().datetime().nullable().optional(),
  startedAt: z.string().datetime().nullable().optional(),
  completedAt: z.string().datetime().nullable().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});
export type ExecutionRecord = z.infer<typeof ExecutionRecordSchema>;

export const ExecutionStepRecordSchema = z.object({
  tenantId: z.string().uuid(),
  executionStepId: z.string().min(1),
  executionId: z.string().min(1),
  stepName: z.string().min(1),
  stepOrder: z.number().int().nonnegative(),
  status: ExecutionStepStatusSchema,
  payload: z.record(z.string(), z.unknown()),
  createdAt: z.string().datetime()
});
export type ExecutionStepRecord = z.infer<typeof ExecutionStepRecordSchema>;

export const EmailProviderSchema = z.enum(["gmail"]);
export const EmailAccountConnectionStatusSchema = z.enum(["oauth_pending", "connected", "disabled", "error", "disconnected"]);
export type { EmailProvider, EmailAccountConnectionStatus };

export const EmailAccountConnectionRecordSchema = z.object({
  tenantId: z.string().uuid(),
  accountId: z.string().min(1),
  provider: EmailProviderSchema,
  principalId: z.string().min(1),
  accountEmailAddress: z.string().email().nullable(),
  connectionStatus: EmailAccountConnectionStatusSchema,
  grantedScopes: z.array(z.string().min(1)),
  tokenReference: z.string().nullable(),
  externalAccountId: z.string().nullable(),
  draftOnlyMode: z.literal(true),
  processingEnabled: z.boolean(),
  processingMode: z.enum(["poll", "watch"]),
  maxBatchThreads: z.number().int().positive(),
  allowedLabelIds: z.array(z.string().min(1)),
  oauthState: z.string().nullable(),
  oauthStateExpiresAt: z.string().datetime().nullable(),
  lastProcessedAt: z.string().datetime().nullable(),
  lastError: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
}) satisfies z.ZodType<EmailAccountConnectionRecordShape>;
export type EmailAccountConnectionRecord = z.infer<typeof EmailAccountConnectionRecordSchema>;


const EmailRoutingTargetSchema = z.union([
  z.object({
    targetType: z.literal("lead_agent"),
    departmentId: z.string().min(1),
    executiveId: z.string().min(1),
    leadAgentId: z.string().min(1),
    subAgentId: z.string().nullable(),
    executionAgentId: z.string().nullable(),
    requiresEscalation: z.boolean()
  }),
  z.object({
    targetType: z.literal("executive_lane"),
    departmentId: z.string().min(1),
    executiveId: z.string().min(1),
    leadAgentId: z.null(),
    subAgentId: z.null(),
    executionAgentId: z.null(),
    requiresEscalation: z.boolean()
  }),
  z.object({
    targetType: z.literal("suppressed"),
    departmentId: z.null(),
    executiveId: z.null(),
    leadAgentId: z.null(),
    subAgentId: z.null(),
    executionAgentId: z.null(),
    requiresEscalation: z.literal(false)
  })
]);

const EmailRoutingResolutionSchema = z.object({
  intentCategory: z.enum([
    "lead_inquiry",
    "client_request",
    "billing_question",
    "meeting_request",
    "vendor_outreach",
    "partnership_inquiry",
    "technical_issue",
    "support_request",
    "general_inquiry",
    "spam_or_irrelevant",
    "legal_or_sensitive"
  ]),
  target: EmailRoutingTargetSchema,
  routingDecision: z.record(z.string(), z.unknown()).nullable(),
  trace: z.array(z.string())
});

export const EmailDraftReviewStatusSchema = z.enum(["pending_review", "approved", "rejected", "revision_requested"]);
export type { EmailDraftReviewStatus };

export const EmailDraftReviewRecordSchema = z.object({
  tenantId: z.string().uuid(),
  reviewItemId: z.string().min(1),
  draftId: z.string().min(1),
  accountId: z.string().min(1),
  threadId: z.string().min(1),
  assignmentRecordId: z.string().nullable(),
  runRecordId: z.string().nullable(),
  intentCategory: z.enum([
    "lead_inquiry",
    "client_request",
    "billing_question",
    "meeting_request",
    "vendor_outreach",
    "partnership_inquiry",
    "technical_issue",
    "support_request",
    "general_inquiry",
    "spam_or_irrelevant",
    "legal_or_sensitive"
  ]),
  priority: z.enum(["low", "normal", "high", "urgent"]),
  riskLevel: z.enum(["low", "medium", "high", "critical"]),
  requiredApproval: z.literal(true),
  reviewStatus: EmailDraftReviewStatusSchema,
  recommendedExecutiveId: z.string().nullable(),
  recommendedDepartmentId: z.string().nullable(),
  recommendedLeadAgentId: z.string().nullable(),
  recommendedSubAgentId: z.string().nullable(),
  draftSummary: z.string().min(1),
  proposedReplySubject: z.string().min(1),
  proposedReplyBody: z.string().min(1),
  confidenceScore: z.number(),
  riskScore: z.number(),
  escalationRecommended: z.boolean(),
  blockedAutoSend: z.literal(true),
  manifestVersion: z.string().min(1),
  routingProvenance: EmailRoutingResolutionSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  reviewedAt: z.string().datetime().nullable(),
  reviewedBy: z.string().nullable(),
  reviewNote: z.string().nullable()
}) satisfies z.ZodType<EmailDraftReviewRecordShape>;
export type EmailDraftReviewRecord = z.infer<typeof EmailDraftReviewRecordSchema>;

export const EmailDispatchStatusSchema = z.enum([
  "dispatch_pending",
  "dispatch_blocked",
  "dispatch_succeeded",
  "dispatch_failed"
]);
export type { EmailDispatchStatus };

export const EmailDispatchPolicyResultSchema = z.object({
  allowed: z.boolean(),
  reason: z.string().min(1),
  hardBlocked: z.boolean()
}) satisfies z.ZodType<EmailDispatchPolicyResultShape>;
export type EmailDispatchPolicyResult = z.infer<typeof EmailDispatchPolicyResultSchema>;

export const EmailDispatchRecordSchema = z.object({
  tenantId: z.string().uuid(),
  dispatchId: z.string().min(1),
  reviewItemId: z.string().min(1),
  draftId: z.string().min(1),
  accountId: z.string().min(1),
  threadId: z.string().min(1),
  assignmentRecordId: z.string().nullable(),
  runRecordId: z.string().nullable(),
  dispatchStatus: EmailDispatchStatusSchema,
  dispatchPolicy: EmailDispatchPolicyResultSchema,
  requestedAt: z.string().datetime(),
  dispatchedAt: z.string().datetime().nullable(),
  failureCategory: z.string().nullable(),
  failureMessage: z.string().nullable(),
  gmailMessageId: z.string().nullable(),
  gmailThreadId: z.string().nullable(),
  auditMetadata: z.record(z.string(), z.unknown()),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
}) satisfies z.ZodType<EmailDispatchRecordShape>;
export type EmailDispatchRecord = z.infer<typeof EmailDispatchRecordSchema>;

const VoiceRoutingTargetSchema = z.union([
  z.object({
    targetType: z.literal("lead_agent"),
    executiveId: z.string().min(1),
    departmentId: z.string().min(1),
    leadAgentId: z.string().min(1),
    subAgentId: z.string().nullable(),
    executionAgentId: z.string().nullable(),
    requiresEscalation: z.boolean()
  }),
  z.object({
    targetType: z.literal("executive_lane"),
    executiveId: z.string().min(1),
    departmentId: z.string().min(1),
    leadAgentId: z.null(),
    subAgentId: z.null(),
    executionAgentId: z.null(),
    requiresEscalation: z.boolean()
  }),
  z.object({
    targetType: z.literal("founder_review"),
    executiveId: z.string().nullable(),
    departmentId: z.string().nullable(),
    leadAgentId: z.null(),
    subAgentId: z.null(),
    executionAgentId: z.null(),
    requiresEscalation: z.literal(true)
  }),
  z.object({
    targetType: z.literal("suppressed"),
    executiveId: z.null(),
    departmentId: z.null(),
    leadAgentId: z.null(),
    subAgentId: z.null(),
    executionAgentId: z.null(),
    requiresEscalation: z.literal(false)
  })
]);

export const VoiceCallRecordSchema = z.object({
  tenantId: z.string().uuid(),
  callId: z.string().min(1),
  externalCallId: z.string().nullable(),
  sourceSystem: z.string().min(1),
  callerPhoneNumber: z.string().min(1),
  callerDisplayName: z.string().nullable(),
  callerOrganizationName: z.string().nullable(),
  transcript: z.string().min(1),
  callSummaryText: z.string().nullable(),
  durationSeconds: z.number().int().nonnegative().nullable(),
  intent: z.enum([
    "emergency_service_request",
    "appointment_request",
    "service_inquiry",
    "existing_customer_followup",
    "billing_question",
    "sales_inquiry",
    "executive_access_request",
    "general_information",
    "wrong_number_or_irrelevant",
    "legal_or_sensitive"
  ]),
  urgency: z.enum(["low", "normal", "high", "critical"]),
  riskLevel: z.enum(["low", "moderate", "high"]),
  companyMode: z.enum(["founder", "zbestmedia"]),
  routingTarget: VoiceRoutingTargetSchema,
  assignmentRecordId: z.string().nullable(),
  runRecordId: z.string().nullable(),
  outcome: z.enum(["routed", "escalated", "suppressed"]),
  founderAttentionRequired: z.boolean(),
  escalationRecommended: z.boolean(),
  interruptionClass: z.enum(["interrupt_now", "review_soon", "can_wait"]),
  recommendedNextAction: z.string().min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
}) satisfies z.ZodType<VoiceCallRecordShape>;
export type VoiceCallRecord = z.infer<typeof VoiceCallRecordSchema>;

export const AaliyahPreferenceCategorySchema = z.enum([
  "briefing_length",
  "interruption_tolerance",
  "approval_visibility",
  "tone_preference",
  "mode_visibility"
]);
export type { AaliyahPreferenceCategory };

export const AaliyahPreferenceValueSchema = z.enum([
  "compact",
  "standard",
  "expanded",
  "minimal",
  "high",
  "all_pending",
  "urgent_only",
  "concise",
  "balanced",
  "detailed",
  "strict",
  "founder_summary"
]);
export type { AaliyahPreferenceValue };

export const AaliyahPreferenceScopeSchema = z.object({
  mode: z.enum(["founder", "zbestmedia", "all"]),
  company: z.enum(["zbestmedia", "all"]),
  founderOnly: z.boolean()
}) satisfies z.ZodType<AaliyahPreferenceScope>;
export type { AaliyahPreferenceScope };

export const AaliyahPreferenceSourceTypeSchema = z.enum(["explicit", "validated_inference"]);
export type { AaliyahPreferenceSourceType };

export const AaliyahPreferenceConfidenceLevelSchema = z.enum(["high", "medium", "low"]);
export type { AaliyahPreferenceConfidenceLevel };

export const AaliyahFounderPreferenceRecordSchema = z.object({
  tenantId: z.string().uuid(),
  preferenceId: z.string().min(1),
  category: AaliyahPreferenceCategorySchema,
  value: AaliyahPreferenceValueSchema,
  scope: AaliyahPreferenceScopeSchema,
  sourceType: AaliyahPreferenceSourceTypeSchema,
  confidenceLevel: AaliyahPreferenceConfidenceLevelSchema,
  active: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  deactivatedAt: z.string().datetime().nullable(),
  createdBy: z.string().min(1),
  deactivatedBy: z.string().nullable()
}) satisfies z.ZodType<AaliyahFounderPreferenceRecordShape>;
export type AaliyahFounderPreferenceRecord = z.infer<typeof AaliyahFounderPreferenceRecordSchema>;

export const AaliyahSessionResetReasonSchema = z.enum([
  "manual_reset",
  "idle_expired",
  "hard_expired",
  "mode_switch",
  "boundary_violation",
  "ambiguity_reset",
  "working_item_closed"
]);
export type { AaliyahSessionResetReason };

export const AaliyahActiveModeStateSchema = z.object({
  activeMode: z.enum(["founder", "zbestmedia"]),
  previousMode: z.enum(["founder", "zbestmedia"]).nullable(),
  switchedAt: z.string().datetime(),
  switchReason: z.enum([
    "session_resume",
    "explicit_request",
    "runtime_switch_intent",
    "fallback_to_default",
    "boundary_enforced_reset"
  ]),
  boundaryDecisionId: z.string().min(1).nullable()
}) satisfies z.ZodType<AaliyahActiveModeStateShape>;
type AaliyahActiveModeStateRecord = z.infer<typeof AaliyahActiveModeStateSchema>;

export const AaliyahIntentTrailEntrySchema = z.object({
  entryId: z.string().min(1),
  sourceSurface: z.enum(["aaliyah_runtime", "aaliyah_admin"]),
  requestId: z.string().min(1).nullable(),
  requestedIntent: z.string().min(1),
  resolvedIntent: z.string().min(1).nullable(),
  activeMode: z.enum(["founder", "zbestmedia"]),
  outcomeType: z.enum(["completed", "fallback"]),
  confidenceLevel: z.enum(["high", "medium", "low"]),
  fallbackOutcome: z.enum([
    "delegate_to_specialist",
    "escalate_for_clarification",
    "deny_due_to_scope",
    "defer_due_to_low_confidence",
    "deny_due_to_mode_boundary"
  ]).nullable(),
  parameterSummary: z.object({
    queueItemId: z.string().min(1).optional(),
    reviewItemId: z.string().min(1).optional(),
    callId: z.string().min(1).optional(),
    incidentId: z.string().min(1).optional(),
    targetMode: z.enum(["founder", "zbestmedia"]).optional()
  }),
  createdAt: z.string().datetime()
}) satisfies z.ZodType<AaliyahIntentTrailEntryShape>;
type AaliyahIntentTrailEntryRecord = z.infer<typeof AaliyahIntentTrailEntrySchema>;

export const AaliyahWorkingItemContextSchema = z.object({
  contextId: z.string().min(1),
  workingItemType: z.enum([
    "founder_queue_item",
    "email_review_item",
    "voice_call",
    "incident",
    "dispatch_candidate",
    "routing_preview"
  ]),
  sourceSubsystem: z.string().min(1),
  sourceItemId: z.string().min(1),
  queueItemId: z.string().min(1).nullable(),
  reviewItemId: z.string().min(1).nullable(),
  callId: z.string().min(1).nullable(),
  incidentId: z.string().min(1).nullable(),
  dispatchId: z.string().min(1).nullable(),
  title: z.string().min(1),
  summary: z.string().min(1),
  founderAttentionRequired: z.boolean(),
  confidenceLevel: z.enum(["high", "medium", "low"]),
  interruptionClass: z.enum(["interrupt_now", "same_day_briefing", "passive_queue", "silent_log"]).nullable(),
  setByIntent: z.string().min(1).nullable(),
  setAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  closureState: z.enum(["open", "completed", "abandoned", "escalated", "invalidated", "reset"]),
  closureReason: z.enum([
    "review_approved",
    "review_rejected",
    "revision_requested",
    "email_dispatched",
    "mode_switched",
    "expired",
    "manual_reset",
    "boundary_denied",
    "ambiguity",
    "item_not_found",
    "cleared_by_runtime"
  ]).nullable(),
  closedAt: z.string().datetime().nullable(),
  closedByIntent: z.string().min(1).nullable()
}) satisfies z.ZodType<AaliyahWorkingItemContextShape>;
type AaliyahWorkingItemContextRecord = z.infer<typeof AaliyahWorkingItemContextSchema>;

export const AaliyahReviewApprovalContextSchema = z.object({
  reviewItemId: z.string().min(1),
  draftId: z.string().min(1).nullable(),
  accountId: z.string().min(1).nullable(),
  threadId: z.string().min(1).nullable(),
  reviewStatus: EmailDraftReviewStatusSchema,
  dispatchReady: z.boolean(),
  setAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  invalidatedAt: z.string().datetime().nullable(),
  invalidationReason: z.enum([
    "review_approved",
    "review_rejected",
    "revision_requested",
    "email_dispatched",
    "mode_switched",
    "expired",
    "manual_reset",
    "item_not_found"
  ]).nullable()
}) satisfies z.ZodType<AaliyahReviewApprovalContextShape>;
type AaliyahReviewApprovalContextRecord = z.infer<typeof AaliyahReviewApprovalContextSchema>;

export const AaliyahFounderInteractionStateSchema = z.object({
  lastInteractionAt: z.string().datetime().nullable(),
  lastIntent: z.string().min(1).nullable(),
  lastResolvedIntent: z.string().min(1).nullable(),
  intentTrail: z.array(AaliyahIntentTrailEntrySchema),
  workingItem: AaliyahWorkingItemContextSchema.nullable(),
  reviewApprovalContext: AaliyahReviewApprovalContextSchema.nullable(),
  pendingDisambiguation: z.object({
    reason: z.string().min(1),
    requestedIntent: z.string().min(1).nullable(),
    createdAt: z.string().datetime()
  }).nullable()
}) satisfies z.ZodType<AaliyahFounderInteractionStateShape>;
type AaliyahFounderInteractionStateRecord = z.infer<typeof AaliyahFounderInteractionStateSchema>;

export const AaliyahSessionRetentionPolicySchema = z.object({
  intentTrailMaxEntries: z.number().int().positive(),
  idleTtlSeconds: z.number().int().positive(),
  hardTtlSeconds: z.number().int().positive(),
  snapshotIntentTrailEntries: z.number().int().positive()
}) satisfies z.ZodType<AaliyahSessionRetentionPolicyShape>;
type AaliyahSessionRetentionPolicyRecord = z.infer<typeof AaliyahSessionRetentionPolicySchema>;

export const AaliyahBoundaryViolationResultSchema = z.object({
  violationId: z.string().min(1),
  activeMode: z.enum(["founder", "zbestmedia"]),
  requestedMode: z.enum(["founder", "zbestmedia"]),
  requestedCompanies: z.array(z.string().min(1)),
  access: z.enum(["denied", "allowed_founder_summary_only"]),
  reasonCodes: z.array(z.string().min(1)),
  enforcedReset: z.boolean(),
  createdAt: z.string().datetime()
}) satisfies z.ZodType<AaliyahBoundaryViolationResultShape>;
type AaliyahBoundaryViolationResultRecord = z.infer<typeof AaliyahBoundaryViolationResultSchema>;

export const AaliyahSessionContextRecordSchema = z.object({
  tenantId: z.string().uuid(),
  actorId: z.string().min(1),
  principalContext: z.enum(["founder", "operator"]),
  sessionId: z.string().min(1),
  companyScope: z.literal("zbestmedia"),
  activeModeState: AaliyahActiveModeStateSchema,
  interactionState: AaliyahFounderInteractionStateSchema,
  retentionPolicy: AaliyahSessionRetentionPolicySchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  hardExpiresAt: z.string().datetime(),
  lastResetAt: z.string().datetime().nullable(),
  lastResetReason: AaliyahSessionResetReasonSchema.nullable(),
  version: z.number().int().positive()
}) satisfies z.ZodType<AaliyahSessionContextShape>;
export type AaliyahSessionContextRecord = z.infer<typeof AaliyahSessionContextRecordSchema>;

export const AaliyahSessionSnapshotViewSchema = z.object({
  sessionId: z.string().min(1),
  tenantId: z.string().uuid(),
  actorId: z.string().min(1),
  principalContext: z.enum(["founder", "operator"]),
  activeModeState: AaliyahActiveModeStateSchema,
  interactionState: z.object({
    lastInteractionAt: z.string().datetime().nullable(),
    lastIntent: z.string().min(1).nullable(),
    lastResolvedIntent: z.string().min(1).nullable(),
    intentTrail: z.array(AaliyahIntentTrailEntrySchema),
    workingItem: AaliyahWorkingItemContextSchema.nullable(),
    reviewApprovalContext: AaliyahReviewApprovalContextSchema.nullable(),
    pendingDisambiguation: AaliyahFounderInteractionStateSchema.shape.pendingDisambiguation
  }),
  retentionPolicy: AaliyahSessionRetentionPolicySchema,
  expiresAt: z.string().datetime(),
  hardExpiresAt: z.string().datetime(),
  lastResetAt: z.string().datetime().nullable(),
  lastResetReason: AaliyahSessionResetReasonSchema.nullable(),
  updatedAt: z.string().datetime(),
  version: z.number().int().positive()
}) satisfies z.ZodType<AaliyahSessionSnapshotViewShape>;
type AaliyahSessionSnapshotViewRecord = z.infer<typeof AaliyahSessionSnapshotViewSchema>;

export const FollowThroughStatusSchema = z.enum([
  "active",
  "completed",
  "abandoned",
  "escalated",
  "invalidated",
  "reset"
]);
export type FollowThroughStatus = z.infer<typeof FollowThroughStatusSchema>;

export const WorkingItemClosureStateSchema = z.enum([
  "active",
  "completed",
  "abandoned",
  "escalated",
  "invalidated",
  "reset"
]) satisfies z.ZodType<WorkingItemClosureStateShape>;
type WorkingItemClosureStateRecord = z.infer<typeof WorkingItemClosureStateSchema>;

export const WorkingItemClosureReasonSchema = z.enum([
  "review_approved",
  "review_rejected",
  "revision_requested",
  "email_dispatched",
  "mode_switched",
  "expired",
  "manual_reset",
  "boundary_denied",
  "ambiguity",
  "item_not_found",
  "cleared_by_runtime",
  "founder_declared_completed",
  "founder_declared_abandoned",
  "founder_declared_escalated",
  "founder_declared_invalidated",
  "dispatch_confirmed",
  "review_completed",
  "voice_escalated",
  "incident_acknowledged",
  "incident_resolved"
]) satisfies z.ZodType<WorkingItemClosureReasonShape>;
type WorkingItemClosureReasonRecord = z.infer<typeof WorkingItemClosureReasonSchema>;

export const NextGovernedActionSchema = z.enum([
  "none_terminal",
  "await_founder_review",
  "dispatch_approved_email",
  "open_voice_escalation",
  "refresh_briefing",
  "select_new_queue_item",
  "resolve_disambiguation"
]) satisfies z.ZodType<NextGovernedActionShape>;
type NextGovernedActionRecord = z.infer<typeof NextGovernedActionSchema>;

export const FollowThroughEscalationClassSchema = z.enum([
  "founder_attention",
  "operator_review",
  "incident_response",
  "specialist_handoff"
]) satisfies z.ZodType<FollowThroughEscalationClass>;
type FollowThroughEscalationClassRecord = z.infer<typeof FollowThroughEscalationClassSchema>;

export const FollowThroughActionTypeSchema = z.enum([
  "complete",
  "abandon",
  "escalate",
  "invalidate"
]) satisfies z.ZodType<FollowThroughActionType>;
type FollowThroughActionTypeRecord = z.infer<typeof FollowThroughActionTypeSchema>;

export const FollowThroughRecordSchema = z.object({
  tenantId: z.string().uuid(),
  followThroughId: z.string().min(1),
  sessionId: z.string().min(1),
  actorId: z.string().min(1),
  principalContext: z.enum(["founder", "operator"]),
  activeMode: z.enum(["founder", "zbestmedia"]),
  companyScope: z.literal("zbestmedia"),
  workingItemType: z.enum([
    "founder_queue_item",
    "email_review_item",
    "voice_call",
    "incident",
    "dispatch_candidate",
    "routing_preview"
  ]),
  sourceSubsystem: z.string().min(1),
  sourceItemId: z.string().min(1),
  queueItemId: z.string().min(1).nullable(),
  reviewItemId: z.string().min(1).nullable(),
  callId: z.string().min(1).nullable(),
  incidentId: z.string().min(1).nullable(),
  dispatchId: z.string().min(1).nullable(),
  title: z.string().min(1),
  summary: z.string().min(1),
  status: FollowThroughStatusSchema,
  closureState: WorkingItemClosureStateSchema,
  closureReason: WorkingItemClosureReasonSchema.nullable(),
  nextGovernedAction: NextGovernedActionSchema,
  founderDeclaredCompletion: z.boolean(),
  downstreamActionRef: z.string().min(1).nullable(),
  escalationTarget: z.string().min(1).nullable(),
  escalationClass: FollowThroughEscalationClassSchema.nullable(),
  escalationRationale: z.string().min(1).nullable(),
  escalationProvenance: z.record(z.string(), z.unknown()).nullable(),
  note: z.string().min(1).nullable(),
  provenance: z.object({
    queueItemId: z.string().min(1).nullable(),
    reviewItemId: z.string().min(1).nullable(),
    callId: z.string().min(1).nullable(),
    incidentId: z.string().min(1).nullable(),
    dispatchId: z.string().min(1).nullable(),
    sessionVersion: z.number().int().positive()
  }),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  closedAt: z.string().datetime().nullable()
}) satisfies z.ZodType<FollowThroughRecordShape>;
export type FollowThroughRecord = z.infer<typeof FollowThroughRecordSchema>;

export const FollowThroughHistoryEntrySchema = z.object({
  tenantId: z.string().uuid(),
  eventId: z.string().min(1),
  followThroughId: z.string().min(1),
  action: FollowThroughActionTypeSchema,
  previousStatus: FollowThroughStatusSchema,
  resultingStatus: FollowThroughStatusSchema,
  closureState: WorkingItemClosureStateSchema,
  closureReason: WorkingItemClosureReasonSchema,
  nextGovernedAction: NextGovernedActionSchema,
  founderDeclaredCompletion: z.boolean(),
  downstreamActionRef: z.string().min(1).nullable(),
  escalationTarget: z.string().min(1).nullable(),
  escalationClass: FollowThroughEscalationClassSchema.nullable(),
  escalationRationale: z.string().min(1).nullable(),
  escalationProvenance: z.record(z.string(), z.unknown()).nullable(),
  note: z.string().min(1).nullable(),
  actorId: z.string().min(1),
  createdAt: z.string().datetime()
}) satisfies z.ZodType<FollowThroughHistoryEntryShape>;
export type FollowThroughHistoryEntry = z.infer<typeof FollowThroughHistoryEntrySchema>;

export const AaliyahDiagnosticsWindowSchema = z.enum(["24h", "7d", "30d"]) satisfies z.ZodType<AaliyahDiagnosticsWindow>;
export type AaliyahDiagnosticsWindowRecord = z.infer<typeof AaliyahDiagnosticsWindowSchema>;

export const AaliyahDiagnosticsEventTypeSchema = z.enum([
  "runtime_result",
  "session_reset",
  "follow_through_invalid_action"
]) satisfies z.ZodType<AaliyahDiagnosticsEventType>;
export type AaliyahDiagnosticsEventTypeRecord = z.infer<typeof AaliyahDiagnosticsEventTypeSchema>;

export const AaliyahDiagnosticsEventSchema = z.object({
  tenantId: z.string().uuid(),
  eventId: z.string().min(1),
  actorId: z.string().min(1),
  principalContext: z.enum(["founder", "operator"]),
  activeMode: z.enum(["founder", "zbestmedia"]),
  eventType: AaliyahDiagnosticsEventTypeSchema,
  eventSource: z.enum(["aaliyah_runtime", "aaliyah_session", "aaliyah_follow_through"]),
  signalKey: z.string().min(1),
  payload: z.record(z.string(), z.unknown()),
  createdAt: z.string().datetime()
}) satisfies z.ZodType<AaliyahDiagnosticsEventShape>;
export type AaliyahDiagnosticsEventRecord = z.infer<typeof AaliyahDiagnosticsEventSchema>;

export const AaliyahDriftSignalSchema = z.object({
  signalId: z.string().min(1),
  metric: z.enum([
    "ambiguity_fallback_rate",
    "low_confidence_defer_rate",
    "denied_due_to_scope_rate",
    "specialist_delegation_rate",
    "invalid_action_attempt_rate",
    "escalation_rate"
  ]),
  count: z.number().int().nonnegative(),
  denominator: z.number().int().nonnegative(),
  rate: z.number().min(0)
}) satisfies z.ZodType<AaliyahDriftSignalShape>;

export const AaliyahQueueLatencySignalSchema = z.object({
  pendingReviewCount: z.number().int().nonnegative(),
  pendingReviewAgeBuckets: z.object({
    under1Hour: z.number().int().nonnegative(),
    oneToFourHours: z.number().int().nonnegative(),
    fourToTwentyFourHours: z.number().int().nonnegative(),
    overTwentyFourHours: z.number().int().nonnegative()
  }),
  oldestPendingReviewAgeSeconds: z.number().int().nonnegative().nullable()
}) satisfies z.ZodType<AaliyahQueueLatencySignalShape>;

export const AaliyahClosureQualitySignalSchema = z.object({
  totalTerminalEvents: z.number().int().nonnegative(),
  founderDeclaredCompletionCount: z.number().int().nonnegative(),
  founderDeclaredCompletionRate: z.number().min(0),
  downstreamConfirmedCompletionCount: z.number().int().nonnegative(),
  downstreamConfirmedCompletionRate: z.number().min(0),
  invalidationCount: z.number().int().nonnegative(),
  invalidationRate: z.number().min(0),
  abandonmentCount: z.number().int().nonnegative(),
  abandonmentRate: z.number().min(0),
  escalationCount: z.number().int().nonnegative(),
  escalationWithRationaleCount: z.number().int().nonnegative(),
  escalationWithRationaleCompleteness: z.number().min(0),
  terminalActionIdempotencyFailureCount: z.number().int().nonnegative()
}) satisfies z.ZodType<AaliyahClosureQualitySignalShape>;

export const AaliyahInterruptionLoadSignalSchema = z.object({
  interruptNowCount: z.number().int().nonnegative(),
  sameDayBriefingCount: z.number().int().nonnegative(),
  passiveQueueCount: z.number().int().nonnegative(),
  silentLogCount: z.number().int().nonnegative(),
  highInterruptionConcentrationWindows: z.array(z.object({
    hourStartedAt: z.string().datetime(),
    interruptNowCount: z.number().int().positive()
  }))
}) satisfies z.ZodType<AaliyahInterruptionLoadSignalShape>;

export const AaliyahSessionResetSignalSchema = z.object({
  softResetCount: z.number().int().nonnegative(),
  hardExpirationCount: z.number().int().nonnegative(),
  disambiguationExpiryCount: z.number().int().nonnegative(),
  staleContextRejectionCount: z.number().int().nonnegative()
}) satisfies z.ZodType<AaliyahSessionResetSignalShape>;

export const AaliyahEnforcementTriggerSignalSchema = z.object({
  deniedDueToScopeCount: z.number().int().nonnegative(),
  deniedDueToModeBoundaryCount: z.number().int().nonnegative(),
  lowConfidenceDeferCount: z.number().int().nonnegative(),
  ambiguityFallbackCount: z.number().int().nonnegative(),
  specialistDelegationCount: z.number().int().nonnegative(),
  invalidActionAttemptCount: z.number().int().nonnegative()
}) satisfies z.ZodType<AaliyahEnforcementTriggerSignalShape>;

export const AaliyahFounderFrictionSignalSchema = z.object({
  founderDeclaredCompletionCount: z.number().int().nonnegative(),
  manualResetCount: z.number().int().nonnegative(),
  pendingReviewOverTwentyFourHoursCount: z.number().int().nonnegative(),
  staleContextRejectionCount: z.number().int().nonnegative(),
  openCriticalIncidentCount: z.number().int().nonnegative()
}) satisfies z.ZodType<AaliyahFounderFrictionSignalShape>;

export const AaliyahPerformanceSnapshotSchema = z.object({
  snapshotId: z.string().min(1),
  generatedAt: z.string().datetime(),
  window: AaliyahDiagnosticsWindowSchema,
  windowStartedAt: z.string().datetime(),
  windowEndedAt: z.string().datetime(),
  nextGovernedActionDistribution: z.record(z.string(), z.number().int().nonnegative()),
  followThroughTerminalCounts: z.record(z.string(), z.number().int().nonnegative()),
  reviewQueueLatency: AaliyahQueueLatencySignalSchema,
  closureQuality: AaliyahClosureQualitySignalSchema,
  interruptionLoad: AaliyahInterruptionLoadSignalSchema,
  sessionReset: AaliyahSessionResetSignalSchema,
  enforcementTriggers: AaliyahEnforcementTriggerSignalSchema,
  founderFriction: AaliyahFounderFrictionSignalSchema,
  driftSignals: z.array(AaliyahDriftSignalSchema),
  sourceMetadata: z.object({
    runtimeEventCount: z.number().int().nonnegative(),
    followThroughHistoryCount: z.number().int().nonnegative(),
    voiceCallCount: z.number().int().nonnegative(),
    pendingReviewCount: z.number().int().nonnegative(),
    incidentCount: z.number().int().nonnegative()
  })
}) satisfies z.ZodType<AaliyahPerformanceSnapshotShape>;

export const AaliyahDiagnosticsSummarySchema = z.object({
  tenantId: z.string().uuid(),
  principalContext: z.enum(["founder", "operator"]),
  activeMode: z.enum(["founder", "zbestmedia", "mixed"]),
  snapshot: AaliyahPerformanceSnapshotSchema,
  attentionFlags: z.array(z.object({
    code: z.string().min(1),
    severity: z.enum(["info", "warning", "critical"]),
    summary: z.string().min(1)
  }))
}) satisfies z.ZodType<AaliyahDiagnosticsSummaryShape>;
export type AaliyahDiagnosticsSummaryRecord = z.infer<typeof AaliyahDiagnosticsSummarySchema>;

export const MemoryEntryRecordSchema = z.object({
  tenantId: z.string().uuid(),
  memoryEntryId: z.string().min(1),
  partitionId: z.string().min(1),
  agentId: z.custom<AgentId>(),
  collection: z.string().min(1),
  entryKey: z.string().min(1),
  entryValue: z.record(z.string(), z.unknown()),
  classification: z.enum(["owned", "shared_policy"]),
  createdBy: z.string().min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});
export type MemoryEntryRecord = z.infer<typeof MemoryEntryRecordSchema>;

export const OrchestrationBundleExportRecordSchema = z.object({
  tenantId: z.string().uuid(),
  exportId: z.string().min(1),
  executionId: z.string().min(1),
  exportedBy: z.string().min(1),
  payloadHash: z.string().min(1),
  signature: z.string().min(1),
  sealedAt: z.string().datetime(),
  bundleSnapshot: z.record(z.string(), z.unknown()),
  createdAt: z.string().datetime()
});
export type OrchestrationBundleExportRecord = z.infer<typeof OrchestrationBundleExportRecordSchema>;

export const OrchestrationOpsSnapshotTypeSchema = z.enum([
  "worker_freshness",
  "alerts",
  "diagnostics",
  "inventory"
]);
export type OrchestrationOpsSnapshotType = z.infer<typeof OrchestrationOpsSnapshotTypeSchema>;

export const OrchestrationOpsSnapshotExportRecordSchema = z.object({
  tenantId: z.string().uuid(),
  exportId: z.string().min(1),
  snapshotType: OrchestrationOpsSnapshotTypeSchema,
  exportedBy: z.string().min(1),
  payloadHash: z.string().min(1),
  signature: z.string().min(1),
  sealedAt: z.string().datetime(),
  snapshot: z.record(z.string(), z.unknown()),
  createdAt: z.string().datetime()
});
export type OrchestrationOpsSnapshotExportRecord = z.infer<typeof OrchestrationOpsSnapshotExportRecordSchema>;

export const WorkerHeartbeatRecordSchema = z.object({
  tenantId: z.string().uuid(),
  workerHeartbeatId: z.string().min(1),
  workerId: z.string().min(1),
  workerKind: z.string().min(1),
  agentId: z.custom<AgentId>().nullable().optional(),
  status: z.enum(["starting", "idle", "running", "error"]),
  details: z.record(z.string(), z.unknown()),
  observedAt: z.string().datetime()
});
export type WorkerHeartbeatRecord = z.infer<typeof WorkerHeartbeatRecordSchema>;

export const OrchestrationAlertAckRecordSchema = z.object({
  tenantId: z.string().uuid(),
  alertAckId: z.string().min(1),
  alertCode: z.string().min(1),
  acknowledgedBy: z.string().min(1),
  reason: z.string().min(1),
  details: z.record(z.string(), z.unknown()),
  createdAt: z.string().datetime(),
  reopenedAt: z.string().datetime().nullable().optional(),
  reopenedBy: z.string().nullable().optional(),
  reopenReason: z.string().nullable().optional()
});
export type OrchestrationAlertAckRecord = z.infer<typeof OrchestrationAlertAckRecordSchema>;

export type AgentOsFoundationBundle = {
  agents: AgentRecord[];
  versions: AgentVersionRecord[];
  policyProfiles: AgentPolicyProfileRecord[];
  memoryPartitions: AgentMemoryPartitionRecord[];
};
