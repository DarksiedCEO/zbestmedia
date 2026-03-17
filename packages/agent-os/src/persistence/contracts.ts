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
  FounderDeliveryPreferences,
  FounderDigestPreferences,
  FounderEscalationPreferences,
  FounderNotificationPreferences,
  FounderOpportunityPreferences,
  FounderPreferencesRecord as FounderPreferencesRecordShape,
  FounderRecommendationPreferences,
  FounderSchedulerPreferences
} from "../aaliyah/founder-preferences-types.js";
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
  AaliyahMutationIdempotencyRecord as AaliyahMutationIdempotencyRecordShape,
  AaliyahMutationIdempotencyState,
  AaliyahMutationOperation
} from "../aaliyah/idempotency-types.js";
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
  AaliyahCrmAccount as AaliyahCrmAccountShape,
  AaliyahCrmAccountStatus,
  AaliyahCrmContact as AaliyahCrmContactShape,
  AaliyahCrmContactStatus,
  AaliyahCrmNote as AaliyahCrmNoteShape,
  AaliyahCrmRelationshipStage
} from "../aaliyah/crm-types.js";
import type {
  AaliyahTask as AaliyahTaskShape,
  AaliyahTaskPriority,
  AaliyahTaskSource,
  AaliyahTaskStatus
} from "../aaliyah/tasks-types.js";
import type {
  FounderCommandExecutionStatus,
  FounderCommandRecord as FounderCommandRecordShape,
  FounderCommandTargetType,
  FounderCommandType
} from "../aaliyah/founder-command-types.js";
import type {
  FollowThroughDecisionType,
  FollowThroughEngineRecord as FollowThroughEngineRecordShape,
  FollowThroughEvaluationStatus,
  FollowThroughPolicyKey,
  FollowThroughSourceType
} from "../aaliyah/follow-through-engine-types.js";
import type {
  RecommendationRecord as RecommendationRecordShape,
  RecommendationSourceType,
  RecommendationStatus,
  RecommendationType
} from "../aaliyah/recommendation-engine-types.js";
import type {
  NotificationRecord as NotificationRecordShape,
  NotificationSeverity,
  NotificationSourceType,
  NotificationStatus,
  NotificationType
} from "../aaliyah/notification-engine-types.js";
import type {
  OpportunityRecord as OpportunityRecordShape,
  OpportunitySourceType,
  OpportunityStatus,
  OpportunityType
} from "../aaliyah/opportunity-engine-types.js";
import type {
  StrategicInsightRecord as StrategicInsightRecordShape,
  StrategicInsightStatus,
  StrategicInsightType
} from "../aaliyah/strategic-intelligence-types.js";
import type {
  CoalescedSignalRecord as CoalescedSignalRecordShape,
  CoalescedSignalStatus,
  CoalescedSignalType,
  CoalescedSourceRecordType
} from "../aaliyah/signal-coalescing-types.js";
import type {
  EscalationLevel,
  EscalationRecord as EscalationRecordShape,
  EscalationSourceRecordType,
  EscalationStatus,
  EscalationType
} from "../aaliyah/escalation-engine-types.js";
import type {
  OperatorQueueActionableCommandType,
  OperatorQueueActionableTargetType,
  OperatorQueueItemType,
  OperatorQueuePriorityBand,
  OperatorQueueRecord as OperatorQueueRecordShape,
  OperatorQueueStatus,
  OperatorQueueSourceType
} from "../aaliyah/operator-queue-types.js";
import type {
  OperatorActionExecutionStatus,
  OperatorActionFailureCode,
  OperatorActionLogRecord as OperatorActionLogRecordShape
} from "../aaliyah/operator-action-types.js";
import type {
  CanonicalIssueState,
  IssueStateRecord as IssueStateRecordShape,
  OutcomeFeedbackRecord as OutcomeFeedbackRecordShape,
  OutcomeFeedbackStatus,
  OutcomeFeedbackType
} from "../aaliyah/outcome-feedback-types.js";
import type {
  EvaluationCadenceType,
  EvaluationRunRecord as EvaluationRunRecordShape,
  EvaluationRunStatus,
  EvaluationScheduleRecord as EvaluationScheduleRecordShape,
  EvaluationScheduleStatus,
  ScheduledEngineType
} from "../aaliyah/evaluation-scheduler-types.js";
import type {
  DeliveryChannel,
  DeliveryRecord as DeliveryRecordShape,
  DeliverySourceType,
  DeliveryStatus
} from "../aaliyah/delivery-router-types.js";
import type {
  DigestRecord as DigestRecordShape,
  DigestStatus,
  DigestType
} from "../aaliyah/digest-composer-types.js";
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

export const AaliyahCrmContactStatusSchema = z.enum(["lead", "active", "inactive", "blocked"]) satisfies z.ZodType<AaliyahCrmContactStatus>;
export type AaliyahCrmContactStatusRecord = z.infer<typeof AaliyahCrmContactStatusSchema>;

export const AaliyahCrmRelationshipStageSchema = z.enum([
  "new",
  "contacted",
  "qualified",
  "proposal",
  "client",
  "follow_up",
  "dormant"
]) satisfies z.ZodType<AaliyahCrmRelationshipStage>;
export type AaliyahCrmRelationshipStageRecord = z.infer<typeof AaliyahCrmRelationshipStageSchema>;

export const AaliyahCrmAccountStatusSchema = z.enum(["active", "inactive"]) satisfies z.ZodType<AaliyahCrmAccountStatus>;
export type AaliyahCrmAccountStatusRecord = z.infer<typeof AaliyahCrmAccountStatusSchema>;

export const AaliyahCrmContactSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().uuid(),
  principalId: z.string().min(1),
  email: z.string().email(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  accountId: z.string().min(1).nullable(),
  roleTitle: z.string().nullable(),
  phone: z.string().nullable(),
  status: AaliyahCrmContactStatusSchema,
  relationshipStage: AaliyahCrmRelationshipStageSchema,
  lastTouchedAt: z.string().datetime().nullable(),
  nextActionAt: z.string().datetime().nullable(),
  notesSummary: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
}) satisfies z.ZodType<AaliyahCrmContactShape>;
export type AaliyahCrmContactRecord = z.infer<typeof AaliyahCrmContactSchema>;

export const AaliyahCrmAccountSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().uuid(),
  name: z.string().min(1),
  website: z.string().nullable(),
  industry: z.string().nullable(),
  status: AaliyahCrmAccountStatusSchema,
  notesSummary: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
}) satisfies z.ZodType<AaliyahCrmAccountShape>;
export type AaliyahCrmAccountRecord = z.infer<typeof AaliyahCrmAccountSchema>;

export const AaliyahCrmNoteSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().uuid(),
  contactId: z.string().min(1).nullable(),
  accountId: z.string().min(1).nullable(),
  authorPrincipalId: z.string().min(1),
  note: z.string().min(1),
  createdAt: z.string().datetime()
}) satisfies z.ZodType<AaliyahCrmNoteShape>;
export type AaliyahCrmNoteRecord = z.infer<typeof AaliyahCrmNoteSchema>;

export const AaliyahTaskStatusSchema = z.enum(["open", "in_progress", "blocked", "completed", "cancelled"]) satisfies z.ZodType<AaliyahTaskStatus>;
export type AaliyahTaskStatusRecord = z.infer<typeof AaliyahTaskStatusSchema>;

export const AaliyahTaskPrioritySchema = z.enum(["low", "normal", "high", "critical"]) satisfies z.ZodType<AaliyahTaskPriority>;
export type AaliyahTaskPriorityRecord = z.infer<typeof AaliyahTaskPrioritySchema>;

export const AaliyahTaskSourceSchema = z.enum([
  "manual",
  "crm_follow_up",
  "calendar_follow_up",
  "email_follow_up",
  "system"
]) satisfies z.ZodType<AaliyahTaskSource>;
export type AaliyahTaskSourceRecord = z.infer<typeof AaliyahTaskSourceSchema>;

export const AaliyahTaskSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().uuid(),
  principalId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().nullable(),
  status: AaliyahTaskStatusSchema,
  priority: AaliyahTaskPrioritySchema,
  source: AaliyahTaskSourceSchema,
  contactId: z.string().min(1).nullable(),
  accountId: z.string().min(1).nullable(),
  relatedEmailDraftId: z.string().min(1).nullable(),
  relatedCalendarEventId: z.string().min(1).nullable(),
  dueAt: z.string().datetime().nullable(),
  remindAt: z.string().datetime().nullable(),
  blockedReason: z.string().nullable(),
  completionNote: z.string().nullable(),
  nextStepSummary: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable()
}) satisfies z.ZodType<AaliyahTaskShape>;
export type AaliyahTaskRecord = z.infer<typeof AaliyahTaskSchema>;

export const FounderCommandTypeSchema = z.enum([
  "approve_draft",
  "create_follow_up",
  "escalate_task",
  "override_schedule",
  "trigger_workflow"
]) satisfies z.ZodType<FounderCommandType>;
export type FounderCommandTypeRecord = z.infer<typeof FounderCommandTypeSchema>;

export const FounderCommandTargetTypeSchema = z.enum([
  "gmail_draft",
  "task",
  "calendar_event",
  "contact",
  "account",
  "workflow"
]) satisfies z.ZodType<FounderCommandTargetType>;
export type FounderCommandTargetTypeRecord = z.infer<typeof FounderCommandTargetTypeSchema>;

export const FounderCommandExecutionStatusSchema = z.enum(["executed", "noop"]) satisfies z.ZodType<FounderCommandExecutionStatus>;
export type FounderCommandExecutionStatusRecord = z.infer<typeof FounderCommandExecutionStatusSchema>;

export const AaliyahFounderCommandRecordSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().uuid(),
  requestId: z.string().min(1),
  actorUserId: z.string().min(1),
  actorRole: z.literal("founder"),
  commandType: FounderCommandTypeSchema,
  targetType: FounderCommandTargetTypeSchema,
  targetId: z.string().min(1),
  payload: z.record(z.string(), z.unknown()),
  idempotencyKey: z.string().min(1),
  executionStatus: FounderCommandExecutionStatusSchema,
  summary: z.string().min(1),
  auditEventId: z.string().min(1).nullable(),
  metadata: z.record(z.string(), z.unknown()),
  createdAt: z.string().datetime(),
  executedAt: z.string().datetime().nullable()
}) satisfies z.ZodType<FounderCommandRecordShape>;
export type AaliyahFounderCommandRecord = z.infer<typeof AaliyahFounderCommandRecordSchema>;

export const FollowThroughSourceTypeSchema = z.enum([
  "founder_command",
  "task",
  "gmail_draft",
  "calendar_event",
  "contact",
  "account"
]) satisfies z.ZodType<FollowThroughSourceType>;
export type FollowThroughSourceTypeRecord = z.infer<typeof FollowThroughSourceTypeSchema>;

export const FollowThroughPolicyKeySchema = z.enum([
  "FT-001-approved-draft-next-step",
  "FT-002-workflow-dependency-next-step",
  "FT-003-overdue-task-stale",
  "FT-004-event-linked-recap",
  "FT-005-rejected-intent-context"
]) satisfies z.ZodType<FollowThroughPolicyKey>;
export type FollowThroughPolicyKeyRecord = z.infer<typeof FollowThroughPolicyKeySchema>;

export const FollowThroughDecisionTypeSchema = z.enum([
  "create_task",
  "queue_founder_review",
  "flag_stale",
  "record_blocked",
  "noop"
]) satisfies z.ZodType<FollowThroughDecisionType>;
export type FollowThroughDecisionTypeRecord = z.infer<typeof FollowThroughDecisionTypeSchema>;

export const FollowThroughEvaluationStatusSchema = z.enum([
  "eligible",
  "blocked",
  "stale",
  "noop"
]) satisfies z.ZodType<FollowThroughEvaluationStatus>;
export type FollowThroughEvaluationStatusRecord = z.infer<typeof FollowThroughEvaluationStatusSchema>;

export const AaliyahFollowThroughEngineRecordSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().uuid(),
  source: z.object({
    sourceType: FollowThroughSourceTypeSchema,
    sourceId: z.string().min(1)
  }),
  policyKey: FollowThroughPolicyKeySchema,
  decisionType: FollowThroughDecisionTypeSchema,
  status: FollowThroughEvaluationStatusSchema,
  reason: z.string().min(1),
  summary: z.string().min(1),
  idempotencyKey: z.string().min(1),
  createdArtifactIds: z.array(z.string().min(1)),
  auditEventId: z.string().min(1).nullable(),
  metadata: z.record(z.string(), z.unknown()),
  createdAt: z.string().datetime(),
  evaluatedAtIso: z.string().datetime()
}) satisfies z.ZodType<FollowThroughEngineRecordShape>;
export type AaliyahFollowThroughEngineRecord = z.infer<typeof AaliyahFollowThroughEngineRecordSchema>;

export const RecommendationTypeSchema = z.enum([
  "send_now",
  "follow_up_now",
  "review_blocked",
  "escalate_now",
  "revive_contact",
  "schedule_next",
  "noop"
]) satisfies z.ZodType<RecommendationType>;
export type RecommendationTypeRecord = z.infer<typeof RecommendationTypeSchema>;

export const RecommendationSourceTypeSchema = z.enum([
  "follow_through_record",
  "founder_command",
  "task",
  "gmail_draft",
  "calendar_event",
  "contact",
  "account"
]) satisfies z.ZodType<RecommendationSourceType>;
export type RecommendationSourceTypeRecord = z.infer<typeof RecommendationSourceTypeSchema>;

export const RecommendationStatusSchema = z.enum([
  "active",
  "dismissed",
  "accepted",
  "noop"
]) satisfies z.ZodType<RecommendationStatus>;
export type RecommendationStatusRecord = z.infer<typeof RecommendationStatusSchema>;

export const AaliyahRecommendationRecordSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().uuid(),
  source: z.object({
    sourceType: RecommendationSourceTypeSchema,
    sourceId: z.string().min(1)
  }),
  recommendationType: RecommendationTypeSchema,
  status: RecommendationStatusSchema,
  reason: z.string().min(1),
  summary: z.string().min(1),
  idempotencyKey: z.string().min(1),
  relatedCommandId: z.string().min(1).nullable(),
  relatedTaskId: z.string().min(1).nullable(),
  metadata: z.record(z.string(), z.unknown()),
  auditEventId: z.string().min(1).nullable(),
  createdAtIso: z.string().datetime(),
  evaluatedAtIso: z.string().datetime()
}) satisfies z.ZodType<RecommendationRecordShape>;
export type AaliyahRecommendationRecord = z.infer<typeof AaliyahRecommendationRecordSchema>;

export const NotificationTypeSchema = z.enum([
  "stale_critical_work",
  "blocked_recommendation",
  "founder_review_required",
  "high_priority_follow_through",
  "opportunity_signal",
  "noop"
]) satisfies z.ZodType<NotificationType>;
export type NotificationTypeRecord = z.infer<typeof NotificationTypeSchema>;

export const NotificationSeveritySchema = z.enum([
  "info",
  "warning",
  "critical"
]) satisfies z.ZodType<NotificationSeverity>;
export type NotificationSeverityRecord = z.infer<typeof NotificationSeveritySchema>;

export const NotificationStatusSchema = z.enum([
  "active",
  "acknowledged",
  "dismissed"
]) satisfies z.ZodType<NotificationStatus>;
export type NotificationStatusRecord = z.infer<typeof NotificationStatusSchema>;

export const NotificationSourceTypeSchema = z.enum([
  "follow_through_record",
  "recommendation",
  "task",
  "founder_command",
  "contact",
  "account"
]) satisfies z.ZodType<NotificationSourceType>;
export type NotificationSourceTypeRecord = z.infer<typeof NotificationSourceTypeSchema>;

export const AaliyahNotificationRecordSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().uuid(),
  source: z.object({
    sourceType: NotificationSourceTypeSchema,
    sourceId: z.string().min(1)
  }),
  notificationType: NotificationTypeSchema,
  severity: NotificationSeveritySchema,
  status: NotificationStatusSchema,
  title: z.string().min(1),
  summary: z.string().min(1),
  reason: z.string().min(1),
  idempotencyKey: z.string().min(1),
  relatedRecommendationId: z.string().min(1).nullable(),
  relatedTaskId: z.string().min(1).nullable(),
  auditEventId: z.string().min(1).nullable(),
  metadata: z.record(z.string(), z.unknown()),
  createdAtIso: z.string().datetime(),
  evaluatedAtIso: z.string().datetime(),
  acknowledgedAtIso: z.string().datetime().nullable(),
  dismissedAtIso: z.string().datetime().nullable()
}) satisfies z.ZodType<NotificationRecordShape>;
export type AaliyahNotificationRecord = z.infer<typeof AaliyahNotificationRecordSchema>;

export const DeliveryChannelSchema = z.enum([
  "console",
  "email"
]) satisfies z.ZodType<DeliveryChannel>;
export type DeliveryChannelRecord = z.infer<typeof DeliveryChannelSchema>;

export const DeliverySourceTypeSchema = z.enum([
  "notification",
  "digest"
]) satisfies z.ZodType<DeliverySourceType>;
export type DeliverySourceTypeRecord = z.infer<typeof DeliverySourceTypeSchema>;

export const DeliveryStatusSchema = z.enum([
  "pending",
  "sent",
  "failed",
  "replayed"
]) satisfies z.ZodType<DeliveryStatus>;
export type DeliveryStatusRecord = z.infer<typeof DeliveryStatusSchema>;

export const AaliyahDeliveryRecordSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().uuid(),
  channel: DeliveryChannelSchema,
  sourceType: DeliverySourceTypeSchema,
  sourceId: z.string().min(1),
  deliveryStatus: DeliveryStatusSchema,
  attemptCount: z.number().int().nonnegative(),
  lastError: z.string().nullable(),
  idempotencyKey: z.string().min(1),
  metadata: z.record(z.string(), z.unknown()),
  createdAtIso: z.string().datetime(),
  sentAtIso: z.string().datetime().nullable()
}) satisfies z.ZodType<DeliveryRecordShape>;
export type AaliyahDeliveryRecord = z.infer<typeof AaliyahDeliveryRecordSchema>;

export const DigestTypeSchema = z.enum([
  "daily_founder_digest",
  "weekly_founder_brief",
  "critical_digest"
]) satisfies z.ZodType<DigestType>;
export type DigestTypeRecord = z.infer<typeof DigestTypeSchema>;

export const DigestStatusSchema = z.enum([
  "composed",
  "sent",
  "skipped",
  "replayed"
]) satisfies z.ZodType<DigestStatus>;
export type DigestStatusRecord = z.infer<typeof DigestStatusSchema>;

export const AaliyahDigestRecordSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().uuid(),
  digestType: DigestTypeSchema,
  digestStatus: DigestStatusSchema,
  title: z.string().min(1),
  summary: z.string().min(1),
  bodyText: z.string().min(1),
  idempotencyKey: z.string().min(1),
  relatedNotificationIds: z.array(z.string().min(1)),
  relatedOpportunityIds: z.array(z.string().min(1)),
  relatedInsightIds: z.array(z.string().min(1)),
  relatedRecommendationIds: z.array(z.string().min(1)),
  relatedFollowThroughIds: z.array(z.string().min(1)),
  deliveryRecordIds: z.array(z.string().min(1)),
  auditEventId: z.string().min(1).nullable(),
  metadata: z.record(z.string(), z.unknown()),
  createdAtIso: z.string().datetime(),
  composedAtIso: z.string().datetime(),
  sentAtIso: z.string().datetime().nullable()
}) satisfies z.ZodType<DigestRecordShape>;
export type AaliyahDigestRecord = z.infer<typeof AaliyahDigestRecordSchema>;

export const OpportunityTypeSchema = z.enum([
  "dormant_contact",
  "stalled_pipeline",
  "missed_follow_up_window",
  "engagement_spike",
  "recurring_block_pattern",
  "noop"
]) satisfies z.ZodType<OpportunityType>;
export type OpportunityTypeRecord = z.infer<typeof OpportunityTypeSchema>;

export const OpportunityStatusSchema = z.enum([
  "active",
  "acknowledged",
  "converted",
  "dismissed",
  "noop"
]) satisfies z.ZodType<OpportunityStatus>;
export type OpportunityStatusRecord = z.infer<typeof OpportunityStatusSchema>;

export const OpportunitySourceTypeSchema = z.enum([
  "contact",
  "account",
  "task",
  "calendar_event",
  "follow_through_record",
  "recommendation",
  "founder_command"
]) satisfies z.ZodType<OpportunitySourceType>;
export type OpportunitySourceTypeRecord = z.infer<typeof OpportunitySourceTypeSchema>;

export const AaliyahOpportunityRecordSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().uuid(),
  source: z.object({
    sourceType: OpportunitySourceTypeSchema,
    sourceId: z.string().min(1)
  }),
  opportunityType: OpportunityTypeSchema,
  status: OpportunityStatusSchema,
  reason: z.string().min(1),
  summary: z.string().min(1),
  idempotencyKey: z.string().min(1),
  relatedTaskId: z.string().min(1).nullable(),
  relatedRecommendationId: z.string().min(1).nullable(),
  auditEventId: z.string().min(1).nullable(),
  metadata: z.record(z.string(), z.unknown()),
  createdAtIso: z.string().datetime(),
  evaluatedAtIso: z.string().datetime(),
  acknowledgedAtIso: z.string().datetime().nullable(),
  dismissedAtIso: z.string().datetime().nullable()
}) satisfies z.ZodType<OpportunityRecordShape>;
export type AaliyahOpportunityRecord = z.infer<typeof AaliyahOpportunityRecordSchema>;

export const StrategicInsightTypeSchema = z.enum([
  "attention_priority",
  "blocked_pattern",
  "follow_through_gap",
  "opportunity_cluster",
  "execution_bottleneck",
  "daily_brief",
  "weekly_brief",
  "noop"
]) satisfies z.ZodType<StrategicInsightType>;
export type StrategicInsightTypeRecord = z.infer<typeof StrategicInsightTypeSchema>;

export const StrategicInsightStatusSchema = z.enum([
  "active",
  "superseded",
  "acknowledged",
  "dismissed"
]) satisfies z.ZodType<StrategicInsightStatus>;
export type StrategicInsightStatusRecord = z.infer<typeof StrategicInsightStatusSchema>;

export const AaliyahStrategicInsightRecordSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().uuid(),
  insightType: StrategicInsightTypeSchema,
  status: StrategicInsightStatusSchema,
  title: z.string().min(1),
  summary: z.string().min(1),
  reason: z.string().min(1),
  idempotencyKey: z.string().min(1),
  relatedEntityIds: z.array(z.string().min(1)),
  relatedRecordIds: z.array(z.string().min(1)),
  auditEventId: z.string().min(1).nullable(),
  metadata: z.record(z.string(), z.unknown()),
  createdAtIso: z.string().datetime(),
  evaluatedAtIso: z.string().datetime(),
  acknowledgedAtIso: z.string().datetime().nullable(),
  dismissedAtIso: z.string().datetime().nullable()
}) satisfies z.ZodType<StrategicInsightRecordShape>;
export type AaliyahStrategicInsightRecord = z.infer<typeof AaliyahStrategicInsightRecordSchema>;

export const CoalescedSignalTypeSchema = z.enum([
  "blocked_execution_cluster",
  "follow_up_gap_cluster",
  "opportunity_cluster",
  "attention_cluster",
  "noop"
]) satisfies z.ZodType<CoalescedSignalType>;
export type CoalescedSignalTypeRecord = z.infer<typeof CoalescedSignalTypeSchema>;

export const CoalescedSignalStatusSchema = z.enum([
  "active",
  "acknowledged",
  "dismissed",
  "resolved"
]) satisfies z.ZodType<CoalescedSignalStatus>;
export type CoalescedSignalStatusRecord = z.infer<typeof CoalescedSignalStatusSchema>;

export const CoalescedSourceRecordTypeSchema = z.enum([
  "notification",
  "recommendation",
  "opportunity",
  "strategic_insight",
  "follow_through_record"
]) satisfies z.ZodType<CoalescedSourceRecordType>;
export type CoalescedSourceRecordTypeRecord = z.infer<typeof CoalescedSourceRecordTypeSchema>;

export const AaliyahCoalescedSignalRecordSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().uuid(),
  signalType: CoalescedSignalTypeSchema,
  status: CoalescedSignalStatusSchema,
  title: z.string().min(1),
  summary: z.string().min(1),
  reason: z.string().min(1),
  idempotencyKey: z.string().min(1),
  sourceRecordIds: z.array(z.string().min(1)),
  sourceRecordTypes: z.array(CoalescedSourceRecordTypeSchema),
  dominantSourceType: CoalescedSourceRecordTypeSchema,
  suppressedRecordIds: z.array(z.string().min(1)),
  auditEventId: z.string().min(1).nullable(),
  metadata: z.record(z.string(), z.unknown()),
  createdAtIso: z.string().datetime(),
  evaluatedAtIso: z.string().datetime(),
  acknowledgedAtIso: z.string().datetime().nullable(),
  dismissedAtIso: z.string().datetime().nullable()
}) satisfies z.ZodType<CoalescedSignalRecordShape>;
export type AaliyahCoalescedSignalRecord = z.infer<typeof AaliyahCoalescedSignalRecordSchema>;

export const EscalationTypeSchema = z.enum([
  "stale_critical_escalation",
  "blocked_pattern_escalation",
  "cluster_pressure_escalation",
  "missed_follow_up_escalation",
  "attention_overload_escalation",
  "noop"
]) satisfies z.ZodType<EscalationType>;
export type EscalationTypeRecord = z.infer<typeof EscalationTypeSchema>;

export const EscalationStatusSchema = z.enum([
  "active",
  "acknowledged",
  "dismissed",
  "resolved"
]) satisfies z.ZodType<EscalationStatus>;
export type EscalationStatusRecord = z.infer<typeof EscalationStatusSchema>;

export const EscalationLevelSchema = z.enum([
  "warning",
  "high",
  "critical"
]) satisfies z.ZodType<EscalationLevel>;
export type EscalationLevelRecord = z.infer<typeof EscalationLevelSchema>;

export const EscalationSourceRecordTypeSchema = z.enum([
  "notification",
  "recommendation",
  "opportunity",
  "strategic_insight",
  "coalesced_signal",
  "follow_through_record"
]) satisfies z.ZodType<EscalationSourceRecordType>;
export type EscalationSourceRecordTypeRecord = z.infer<typeof EscalationSourceRecordTypeSchema>;

export const AaliyahEscalationRecordSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().uuid(),
  escalationType: EscalationTypeSchema,
  status: EscalationStatusSchema,
  title: z.string().min(1),
  summary: z.string().min(1),
  reason: z.string().min(1),
  escalationLevel: EscalationLevelSchema,
  idempotencyKey: z.string().min(1),
  sourceRecordIds: z.array(z.string().min(1)),
  sourceRecordTypes: z.array(EscalationSourceRecordTypeSchema),
  relatedClusterId: z.string().min(1).nullable(),
  auditEventId: z.string().min(1).nullable(),
  metadata: z.record(z.string(), z.unknown()),
  createdAtIso: z.string().datetime(),
  evaluatedAtIso: z.string().datetime(),
  acknowledgedAtIso: z.string().datetime().nullable(),
  dismissedAtIso: z.string().datetime().nullable(),
  resolvedAtIso: z.string().datetime().nullable()
}) satisfies z.ZodType<EscalationRecordShape>;
export type AaliyahEscalationRecord = z.infer<typeof AaliyahEscalationRecordSchema>;

export const OperatorQueueSourceTypeSchema = z.enum([
  "escalation",
  "coalesced_signal",
  "strategic_insight",
  "notification",
  "recommendation",
  "opportunity"
]) satisfies z.ZodType<OperatorQueueSourceType>;
export type OperatorQueueSourceTypeRecord = z.infer<typeof OperatorQueueSourceTypeSchema>;

export const OperatorQueueItemTypeSchema = z.enum([
  "immediate_action",
  "review_required",
  "watch_item",
  "summary_item"
]) satisfies z.ZodType<OperatorQueueItemType>;
export type OperatorQueueItemTypeRecord = z.infer<typeof OperatorQueueItemTypeSchema>;

export const OperatorQueuePriorityBandSchema = z.enum([
  "critical",
  "high",
  "normal"
]) satisfies z.ZodType<OperatorQueuePriorityBand>;
export type OperatorQueuePriorityBandRecord = z.infer<typeof OperatorQueuePriorityBandSchema>;

export const OperatorQueueStatusSchema = z.enum([
  "active",
  "suppressed",
  "executed",
  "invalidated",
  "superseded"
]) satisfies z.ZodType<OperatorQueueStatus>;
export type OperatorQueueStatusRecord = z.infer<typeof OperatorQueueStatusSchema>;

export const OperatorQueueActionableCommandTypeSchema = z.enum([
  "approve_draft",
  "create_follow_up",
  "escalate_task",
  "override_schedule",
  "trigger_workflow"
]) satisfies z.ZodType<OperatorQueueActionableCommandType>;
export type OperatorQueueActionableCommandTypeRecord = z.infer<typeof OperatorQueueActionableCommandTypeSchema>;

export const OperatorQueueActionableTargetTypeSchema = z.enum([
  "gmail_draft",
  "task",
  "calendar_event",
  "contact",
  "account",
  "workflow"
]) satisfies z.ZodType<OperatorQueueActionableTargetType>;
export type OperatorQueueActionableTargetTypeRecord = z.infer<typeof OperatorQueueActionableTargetTypeSchema>;

export const AaliyahOperatorQueueRecordSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().uuid(),
  sourceType: OperatorQueueSourceTypeSchema,
  sourceId: z.string().min(1),
  queueItemType: OperatorQueueItemTypeSchema,
  priorityScore: z.number().int(),
  priorityBand: OperatorQueuePriorityBandSchema,
  status: OperatorQueueStatusSchema,
  rankingVersion: z.number().int(),
  staleAfterAtIso: z.string().datetime(),
  canonicalIssueKey: z.string().min(1).nullable(),
  supersededByQueueItemId: z.string().min(1).nullable(),
  title: z.string().min(1),
  summary: z.string().min(1),
  reason: z.string().min(1),
  idempotencyKey: z.string().min(1),
  relatedRecordIds: z.array(z.string().min(1)),
  relatedRecordTypes: z.array(z.string().min(1)),
  actionableCommandType: OperatorQueueActionableCommandTypeSchema.nullable(),
  actionableTargetType: OperatorQueueActionableTargetTypeSchema.nullable(),
  actionableTargetId: z.string().min(1).nullable(),
  auditEventId: z.string().min(1).nullable(),
  metadata: z.record(z.string(), z.unknown()),
  createdAtIso: z.string().datetime(),
  evaluatedAtIso: z.string().datetime(),
  lastRefreshedAtIso: z.string().datetime().nullable(),
  lastExecutedAtIso: z.string().datetime().nullable(),
  issueState: z.enum(["open", "in_progress", "resolved", "unresolved", "reopened", "dismissed"]).nullable(),
  lastOutcomeType: z.enum([
    "issue_resolved",
    "issue_unresolved",
    "issue_reopened",
    "opportunity_converted",
    "opportunity_lost",
    "recommendation_accepted",
    "recommendation_rejected",
    "escalation_cleared",
    "escalation_persisting",
    "action_failed_downstream",
    "action_deferred"
  ]).nullable(),
  lastOutcomeStatus: z.enum(["confirmed", "partial", "rejected", "needs_follow_through"]).nullable(),
  lastOutcomeAtIso: z.string().datetime().nullable()
}) satisfies z.ZodType<OperatorQueueRecordShape>;
export type AaliyahOperatorQueueRecord = z.infer<typeof AaliyahOperatorQueueRecordSchema>;

export const OperatorActionExecutionStatusSchema = z.enum([
  "success",
  "failure",
  "invalidated",
  "already_executed",
  "superseded",
  "not_actionable"
]) satisfies z.ZodType<OperatorActionExecutionStatus>;
export type OperatorActionExecutionStatusRecord = z.infer<typeof OperatorActionExecutionStatusSchema>;

export const OperatorActionFailureCodeSchema = z.enum([
  "QUEUE_ITEM_NOT_FOUND",
  "QUEUE_ITEM_STALE",
  "QUEUE_ITEM_INVALIDATED",
  "QUEUE_ITEM_SUPERSEDED",
  "QUEUE_ITEM_ALREADY_EXECUTED",
  "SOURCE_NOT_FOUND",
  "SOURCE_NOT_ACTIONABLE",
  "ACTION_PATH_UNRESOLVABLE",
  "FOUNDER_PERMISSION_DENIED"
]) satisfies z.ZodType<OperatorActionFailureCode>;
export type OperatorActionFailureCodeRecord = z.infer<typeof OperatorActionFailureCodeSchema>;

export const AaliyahOperatorActionLogRecordSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().uuid(),
  queueItemId: z.string().min(1),
  queueItemVersion: z.number().int(),
  canonicalIssueKey: z.string().min(1).nullable(),
  actionPath: z.string().min(1),
  commandId: z.string().min(1).nullable(),
  founderActorId: z.string().min(1),
  idempotencyKey: z.string().min(1),
  executionStatus: OperatorActionExecutionStatusSchema,
  failureCode: OperatorActionFailureCodeSchema.nullable(),
  failureReason: z.string().min(1).nullable(),
  executedAtIso: z.string().datetime(),
  createdAtIso: z.string().datetime()
}) satisfies z.ZodType<OperatorActionLogRecordShape>;
export type AaliyahOperatorActionLogRecord = z.infer<typeof AaliyahOperatorActionLogRecordSchema>;

export const OutcomeFeedbackTypeSchema = z.enum([
  "issue_resolved",
  "issue_unresolved",
  "issue_reopened",
  "opportunity_converted",
  "opportunity_lost",
  "recommendation_accepted",
  "recommendation_rejected",
  "escalation_cleared",
  "escalation_persisting",
  "action_failed_downstream",
  "action_deferred"
]) satisfies z.ZodType<OutcomeFeedbackType>;
export type OutcomeFeedbackTypeRecord = z.infer<typeof OutcomeFeedbackTypeSchema>;

export const OutcomeFeedbackStatusSchema = z.enum([
  "confirmed",
  "partial",
  "rejected",
  "needs_follow_through"
]) satisfies z.ZodType<OutcomeFeedbackStatus>;
export type OutcomeFeedbackStatusRecord = z.infer<typeof OutcomeFeedbackStatusSchema>;

export const CanonicalIssueStateSchema = z.enum([
  "open",
  "in_progress",
  "resolved",
  "unresolved",
  "reopened",
  "dismissed"
]) satisfies z.ZodType<CanonicalIssueState>;
export type CanonicalIssueStateRecord = z.infer<typeof CanonicalIssueStateSchema>;

export const AaliyahOutcomeFeedbackRecordSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().uuid(),
  queueItemId: z.string().min(1),
  operatorActionLogId: z.string().min(1).nullable(),
  commandId: z.string().min(1).nullable(),
  canonicalIssueKey: z.string().min(1),
  sourceType: OperatorQueueSourceTypeSchema,
  sourceId: z.string().min(1),
  outcomeType: OutcomeFeedbackTypeSchema,
  outcomeStatus: OutcomeFeedbackStatusSchema,
  reasonCode: z.string().min(1).nullable(),
  notes: z.string().min(1).nullable(),
  reportedByFounderActorId: z.string().min(1),
  reportedAtIso: z.string().datetime(),
  auditEventId: z.string().min(1).nullable(),
  metadata: z.record(z.string(), z.unknown()),
  idempotencyKey: z.string().min(1),
  createdAtIso: z.string().datetime()
}) satisfies z.ZodType<OutcomeFeedbackRecordShape>;
export type AaliyahOutcomeFeedbackRecord = z.infer<typeof AaliyahOutcomeFeedbackRecordSchema>;

export const AaliyahIssueStateRecordSchema = z.object({
  tenantId: z.string().uuid(),
  canonicalIssueKey: z.string().min(1),
  currentState: CanonicalIssueStateSchema,
  lastOutcomeType: OutcomeFeedbackTypeSchema.nullable(),
  lastOutcomeStatus: OutcomeFeedbackStatusSchema.nullable(),
  lastQueueItemId: z.string().min(1).nullable(),
  lastOperatorActionLogId: z.string().min(1).nullable(),
  lastCommandId: z.string().min(1).nullable(),
  lastUpdatedAtIso: z.string().datetime(),
  lastOutcomeAtIso: z.string().datetime().nullable(),
  reopenCount: z.number().int().nonnegative(),
  resolutionCount: z.number().int().nonnegative(),
  metadata: z.object({
    lastReasonCode: z.string().min(1).nullable(),
    wasRecentlyRejected: z.boolean(),
    wasRecentlyResolved: z.boolean(),
    hasRepeatedFailure: z.boolean()
  })
}) satisfies z.ZodType<IssueStateRecordShape>;
export type AaliyahIssueStateRecord = z.infer<typeof AaliyahIssueStateRecordSchema>;

export const ScheduledEngineTypeSchema = z.enum([
  "follow_through",
  "recommendation",
  "notification",
  "opportunity",
  "strategic_intelligence"
]) satisfies z.ZodType<ScheduledEngineType>;
export type ScheduledEngineTypeRecord = z.infer<typeof ScheduledEngineTypeSchema>;

export const EvaluationScheduleStatusSchema = z.enum([
  "active",
  "paused"
]) satisfies z.ZodType<EvaluationScheduleStatus>;
export type EvaluationScheduleStatusRecord = z.infer<typeof EvaluationScheduleStatusSchema>;

export const EvaluationCadenceTypeSchema = z.enum([
  "manual",
  "hourly",
  "daily",
  "weekly"
]) satisfies z.ZodType<EvaluationCadenceType>;
export type EvaluationCadenceTypeRecord = z.infer<typeof EvaluationCadenceTypeSchema>;

export const AaliyahEvaluationScheduleRecordSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().uuid(),
  engineType: ScheduledEngineTypeSchema,
  status: EvaluationScheduleStatusSchema,
  cadenceType: EvaluationCadenceTypeSchema,
  cadenceValue: z.string().min(1).nullable(),
  lastRunAtIso: z.string().datetime().nullable(),
  nextRunAtIso: z.string().datetime().nullable(),
  idempotencyKey: z.string().min(1),
  metadata: z.record(z.string(), z.unknown()),
  createdAtIso: z.string().datetime(),
  updatedAtIso: z.string().datetime()
}) satisfies z.ZodType<EvaluationScheduleRecordShape>;
export type AaliyahEvaluationScheduleRecord = z.infer<typeof AaliyahEvaluationScheduleRecordSchema>;

export const EvaluationRunStatusSchema = z.enum([
  "started",
  "completed",
  "failed",
  "replayed"
]) satisfies z.ZodType<EvaluationRunStatus>;
export type EvaluationRunStatusRecord = z.infer<typeof EvaluationRunStatusSchema>;

export const AaliyahEvaluationRunRecordSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().uuid(),
  scheduleId: z.string().min(1),
  engineType: ScheduledEngineTypeSchema,
  runStatus: EvaluationRunStatusSchema,
  windowKey: z.string().min(1),
  summary: z.string().min(1),
  auditEventId: z.string().min(1).nullable(),
  metadata: z.record(z.string(), z.unknown()),
  startedAtIso: z.string().datetime(),
  completedAtIso: z.string().datetime().nullable()
}) satisfies z.ZodType<EvaluationRunRecordShape>;
export type AaliyahEvaluationRunRecord = z.infer<typeof AaliyahEvaluationRunRecordSchema>;


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

export const FounderNotificationPreferencesSchema = z.object({
  minimumConsoleSeverity: z.enum(["info", "warning", "critical"]),
  minimumEmailSeverity: z.enum(["warning", "critical"]),
  autoDismissInfoAfterHours: z.number().int().positive().nullable()
}) satisfies z.ZodType<FounderNotificationPreferences>;
export type { FounderNotificationPreferences };

export const FounderDigestPreferencesSchema = z.object({
  dailyDigestEnabled: z.boolean(),
  weeklyBriefEnabled: z.boolean(),
  criticalDigestEnabled: z.boolean(),
  sendEmptyDigests: z.boolean()
}) satisfies z.ZodType<FounderDigestPreferences>;
export type { FounderDigestPreferences };

export const FounderOpportunityPreferencesSchema = z.object({
  dormantContactDays: z.number().int().positive(),
  missedFollowUpWindowHours: z.number().int().positive(),
  recurringBlockThreshold: z.number().int().positive(),
  engagementSpikeMinimumEvents: z.number().int().positive()
}) satisfies z.ZodType<FounderOpportunityPreferences>;
export type { FounderOpportunityPreferences };

export const FounderRecommendationPreferencesSchema = z.object({
  escalateHighPriorityOnly: z.boolean(),
  reviveContactRequiresPriorValue: z.boolean()
}) satisfies z.ZodType<FounderRecommendationPreferences>;
export type { FounderRecommendationPreferences };

export const FounderSchedulerPreferencesSchema = z.object({
  allowAutomaticRuns: z.boolean(),
  defaultDailyRunHourUtc: z.number().int().min(0).max(23).nullable()
}) satisfies z.ZodType<FounderSchedulerPreferences>;
export type { FounderSchedulerPreferences };

export const FounderDeliveryPreferencesSchema = z.object({
  emailEnabled: z.boolean(),
  consoleEnabled: z.boolean()
}) satisfies z.ZodType<FounderDeliveryPreferences>;
export type { FounderDeliveryPreferences };

export const FounderEscalationPreferencesSchema = z.object({
  criticalEscalationHours: z.number().int().positive(),
  blockedPatternEscalationCount: z.number().int().positive(),
  clusterPressureThreshold: z.number().int().positive(),
  missedFollowUpEscalationHours: z.number().int().positive(),
  attentionOverloadThreshold: z.number().int().positive()
}) satisfies z.ZodType<FounderEscalationPreferences>;
export type { FounderEscalationPreferences };

export const AaliyahFounderPreferenceControlsRecordSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().uuid(),
  actorUserId: z.string().min(1),
  notification: FounderNotificationPreferencesSchema,
  digest: FounderDigestPreferencesSchema,
  opportunity: FounderOpportunityPreferencesSchema,
  recommendation: FounderRecommendationPreferencesSchema,
  scheduler: FounderSchedulerPreferencesSchema,
  delivery: FounderDeliveryPreferencesSchema,
  escalation: FounderEscalationPreferencesSchema,
  createdAtIso: z.string().datetime(),
  updatedAtIso: z.string().datetime()
}) satisfies z.ZodType<FounderPreferencesRecordShape>;
export type AaliyahFounderPreferenceControlsRecord = z.infer<typeof AaliyahFounderPreferenceControlsRecordSchema>;

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
  version: z.number().int().positive(),
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

export const AaliyahMutationOperationSchema = z.enum([
  "session_reset",
  "follow_through_action",
  "email_review_transition",
  "email_dispatch"
]) satisfies z.ZodType<AaliyahMutationOperation>;
export type AaliyahMutationOperationRecord = z.infer<typeof AaliyahMutationOperationSchema>;

export const AaliyahMutationIdempotencyStateSchema = z.enum([
  "in_progress",
  "completed",
  "failed"
]) satisfies z.ZodType<AaliyahMutationIdempotencyState>;
export type AaliyahMutationIdempotencyStateRecord = z.infer<typeof AaliyahMutationIdempotencyStateSchema>;

export const AaliyahMutationIdempotencyRecordSchema = z.object({
  tenantId: z.string().uuid(),
  actorId: z.string().min(1),
  principalContext: z.enum(["founder", "operator"]),
  operationName: AaliyahMutationOperationSchema,
  idempotencyKey: z.string().min(1),
  requestFingerprint: z.string().min(1),
  state: AaliyahMutationIdempotencyStateSchema,
  responsePayload: z.record(z.string(), z.unknown()).nullable(),
  errorCode: z.string().min(1).nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable()
}) satisfies z.ZodType<AaliyahMutationIdempotencyRecordShape>;
export type AaliyahMutationIdempotencyRecord = z.infer<typeof AaliyahMutationIdempotencyRecordSchema>;

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
  "follow_through_invalid_action",
  "workspace_draft_requested",
  "workspace_draft_denied",
  "workspace_draft_created",
  "workspace_draft_failed",
  "workspace_calendar_availability_requested",
  "workspace_calendar_availability_denied",
  "workspace_calendar_availability_failed",
  "workspace_calendar_availability_resolved",
  "workspace_calendar_event_requested",
  "workspace_calendar_event_denied",
  "workspace_calendar_event_created",
  "workspace_calendar_event_failed",
  "crm_contact_created",
  "crm_contact_updated",
  "crm_account_created",
  "crm_account_updated",
  "crm_note_created",
  "crm_context_requested",
  "crm_denied",
  "crm_failed",
  "tasks_created",
  "tasks_updated",
  "tasks_completed",
  "tasks_blocked",
  "tasks_requested",
  "tasks_list_requested",
  "tasks_denied",
  "tasks_failed",
  "founder_command_executed",
  "founder_command_rejected",
  "founder_command_noop",
  "follow_through_engine_executed",
  "follow_through_engine_blocked",
  "follow_through_engine_stale",
  "follow_through_engine_noop",
  "recommendation_engine_created",
  "recommendation_engine_replayed",
  "recommendation_engine_noop",
  "notification_engine_created",
  "notification_engine_replayed",
  "notification_engine_acknowledged",
  "notification_engine_dismissed",
  "notification_engine_noop",
  "opportunity_engine_created",
  "opportunity_engine_replayed",
  "opportunity_engine_acknowledged",
  "opportunity_engine_dismissed",
  "opportunity_engine_noop",
  "strategic_intelligence_created",
  "strategic_intelligence_replayed",
  "strategic_intelligence_acknowledged",
  "strategic_intelligence_dismissed",
  "strategic_intelligence_noop",
  "signal_coalescing_created",
  "signal_coalescing_replayed",
  "signal_coalescing_acknowledged",
  "signal_coalescing_dismissed",
  "signal_coalescing_noop",
  "evaluation_schedule_created",
  "evaluation_schedule_updated",
  "evaluation_schedule_paused",
  "evaluation_schedule_resumed",
  "evaluation_run_started",
  "evaluation_run_completed",
  "evaluation_run_failed",
  "evaluation_run_replayed",
  "delivery_router_sent",
  "delivery_router_failed",
  "delivery_router_replayed",
  "founder_preferences_updated",
  "founder_preferences_resolved",
  "digest_composer_composed",
  "digest_composer_sent",
  "digest_composer_replayed",
  "digest_composer_skipped",
  "escalation_engine_created",
  "escalation_engine_replayed",
  "escalation_engine_acknowledged",
  "escalation_engine_dismissed",
  "escalation_engine_resolved",
  "escalation_engine_noop",
  "operator_queue_created",
  "operator_queue_replayed",
  "operator_queue_noop",
  "operator_queue_refreshed",
  "operator_queue_invalidated",
  "operator_queue_suppressed",
  "operator_action_executed",
  "operator_action_failed",
  "operator_action_replayed",
  "outcome_feedback_recorded",
  "outcome_feedback_replayed",
  "outcome_feedback_rejected"
]) satisfies z.ZodType<AaliyahDiagnosticsEventType>;
export type AaliyahDiagnosticsEventTypeRecord = z.infer<typeof AaliyahDiagnosticsEventTypeSchema>;

export const AaliyahDiagnosticsEventSchema = z.object({
  tenantId: z.string().uuid(),
  eventId: z.string().min(1),
  actorId: z.string().min(1),
  principalContext: z.enum(["founder", "operator"]),
  activeMode: z.enum(["founder", "zbestmedia"]),
  eventType: AaliyahDiagnosticsEventTypeSchema,
  eventSource: z.enum(["aaliyah_runtime", "aaliyah_session", "aaliyah_follow_through", "aaliyah_workspace"]),
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
