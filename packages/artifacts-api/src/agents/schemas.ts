import { z } from "zod";

import {
  AGENT_ORG_MANIFEST_VERSION,
  AgentLifecycleStatusSchema,
  AgentTaskDomainSchema,
  AssignmentRecordSchema,
  AaliyahCrmAccountSchema,
  AaliyahCrmContactSchema,
  AaliyahDeliveryRecordSchema,
  AaliyahDigestRecordSchema,
  AaliyahFollowThroughEngineRecordSchema,
  AaliyahNotificationRecordSchema,
  AaliyahOpportunityRecordSchema,
  AaliyahRecommendationRecordSchema,
  AaliyahStrategicInsightRecordSchema,
  AaliyahEvaluationRunRecordSchema,
  AaliyahEvaluationScheduleRecordSchema,
  AaliyahCrmNoteSchema,
  AaliyahFounderCommandRecordSchema,
  AaliyahFounderPreferenceControlsRecordSchema,
  AaliyahCoalescedSignalRecordSchema,
  AaliyahTaskSchema,
  AaliyahFounderPreferenceRecordSchema,
  EmailAccountConnectionRecordSchema,
  EmailDispatchRecordSchema,
  EmailDraftReviewRecordSchema,
  AaliyahPreferenceCategorySchema,
  AaliyahPreferenceConfidenceLevelSchema,
  AaliyahPreferenceScopeSchema,
  AaliyahPreferenceValueSchema,
  VoiceCallRecordSchema,
  IncidentRecordSchema,
  IncidentSeveritySchema,
  IncidentStatusSchema,
  IncidentTypeSchema,
  ExecutionRunRecordSchema,
  RoutingDecisionSchema
} from "@zbest/agent-os";

const AgentIdSchema = z.enum(["brandyn", "jordyn", "kobe", "oracle", "titan", "maestro"]);
const BrandPipelineStepSchema = z.enum([
  "brandyn_direction_approved",
  "jordyn_visual_alignment_approved",
  "kobe_distribution_queued",
  "oracle_performance_evaluated",
  "titan_monetization_feedback_recorded"
]);

export const AgentIdParamSchema = z.object({
  agentId: AgentIdSchema
});

export const ProvisionFoundationBodySchema = z.object({
  versionLabel: z.string().min(1).default("foundation-v1")
});

export const ExecuteAgentBodySchema = z.object({
  subjectType: z.string().min(1),
  subjectId: z.string().min(1),
  payload: z.record(z.string(), z.unknown()),
  queueForWorker: z.boolean().optional().default(false)
});

export const LifecycleTransitionBodySchema = z.object({
  toStatus: AgentLifecycleStatusSchema,
  reason: z.string().min(1),
  metricsSnapshot: z.record(z.string(), z.unknown()).optional(),
  metadata: z.record(z.string(), z.unknown()).optional()
});

export const EvalRunBodySchema = z.object({
  suiteName: z.string().min(1),
  observations: z.array(
    z.object({
      metric: z.string().min(1),
      score: z.number(),
      metadata: z.record(z.string(), z.unknown()).optional()
    })
  ).min(1)
});

export const MemoryQuerySchema = z.object({
  collection: z.string().min(1).optional()
});

export const MemoryWriteBodySchema = z.object({
  collection: z.string().min(1),
  entryKey: z.string().min(1),
  entryValue: z.record(z.string(), z.unknown()),
  sharedPolicy: z.boolean().optional().default(false)
});

export const ApprovalDecisionBodySchema = z.object({
  decision: z.enum(["APPROVE", "REJECT"]),
  rationale: z.string().min(1),
  payload: z.record(z.string(), z.unknown()).optional()
});

export const ApprovalListQuerySchema = z.object({
  agentId: AgentIdSchema.optional(),
  status: z.enum(["PENDING", "APPROVED", "REJECTED"]).optional()
});

export const ApprovalRequestIdParamSchema = z.object({
  approvalRequestId: z.string().min(1)
});

export const ExecutionIdParamSchema = z.object({
  executionId: z.string().min(1)
});

export const ExecutionListQuerySchema = z.object({
  agentId: AgentIdSchema.optional(),
  status: z.enum(["QUEUED", "PENDING_APPROVAL", "RUNNING", "COMPLETED", "FAILED"]).optional()
});

export const AssignmentRecordIdParamSchema = z.object({
  recordId: z.string().min(1)
});

export const ExecutionRunIdParamSchema = z.object({
  runId: z.string().min(1)
});

export const AssignmentRecordListQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).default(25)
});

export const ExecutionRunListQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).default(25),
  currentState: z
    .enum(["requested", "validated", "routed", "blocked", "executing", "retriable", "succeeded", "failed"])
    .optional()
});

export const AgentVersionCreateBodySchema = z.object({
  versionLabel: z.string().min(1),
  definitionSnapshot: z.record(z.string(), z.unknown())
});

export const AgentVersionPromoteBodySchema = z.object({
  agentVersionId: z.string().min(1),
  reason: z.string().min(1)
});

export const WorkerClaimExecutionsBodySchema = z.object({
  agentId: AgentIdSchema.optional(),
  limit: z.number().int().positive().max(50).default(10)
});

export const WorkerQueueEvalBodySchema = z.object({
  agentId: AgentIdSchema,
  suiteName: z.string().min(1)
});

export const WorkerClaimEvalsBodySchema = z.object({
  agentId: AgentIdSchema.optional(),
  limit: z.number().int().positive().max(50).default(10)
});

export const EmailAccountIdParamSchema = z.object({
  accountId: z.string().min(1)
});

export const EmailAccountThreadIdParamSchema = z.object({
  accountId: z.string().min(1),
  threadId: z.string().min(1)
});

export const EmailAccountListQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).default(25)
});

export const GmailOauthStartBodySchema = z.object({
  principalId: z.string().min(1),
  accountEmailAddress: z.string().email().optional(),
  processingEnabled: z.boolean().optional(),
  maxBatchThreads: z.number().int().positive().max(100).optional(),
  allowedLabelIds: z.array(z.string().min(1)).optional()
});

export const GmailOauthCallbackBodySchema = z.object({
  state: z.string().min(1),
  code: z.string().min(1)
});

export const EmailAccountProcessBodySchema = z.object({
  maxThreads: z.number().int().positive().max(100).optional()
});

export const VoiceCallIdParamSchema = z.object({
  callId: z.string().min(1)
});

export const VoiceEscalationListQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).default(25)
});

export const VoiceIntakeBodySchema = z.object({
  externalCallId: z.string().min(1).optional().nullable(),
  sourceSystem: z.string().min(1),
  receivedAt: z.string().datetime().optional(),
  caller: z.object({
    phoneNumber: z.string().min(1),
    displayName: z.string().min(1).optional().nullable(),
    organizationName: z.string().min(1).optional().nullable()
  }),
  transcript: z.string().min(1),
  callSummary: z.string().min(1).optional().nullable(),
  durationSeconds: z.number().int().nonnegative().optional().nullable()
});


export const EmailReviewItemIdParamSchema = z.object({
  reviewItemId: z.string().min(1)
});

export const EmailReviewListQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).default(25),
  accountId: z.string().min(1).optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
  status: z.enum(["pending_review", "approved", "rejected", "revision_requested"]).optional()
});

export const EmailReviewActionBodySchema = z.object({
  note: z.string().min(1).optional()
});

const EmailDraftReviewListResponseSchemaItem = EmailDraftReviewRecordSchema;

export const EmailReviewListResponseSchema = z.object({
  resourceType: z.literal("email_review_list"),
  items: z.array(EmailDraftReviewListResponseSchemaItem)
});

export const EmailReviewDetailResponseSchema = z.object({
  resourceType: z.literal("email_review_detail"),
  item: EmailDraftReviewRecordSchema
});

export const EmailReviewActionResponseSchema = z.object({
  resourceType: z.literal("email_review_action"),
  action: z.enum(["approve", "reject", "request_revision"]),
  item: EmailDraftReviewRecordSchema
});

export const EmailDispatchIdParamSchema = z.object({
  dispatchId: z.string().min(1)
});

export const EmailDispatchRequestBodySchema = z.object({}).strict();

export const EmailDispatchResultResponseSchema = z.object({
  resourceType: z.literal("email_dispatch_result"),
  sent: z.boolean(),
  dispatch: EmailDispatchRecordSchema
});

export const EmailDispatchDetailResponseSchema = z.object({
  resourceType: z.literal("email_dispatch_detail"),
  dispatch: EmailDispatchRecordSchema
});

export const AaliyahWorkspaceGmailDraftBodySchema = z.object({
  mode: z.enum(["founder", "zbestmedia"]),
  to: z.array(z.string().email()).min(1),
  cc: z.array(z.string().email()).optional(),
  bcc: z.array(z.string().email()).optional(),
  subject: z.string().min(1),
  bodyText: z.string().min(1),
  bodyHtml: z.string().min(1).optional(),
  threadId: z.string().min(1).optional(),
  dryRun: z.boolean().optional()
});

const AaliyahWorkspaceGmailDraftSuccessSchema = z.object({
  ok: z.literal(true),
  provider: z.literal("gmail"),
  draftId: z.string().min(1),
  externalId: z.string().min(1).nullable(),
  dryRun: z.boolean(),
  message: z.string().min(1)
});

const AaliyahWorkspaceGmailDraftFailureSchema = z.object({
  ok: z.literal(false),
  provider: z.literal("gmail"),
  dryRun: z.boolean(),
  denialCode: z.enum(["ACCESS_DENIED", "INVALID_MODE", "PROVIDER_DISABLED"]).nullable(),
  errorCode: z.enum(["INVALID_INPUT", "PROVIDER_UNAVAILABLE", "PROVIDER_REJECTED", "INTERNAL_ERROR"]).nullable(),
  retryable: z.boolean(),
  message: z.string().min(1)
});

export const AaliyahWorkspaceGmailDraftResponseSchema = z.object({
  manifestVersion: z.literal(AGENT_ORG_MANIFEST_VERSION),
  resourceType: z.literal("aaliyah_workspace_gmail_draft_result"),
  result: z.discriminatedUnion("ok", [
    AaliyahWorkspaceGmailDraftSuccessSchema,
    AaliyahWorkspaceGmailDraftFailureSchema
  ])
});

export const AaliyahCalendarAvailabilityBodySchema = z.object({
  mode: z.enum(["founder", "zbestmedia"]),
  startIso: z.string().datetime(),
  endIso: z.string().datetime(),
  timezone: z.string().min(1),
  durationMinutes: z.number().int().positive().optional(),
  dryRun: z.boolean().optional()
});

const AaliyahCalendarSlotSchema = z.object({
  startIso: z.string().datetime(),
  endIso: z.string().datetime()
});

const AaliyahCalendarAvailabilitySuccessSchema = z.object({
  ok: z.literal(true),
  provider: z.literal("google_calendar"),
  dryRun: z.boolean(),
  slots: z.array(AaliyahCalendarSlotSchema),
  message: z.string().min(1)
});

const AaliyahCalendarAvailabilityFailureSchema = z.object({
  ok: z.literal(false),
  provider: z.literal("google_calendar"),
  dryRun: z.boolean(),
  denialCode: z.enum(["ACCESS_DENIED", "INVALID_MODE", "PROVIDER_DISABLED"]).nullable(),
  errorCode: z.enum(["INVALID_INPUT", "PROVIDER_UNAVAILABLE", "PROVIDER_REJECTED", "INTERNAL_ERROR"]).nullable(),
  retryable: z.boolean(),
  message: z.string().min(1)
});

export const AaliyahCalendarAvailabilityResponseSchema = z.object({
  manifestVersion: z.literal(AGENT_ORG_MANIFEST_VERSION),
  resourceType: z.literal("aaliyah_workspace_calendar_availability_result"),
  result: z.discriminatedUnion("ok", [
    AaliyahCalendarAvailabilitySuccessSchema,
    AaliyahCalendarAvailabilityFailureSchema
  ])
});

export const AaliyahCalendarEventBodySchema = z.object({
  mode: z.enum(["founder", "zbestmedia"]),
  title: z.string().min(1),
  description: z.string().min(1).optional(),
  location: z.string().min(1).optional(),
  startIso: z.string().datetime(),
  endIso: z.string().datetime(),
  timezone: z.string().min(1),
  attendees: z.array(z.string().email()).optional(),
  dryRun: z.boolean().optional()
});

const AaliyahCalendarEventSuccessSchema = z.object({
  ok: z.literal(true),
  provider: z.literal("google_calendar"),
  dryRun: z.boolean(),
  eventId: z.string().min(1),
  externalId: z.string().min(1).nullable(),
  message: z.string().min(1)
});

const AaliyahCalendarEventFailureSchema = z.object({
  ok: z.literal(false),
  provider: z.literal("google_calendar"),
  dryRun: z.boolean(),
  denialCode: z.enum(["ACCESS_DENIED", "INVALID_MODE", "PROVIDER_DISABLED"]).nullable(),
  errorCode: z.enum(["INVALID_INPUT", "PROVIDER_UNAVAILABLE", "PROVIDER_REJECTED", "INTERNAL_ERROR"]).nullable(),
  retryable: z.boolean(),
  message: z.string().min(1)
});

export const AaliyahCalendarEventResponseSchema = z.object({
  manifestVersion: z.literal(AGENT_ORG_MANIFEST_VERSION),
  resourceType: z.literal("aaliyah_workspace_calendar_event_result"),
  result: z.discriminatedUnion("ok", [
    AaliyahCalendarEventSuccessSchema,
    AaliyahCalendarEventFailureSchema
  ])
});

export const AaliyahCrmContactCreateBodySchema = z.object({
  mode: z.enum(["founder", "zbestmedia"]),
  email: z.string().email(),
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  accountId: z.string().min(1).optional(),
  roleTitle: z.string().min(1).optional(),
  phone: z.string().min(1).optional(),
  status: z.enum(["lead", "active", "inactive", "blocked"]).optional(),
  relationshipStage: z.enum(["new", "contacted", "qualified", "proposal", "client", "follow_up", "dormant"]).optional(),
  lastTouchedAt: z.string().datetime().optional(),
  nextActionAt: z.string().datetime().optional(),
  notesSummary: z.string().min(1).optional()
});

export const AaliyahCrmAccountCreateBodySchema = z.object({
  mode: z.enum(["founder", "zbestmedia"]),
  name: z.string().min(1),
  website: z.string().min(1).optional(),
  industry: z.string().min(1).optional(),
  status: z.enum(["active", "inactive"]).optional(),
  notesSummary: z.string().min(1).optional()
});

export const AaliyahCrmNoteCreateBodySchema = z.object({
  mode: z.enum(["founder", "zbestmedia"]),
  contactId: z.string().min(1).optional(),
  accountId: z.string().min(1).optional(),
  note: z.string().min(1)
});

export const AaliyahCrmContactIdParamSchema = z.object({
  contactId: z.string().min(1)
});

export const AaliyahCrmAccountIdParamSchema = z.object({
  accountId: z.string().min(1)
});

export const AaliyahCrmContactByEmailQuerySchema = z.object({
  mode: z.enum(["founder", "zbestmedia"]).default("founder"),
  email: z.string().email()
});

const AaliyahCrmFailureSchema = z.object({
  ok: z.literal(false),
  denialCode: z.enum(["ACCESS_DENIED", "INVALID_MODE"]).nullable(),
  errorCode: z.enum(["INVALID_INPUT", "NOT_FOUND", "CONFLICT", "INTERNAL_ERROR"]).nullable(),
  retryable: z.boolean(),
  message: z.string().min(1)
});

const AaliyahCrmContactSuccessSchema = z.object({
  ok: z.literal(true),
  contact: AaliyahCrmContactSchema,
  message: z.string().min(1)
});

const AaliyahCrmAccountSuccessSchema = z.object({
  ok: z.literal(true),
  account: AaliyahCrmAccountSchema,
  message: z.string().min(1)
});

const AaliyahCrmNoteSuccessSchema = z.object({
  ok: z.literal(true),
  note: AaliyahCrmNoteSchema,
  message: z.string().min(1)
});

const AaliyahCrmContextSummarySchema = z.object({
  contact: AaliyahCrmContactSchema.nullable(),
  account: AaliyahCrmAccountSchema.nullable(),
  recentNotes: z.array(AaliyahCrmNoteSchema),
  summary: z.string()
});

const AaliyahCrmContextSuccessSchema = z.object({
  ok: z.literal(true),
  context: AaliyahCrmContextSummarySchema,
  message: z.string().min(1)
});

export const AaliyahCrmContactResponseSchema = z.object({
  manifestVersion: z.literal(AGENT_ORG_MANIFEST_VERSION),
  resourceType: z.literal("aaliyah_crm_contact_result"),
  result: z.discriminatedUnion("ok", [AaliyahCrmContactSuccessSchema, AaliyahCrmFailureSchema])
});

export const AaliyahCrmAccountResponseSchema = z.object({
  manifestVersion: z.literal(AGENT_ORG_MANIFEST_VERSION),
  resourceType: z.literal("aaliyah_crm_account_result"),
  result: z.discriminatedUnion("ok", [AaliyahCrmAccountSuccessSchema, AaliyahCrmFailureSchema])
});

export const AaliyahCrmNoteResponseSchema = z.object({
  manifestVersion: z.literal(AGENT_ORG_MANIFEST_VERSION),
  resourceType: z.literal("aaliyah_crm_note_result"),
  result: z.discriminatedUnion("ok", [AaliyahCrmNoteSuccessSchema, AaliyahCrmFailureSchema])
});

export const AaliyahCrmContextResponseSchema = z.object({
  manifestVersion: z.literal(AGENT_ORG_MANIFEST_VERSION),
  resourceType: z.literal("aaliyah_crm_context_result"),
  result: z.discriminatedUnion("ok", [AaliyahCrmContextSuccessSchema, AaliyahCrmFailureSchema])
});

export const AaliyahTaskCreateBodySchema = z.object({
  mode: z.enum(["founder", "zbestmedia"]),
  title: z.string().min(1),
  description: z.string().min(1).optional(),
  priority: z.enum(["low", "normal", "high", "critical"]).optional(),
  source: z.enum(["manual", "crm_follow_up", "calendar_follow_up", "email_follow_up", "system"]).optional(),
  contactId: z.string().min(1).optional(),
  accountId: z.string().min(1).optional(),
  relatedEmailDraftId: z.string().min(1).optional(),
  relatedCalendarEventId: z.string().min(1).optional(),
  dueAt: z.string().datetime().optional(),
  remindAt: z.string().datetime().optional()
});

export const AaliyahTaskUpdateBodySchema = z.object({
  mode: z.enum(["founder", "zbestmedia"]),
  title: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  status: z.enum(["open", "in_progress", "blocked", "completed", "cancelled"]).optional(),
  priority: z.enum(["low", "normal", "high", "critical"]).optional(),
  dueAt: z.string().datetime().optional(),
  remindAt: z.string().datetime().optional(),
  blockedReason: z.string().min(1).optional(),
  completionNote: z.string().min(1).optional()
});

export const AaliyahTaskIdParamSchema = z.object({
  taskId: z.string().min(1)
});

export const AaliyahTaskByContactIdParamSchema = z.object({
  contactId: z.string().min(1)
});

export const AaliyahTaskByAccountIdParamSchema = z.object({
  accountId: z.string().min(1)
});

export const AaliyahTaskListQuerySchema = z.object({
  mode: z.enum(["founder", "zbestmedia"]).default("founder"),
  status: z.literal("open").default("open")
});

const AaliyahTaskFailureSchema = z.object({
  ok: z.literal(false),
  denialCode: z.enum(["ACCESS_DENIED", "INVALID_MODE"]).nullable(),
  errorCode: z.enum(["INVALID_INPUT", "NOT_FOUND", "CONFLICT", "INTERNAL_ERROR"]).nullable(),
  retryable: z.boolean(),
  message: z.string().min(1)
});

const AaliyahTaskSuccessSchema = z.object({
  ok: z.literal(true),
  task: AaliyahTaskSchema,
  message: z.string().min(1)
});

const AaliyahTaskListSuccessSchema = z.object({
  ok: z.literal(true),
  tasks: z.array(AaliyahTaskSchema),
  message: z.string().min(1)
});

export const AaliyahTaskResponseSchema = z.object({
  manifestVersion: z.literal(AGENT_ORG_MANIFEST_VERSION),
  resourceType: z.literal("aaliyah_task_result"),
  result: z.discriminatedUnion("ok", [AaliyahTaskSuccessSchema, AaliyahTaskFailureSchema])
});

export const AaliyahTaskListResponseSchema = z.object({
  manifestVersion: z.literal(AGENT_ORG_MANIFEST_VERSION),
  resourceType: z.literal("aaliyah_task_list_result"),
  result: z.discriminatedUnion("ok", [AaliyahTaskListSuccessSchema, AaliyahTaskFailureSchema])
});

export const FounderCommandBodySchema = z.object({
  mode: z.enum(["founder", "zbestmedia"]),
  commandType: z.enum(["approve_draft", "create_follow_up", "escalate_task", "override_schedule", "trigger_workflow"]),
  target: z.object({
    targetType: z.enum(["gmail_draft", "task", "calendar_event", "contact", "account", "workflow"]),
    targetId: z.string().min(1)
  }),
  payload: z.record(z.string(), z.unknown()).default({}),
  idempotencyKey: z.string().min(1)
});

export const FounderCommandIdParamSchema = z.object({
  commandId: z.string().min(1)
});

export const FounderCommandListQuerySchema = z.object({
  mode: z.enum(["founder", "zbestmedia"]).default("founder"),
  limit: z.coerce.number().int().positive().max(100).default(50)
});

const FounderCommandFailureSchema = z.object({
  ok: z.literal(false),
  denialCode: z.enum(["ACCESS_DENIED", "INVALID_MODE"]).nullable(),
  errorCode: z.enum(["INVALID_INPUT", "NOT_FOUND", "CONFLICT", "INTERNAL_ERROR"]).nullable(),
  retryable: z.boolean(),
  message: z.string().min(1)
});

const FounderCommandSuccessSchema = z.object({
  ok: z.literal(true),
  commandId: z.string().min(1),
  commandType: z.enum(["approve_draft", "create_follow_up", "escalate_task", "override_schedule", "trigger_workflow"]),
  target: z.object({
    targetType: z.enum(["gmail_draft", "task", "calendar_event", "contact", "account", "workflow"]),
    targetId: z.string().min(1)
  }),
  status: z.enum(["executed", "noop"]),
  summary: z.string().min(1),
  auditEventId: z.string().min(1).nullable(),
  executedAtIso: z.string().datetime()
});

const FounderCommandListSuccessSchema = z.object({
  ok: z.literal(true),
  commands: z.array(AaliyahFounderCommandRecordSchema),
  message: z.string().min(1)
});

export const FounderCommandResponseSchema = z.object({
  manifestVersion: z.literal(AGENT_ORG_MANIFEST_VERSION),
  resourceType: z.literal("aaliyah_founder_command_result"),
  result: z.discriminatedUnion("ok", [FounderCommandSuccessSchema, FounderCommandFailureSchema])
});

export const FounderCommandListResponseSchema = z.object({
  manifestVersion: z.literal(AGENT_ORG_MANIFEST_VERSION),
  resourceType: z.literal("aaliyah_founder_command_list_result"),
  result: z.discriminatedUnion("ok", [FounderCommandListSuccessSchema, FounderCommandFailureSchema])
});

export const FollowThroughEngineEvaluateBodySchema = z.object({
  mode: z.enum(["founder", "zbestmedia"]),
  source: z.object({
    sourceType: z.enum(["founder_command", "task", "gmail_draft", "calendar_event", "contact", "account"]),
    sourceId: z.string().min(1)
  })
});

export const FollowThroughEngineRecordIdParamSchema = z.object({
  recordId: z.string().min(1)
});

export const FollowThroughEngineListQuerySchema = z.object({
  mode: z.enum(["founder", "zbestmedia"]).default("founder"),
  limit: z.coerce.number().int().positive().max(100).default(50)
});

const FollowThroughEngineFailureSchema = z.object({
  ok: z.literal(false),
  denialCode: z.enum(["ACCESS_DENIED", "INVALID_MODE"]).nullable(),
  errorCode: z.enum(["INVALID_INPUT", "NOT_FOUND", "CONFLICT", "INTERNAL_ERROR"]).nullable(),
  retryable: z.boolean(),
  message: z.string().min(1)
});

const FollowThroughEngineSuccessSchema = z.object({
  ok: z.literal(true),
  record: AaliyahFollowThroughEngineRecordSchema,
  message: z.string().min(1)
});

const FollowThroughEngineListSuccessSchema = z.object({
  ok: z.literal(true),
  records: z.array(AaliyahFollowThroughEngineRecordSchema),
  message: z.string().min(1)
});

export const FollowThroughEngineResponseSchema = z.object({
  manifestVersion: z.literal(AGENT_ORG_MANIFEST_VERSION),
  resourceType: z.literal("aaliyah_follow_through_engine_result"),
  result: z.discriminatedUnion("ok", [FollowThroughEngineSuccessSchema, FollowThroughEngineFailureSchema])
});

export const FollowThroughEngineListResponseSchema = z.object({
  manifestVersion: z.literal(AGENT_ORG_MANIFEST_VERSION),
  resourceType: z.literal("aaliyah_follow_through_engine_list_result"),
  result: z.discriminatedUnion("ok", [FollowThroughEngineListSuccessSchema, FollowThroughEngineFailureSchema])
});

export const RecommendationEvaluateBodySchema = z.object({
  mode: z.enum(["founder", "zbestmedia"]).default("founder"),
  source: z.object({
    sourceType: z.enum(["follow_through_record", "founder_command", "task", "gmail_draft", "calendar_event", "contact", "account"]),
    sourceId: z.string().min(1)
  })
});

export const RecommendationIdParamSchema = z.object({
  recommendationId: z.string().min(1)
});

export const RecommendationListQuerySchema = z.object({
  mode: z.enum(["founder", "zbestmedia"]).default("founder"),
  limit: z.coerce.number().int().positive().max(100).default(50)
});

const RecommendationFailureSchema = z.object({
  ok: z.literal(false),
  denialCode: z.enum(["ACCESS_DENIED", "INVALID_MODE"]).nullable(),
  errorCode: z.enum(["INVALID_INPUT", "NOT_FOUND", "CONFLICT", "INTERNAL_ERROR"]).nullable(),
  retryable: z.boolean(),
  message: z.string().min(1)
});

const RecommendationSuccessSchema = z.object({
  ok: z.literal(true),
  recommendation: AaliyahRecommendationRecordSchema,
  replayed: z.boolean(),
  message: z.string().min(1)
});

const RecommendationListSuccessSchema = z.object({
  ok: z.literal(true),
  recommendations: z.array(AaliyahRecommendationRecordSchema),
  message: z.string().min(1)
});

export const RecommendationResponseSchema = z.object({
  manifestVersion: z.literal(AGENT_ORG_MANIFEST_VERSION),
  resourceType: z.literal("aaliyah_recommendation_result"),
  result: z.discriminatedUnion("ok", [RecommendationSuccessSchema, RecommendationFailureSchema])
});

export const RecommendationListResponseSchema = z.object({
  manifestVersion: z.literal(AGENT_ORG_MANIFEST_VERSION),
  resourceType: z.literal("aaliyah_recommendation_list_result"),
  result: z.discriminatedUnion("ok", [RecommendationListSuccessSchema, RecommendationFailureSchema])
});

export const NotificationEvaluateBodySchema = z.object({
  mode: z.enum(["founder", "zbestmedia"]).default("founder"),
  source: z.object({
    sourceType: z.enum(["follow_through_record", "recommendation", "task", "founder_command", "contact", "account"]),
    sourceId: z.string().min(1)
  })
});

export const NotificationIdParamSchema = z.object({
  notificationId: z.string().min(1)
});

export const NotificationListQuerySchema = z.object({
  mode: z.enum(["founder", "zbestmedia"]).default("founder"),
  limit: z.coerce.number().int().positive().max(100).default(50),
  status: z.enum(["active", "acknowledged", "dismissed"]).optional()
});

const NotificationFailureSchema = z.object({
  ok: z.literal(false),
  denialCode: z.enum(["ACCESS_DENIED", "INVALID_MODE"]).nullable(),
  errorCode: z.enum(["INVALID_INPUT", "NOT_FOUND", "CONFLICT", "INTERNAL_ERROR"]).nullable(),
  retryable: z.boolean(),
  message: z.string().min(1)
});

const NotificationSuccessSchema = z.object({
  ok: z.literal(true),
  notification: AaliyahNotificationRecordSchema,
  replayed: z.boolean(),
  message: z.string().min(1)
});

const NotificationListSuccessSchema = z.object({
  ok: z.literal(true),
  notifications: z.array(AaliyahNotificationRecordSchema),
  message: z.string().min(1)
});

export const NotificationResponseSchema = z.object({
  manifestVersion: z.literal(AGENT_ORG_MANIFEST_VERSION),
  resourceType: z.literal("aaliyah_notification_result"),
  result: z.discriminatedUnion("ok", [NotificationSuccessSchema, NotificationFailureSchema])
});

export const NotificationListResponseSchema = z.object({
  manifestVersion: z.literal(AGENT_ORG_MANIFEST_VERSION),
  resourceType: z.literal("aaliyah_notification_list_result"),
  result: z.discriminatedUnion("ok", [NotificationListSuccessSchema, NotificationFailureSchema])
});

export const DeliverySendBodySchema = z.object({
  mode: z.enum(["founder", "zbestmedia"]).default("founder"),
  channel: z.enum(["console", "email"]),
  source: z.object({
    sourceType: z.enum(["notification", "digest"]),
    sourceId: z.string().min(1)
  })
});

export const DeliveryIdParamSchema = z.object({
  deliveryId: z.string().min(1)
});

export const DeliveryListQuerySchema = z.object({
  mode: z.enum(["founder", "zbestmedia"]).default("founder"),
  limit: z.coerce.number().int().positive().max(100).default(100),
  sourceType: z.enum(["notification", "digest"]).optional(),
  sourceId: z.string().min(1).optional()
});

const DeliveryFailureSchema = z.object({
  ok: z.literal(false),
  denialCode: z.enum(["ACCESS_DENIED", "INVALID_MODE"]).nullable(),
  errorCode: z.enum(["INVALID_INPUT", "NOT_FOUND", "CONFLICT", "INTERNAL_ERROR"]).nullable(),
  retryable: z.boolean(),
  message: z.string().min(1)
});

const DeliverySuccessSchema = z.object({
  ok: z.literal(true),
  delivery: AaliyahDeliveryRecordSchema,
  replayed: z.boolean(),
  message: z.string().min(1)
});

const DeliveryListSuccessSchema = z.object({
  ok: z.literal(true),
  deliveries: z.array(AaliyahDeliveryRecordSchema),
  message: z.string().min(1)
});

export const DeliveryResponseSchema = z.object({
  manifestVersion: z.literal(AGENT_ORG_MANIFEST_VERSION),
  resourceType: z.literal("aaliyah_delivery_result"),
  result: z.discriminatedUnion("ok", [DeliverySuccessSchema, DeliveryFailureSchema])
});

export const DeliveryListResponseSchema = z.object({
  manifestVersion: z.literal(AGENT_ORG_MANIFEST_VERSION),
  resourceType: z.literal("aaliyah_delivery_list_result"),
  result: z.discriminatedUnion("ok", [DeliveryListSuccessSchema, DeliveryFailureSchema])
});

export const DigestComposeBodySchema = z.object({
  mode: z.enum(["founder", "zbestmedia"]).default("founder"),
  digestType: z.enum(["daily_founder_digest", "weekly_founder_brief", "critical_digest"])
});

export const DigestIdParamSchema = z.object({
  digestId: z.string().min(1)
});

export const DigestListQuerySchema = z.object({
  mode: z.enum(["founder", "zbestmedia"]).default("founder"),
  limit: z.coerce.number().int().positive().max(100).default(50),
  digestType: z.enum(["daily_founder_digest", "weekly_founder_brief", "critical_digest"]).optional()
});

const DigestFailureSchema = z.object({
  ok: z.literal(false),
  denialCode: z.enum(["ACCESS_DENIED", "INVALID_MODE"]).nullable(),
  errorCode: z.enum(["INVALID_INPUT", "NOT_FOUND", "CONFLICT", "INTERNAL_ERROR"]).nullable(),
  retryable: z.boolean(),
  message: z.string().min(1)
});

const DigestSuccessSchema = z.object({
  ok: z.literal(true),
  digest: AaliyahDigestRecordSchema,
  replayed: z.boolean(),
  message: z.string().min(1)
});

const DigestListSuccessSchema = z.object({
  ok: z.literal(true),
  digests: z.array(AaliyahDigestRecordSchema),
  message: z.string().min(1)
});

export const DigestResponseSchema = z.object({
  manifestVersion: z.literal(AGENT_ORG_MANIFEST_VERSION),
  resourceType: z.literal("aaliyah_digest_result"),
  result: z.discriminatedUnion("ok", [DigestSuccessSchema, DigestFailureSchema])
});

export const DigestListResponseSchema = z.object({
  manifestVersion: z.literal(AGENT_ORG_MANIFEST_VERSION),
  resourceType: z.literal("aaliyah_digest_list_result"),
  result: z.discriminatedUnion("ok", [DigestListSuccessSchema, DigestFailureSchema])
});

export const FounderPreferencesBodySchema = z.object({
  mode: z.enum(["founder", "zbestmedia"]).default("founder"),
  preferences: z.object({
    notification: z.object({
      minimumConsoleSeverity: z.enum(["info", "warning", "critical"]).optional(),
      minimumEmailSeverity: z.enum(["warning", "critical"]).optional(),
      autoDismissInfoAfterHours: z.number().int().positive().nullable().optional()
    }).optional(),
    digest: z.object({
      dailyDigestEnabled: z.boolean().optional(),
      weeklyBriefEnabled: z.boolean().optional(),
      criticalDigestEnabled: z.boolean().optional(),
      sendEmptyDigests: z.boolean().optional()
    }).optional(),
    opportunity: z.object({
      dormantContactDays: z.number().int().positive().optional(),
      missedFollowUpWindowHours: z.number().int().positive().optional(),
      recurringBlockThreshold: z.number().int().positive().optional(),
      engagementSpikeMinimumEvents: z.number().int().positive().optional()
    }).optional(),
    recommendation: z.object({
      escalateHighPriorityOnly: z.boolean().optional(),
      reviveContactRequiresPriorValue: z.boolean().optional()
    }).optional(),
    scheduler: z.object({
      allowAutomaticRuns: z.boolean().optional(),
      defaultDailyRunHourUtc: z.number().int().min(0).max(23).nullable().optional()
    }).optional(),
    delivery: z.object({
      emailEnabled: z.boolean().optional(),
      consoleEnabled: z.boolean().optional()
    }).optional()
  })
});

const FounderPreferencesFailureSchema = z.object({
  ok: z.literal(false),
  denialCode: z.enum(["ACCESS_DENIED", "INVALID_MODE"]).nullable(),
  errorCode: z.enum(["INVALID_INPUT", "NOT_FOUND", "CONFLICT", "INTERNAL_ERROR"]).nullable(),
  retryable: z.boolean(),
  message: z.string().min(1)
});

const FounderPreferencesSuccessSchema = z.object({
  ok: z.literal(true),
  preferences: AaliyahFounderPreferenceControlsRecordSchema,
  message: z.string().min(1)
});

export const FounderPreferencesResponseSchema = z.object({
  manifestVersion: z.literal(AGENT_ORG_MANIFEST_VERSION),
  resourceType: z.literal("aaliyah_founder_preference_controls_result"),
  result: z.discriminatedUnion("ok", [FounderPreferencesSuccessSchema, FounderPreferencesFailureSchema])
});

export const OpportunityEvaluateBodySchema = z.object({
  mode: z.enum(["founder", "zbestmedia"]).default("founder"),
  source: z.object({
    sourceType: z.enum(["contact", "account", "task", "calendar_event", "follow_through_record", "recommendation", "founder_command"]),
    sourceId: z.string().min(1)
  })
});

export const OpportunityIdParamSchema = z.object({
  opportunityId: z.string().min(1)
});

export const OpportunityListQuerySchema = z.object({
  mode: z.enum(["founder", "zbestmedia"]).default("founder"),
  limit: z.coerce.number().int().positive().max(100).default(50),
  status: z.enum(["active", "acknowledged", "converted", "dismissed", "noop"]).optional()
});

const OpportunityFailureSchema = z.object({
  ok: z.literal(false),
  denialCode: z.enum(["ACCESS_DENIED", "INVALID_MODE"]).nullable(),
  errorCode: z.enum(["INVALID_INPUT", "NOT_FOUND", "CONFLICT", "INTERNAL_ERROR"]).nullable(),
  retryable: z.boolean(),
  message: z.string().min(1)
});

const OpportunitySuccessSchema = z.object({
  ok: z.literal(true),
  opportunity: AaliyahOpportunityRecordSchema,
  replayed: z.boolean(),
  message: z.string().min(1)
});

const OpportunityListSuccessSchema = z.object({
  ok: z.literal(true),
  opportunities: z.array(AaliyahOpportunityRecordSchema),
  message: z.string().min(1)
});

export const OpportunityResponseSchema = z.object({
  manifestVersion: z.literal(AGENT_ORG_MANIFEST_VERSION),
  resourceType: z.literal("aaliyah_opportunity_result"),
  result: z.discriminatedUnion("ok", [OpportunitySuccessSchema, OpportunityFailureSchema])
});

export const OpportunityListResponseSchema = z.object({
  manifestVersion: z.literal(AGENT_ORG_MANIFEST_VERSION),
  resourceType: z.literal("aaliyah_opportunity_list_result"),
  result: z.discriminatedUnion("ok", [OpportunityListSuccessSchema, OpportunityFailureSchema])
});

export const StrategicIntelligenceEvaluateBodySchema = z.object({
  mode: z.enum(["founder", "zbestmedia"]).default("founder"),
  scope: z.enum(["current", "daily", "weekly"]).default("current")
});

export const StrategicInsightIdParamSchema = z.object({
  insightId: z.string().min(1)
});

export const StrategicInsightListQuerySchema = z.object({
  mode: z.enum(["founder", "zbestmedia"]).default("founder"),
  limit: z.coerce.number().int().positive().max(100).default(50),
  status: z.enum(["active", "superseded", "acknowledged", "dismissed"]).optional()
});

const StrategicInsightFailureSchema = z.object({
  ok: z.literal(false),
  denialCode: z.enum(["ACCESS_DENIED", "INVALID_MODE"]).nullable(),
  errorCode: z.enum(["INVALID_INPUT", "NOT_FOUND", "CONFLICT", "INTERNAL_ERROR"]).nullable(),
  retryable: z.boolean(),
  message: z.string().min(1)
});

const StrategicInsightSuccessSchema = z.object({
  ok: z.literal(true),
  insights: z.array(AaliyahStrategicInsightRecordSchema),
  replayedCount: z.number().int().nonnegative(),
  message: z.string().min(1)
});

const StrategicInsightDetailSuccessSchema = z.object({
  ok: z.literal(true),
  insight: AaliyahStrategicInsightRecordSchema,
  message: z.string().min(1)
});

const StrategicInsightListSuccessSchema = z.object({
  ok: z.literal(true),
  insights: z.array(AaliyahStrategicInsightRecordSchema),
  message: z.string().min(1)
});

export const StrategicInsightResponseSchema = z.object({
  manifestVersion: z.literal(AGENT_ORG_MANIFEST_VERSION),
  resourceType: z.literal("aaliyah_strategic_intelligence_result"),
  result: z.discriminatedUnion("ok", [StrategicInsightSuccessSchema, StrategicInsightFailureSchema])
});

export const StrategicInsightDetailResponseSchema = z.object({
  manifestVersion: z.literal(AGENT_ORG_MANIFEST_VERSION),
  resourceType: z.literal("aaliyah_strategic_intelligence_detail_result"),
  result: z.discriminatedUnion("ok", [StrategicInsightDetailSuccessSchema, StrategicInsightFailureSchema])
});

export const StrategicInsightListResponseSchema = z.object({
  manifestVersion: z.literal(AGENT_ORG_MANIFEST_VERSION),
  resourceType: z.literal("aaliyah_strategic_intelligence_list_result"),
  result: z.discriminatedUnion("ok", [StrategicInsightListSuccessSchema, StrategicInsightFailureSchema])
});

export const CoalescedSignalEvaluateBodySchema = z.object({
  mode: z.enum(["founder", "zbestmedia"]).default("founder")
});

export const CoalescedSignalIdParamSchema = z.object({
  signalId: z.string().min(1)
});

export const CoalescedSignalListQuerySchema = z.object({
  mode: z.enum(["founder", "zbestmedia"]).default("founder"),
  limit: z.coerce.number().int().positive().max(100).default(50),
  status: z.enum(["active", "acknowledged", "dismissed", "resolved"]).optional()
});

const CoalescedSignalFailureSchema = z.object({
  ok: z.literal(false),
  denialCode: z.enum(["ACCESS_DENIED", "INVALID_MODE"]).nullable(),
  errorCode: z.enum(["INVALID_INPUT", "NOT_FOUND", "CONFLICT", "INTERNAL_ERROR"]).nullable(),
  retryable: z.boolean(),
  message: z.string().min(1)
});

const CoalescedSignalSuccessSchema = z.object({
  ok: z.literal(true),
  signals: z.array(AaliyahCoalescedSignalRecordSchema),
  replayedCount: z.number().int().nonnegative(),
  message: z.string().min(1)
});

const CoalescedSignalDetailSuccessSchema = z.object({
  ok: z.literal(true),
  signal: AaliyahCoalescedSignalRecordSchema,
  message: z.string().min(1)
});

const CoalescedSignalListSuccessSchema = z.object({
  ok: z.literal(true),
  signals: z.array(AaliyahCoalescedSignalRecordSchema),
  message: z.string().min(1)
});

export const CoalescedSignalResponseSchema = z.object({
  manifestVersion: z.literal(AGENT_ORG_MANIFEST_VERSION),
  resourceType: z.literal("aaliyah_coalesced_signal_result"),
  result: z.discriminatedUnion("ok", [CoalescedSignalSuccessSchema, CoalescedSignalFailureSchema])
});

export const CoalescedSignalDetailResponseSchema = z.object({
  manifestVersion: z.literal(AGENT_ORG_MANIFEST_VERSION),
  resourceType: z.literal("aaliyah_coalesced_signal_detail_result"),
  result: z.discriminatedUnion("ok", [CoalescedSignalDetailSuccessSchema, CoalescedSignalFailureSchema])
});

export const CoalescedSignalListResponseSchema = z.object({
  manifestVersion: z.literal(AGENT_ORG_MANIFEST_VERSION),
  resourceType: z.literal("aaliyah_coalesced_signal_list_result"),
  result: z.discriminatedUnion("ok", [CoalescedSignalListSuccessSchema, CoalescedSignalFailureSchema])
});

export const EvaluationScheduleCreateBodySchema = z.object({
  mode: z.enum(["founder", "zbestmedia"]).default("founder"),
  engineType: z.enum(["follow_through", "recommendation", "notification", "opportunity", "strategic_intelligence"]),
  cadenceType: z.enum(["manual", "hourly", "daily", "weekly"]),
  cadenceValue: z.string().min(1).optional(),
  metadata: z.record(z.string(), z.unknown()).optional()
});

export const EvaluationScheduleIdParamSchema = z.object({
  scheduleId: z.string().min(1)
});

export const EvaluationRunIdParamSchema = z.object({
  runId: z.string().min(1)
});

export const EvaluationScheduleListQuerySchema = z.object({
  mode: z.enum(["founder", "zbestmedia"]).default("founder"),
  limit: z.coerce.number().int().positive().max(100).default(50)
});

export const EvaluationRunListQuerySchema = z.object({
  mode: z.enum(["founder", "zbestmedia"]).default("founder"),
  limit: z.coerce.number().int().positive().max(100).default(50),
  engineType: z.enum(["follow_through", "recommendation", "notification", "opportunity", "strategic_intelligence"]).optional()
});

const EvaluationSchedulerFailureSchema = z.object({
  ok: z.literal(false),
  denialCode: z.enum(["ACCESS_DENIED", "INVALID_MODE"]).nullable(),
  errorCode: z.enum(["INVALID_INPUT", "NOT_FOUND", "CONFLICT", "INTERNAL_ERROR"]).nullable(),
  retryable: z.boolean(),
  message: z.string().min(1)
});

const EvaluationScheduleSuccessSchema = z.object({
  ok: z.literal(true),
  schedule: AaliyahEvaluationScheduleRecordSchema,
  message: z.string().min(1)
});

const EvaluationScheduleListSuccessSchema = z.object({
  ok: z.literal(true),
  schedules: z.array(AaliyahEvaluationScheduleRecordSchema),
  message: z.string().min(1)
});

const EvaluationRunSuccessSchema = z.object({
  ok: z.literal(true),
  run: AaliyahEvaluationRunRecordSchema,
  schedule: AaliyahEvaluationScheduleRecordSchema,
  replayed: z.boolean(),
  message: z.string().min(1)
});

const EvaluationRunDetailSuccessSchema = z.object({
  ok: z.literal(true),
  run: AaliyahEvaluationRunRecordSchema,
  message: z.string().min(1)
});

const EvaluationRunListSuccessSchema = z.object({
  ok: z.literal(true),
  runs: z.array(AaliyahEvaluationRunRecordSchema),
  message: z.string().min(1)
});

export const EvaluationScheduleResponseSchema = z.object({
  manifestVersion: z.literal(AGENT_ORG_MANIFEST_VERSION),
  resourceType: z.literal("aaliyah_evaluation_schedule_result"),
  result: z.discriminatedUnion("ok", [EvaluationScheduleSuccessSchema, EvaluationSchedulerFailureSchema])
});

export const EvaluationScheduleListResponseSchema = z.object({
  manifestVersion: z.literal(AGENT_ORG_MANIFEST_VERSION),
  resourceType: z.literal("aaliyah_evaluation_schedule_list_result"),
  result: z.discriminatedUnion("ok", [EvaluationScheduleListSuccessSchema, EvaluationSchedulerFailureSchema])
});

export const EvaluationRunResponseSchema = z.object({
  manifestVersion: z.literal(AGENT_ORG_MANIFEST_VERSION),
  resourceType: z.literal("aaliyah_evaluation_run_result"),
  result: z.discriminatedUnion("ok", [EvaluationRunSuccessSchema, EvaluationSchedulerFailureSchema])
});

export const EvaluationRunDetailResponseSchema = z.object({
  manifestVersion: z.literal(AGENT_ORG_MANIFEST_VERSION),
  resourceType: z.literal("aaliyah_evaluation_run_detail_result"),
  result: z.discriminatedUnion("ok", [EvaluationRunDetailSuccessSchema, EvaluationSchedulerFailureSchema])
});

export const EvaluationRunListResponseSchema = z.object({
  manifestVersion: z.literal(AGENT_ORG_MANIFEST_VERSION),
  resourceType: z.literal("aaliyah_evaluation_run_list_result"),
  result: z.discriminatedUnion("ok", [EvaluationRunListSuccessSchema, EvaluationSchedulerFailureSchema])
});

export const BrandPipelineAdvanceBodySchema = z.object({
  subjectId: z.string().min(1),
  completedSteps: z.array(BrandPipelineStepSchema),
  nextStep: BrandPipelineStepSchema,
  payload: z.record(z.string(), z.unknown()),
  evalObservations: z.array(
    z.object({
      metric: z.string().min(1),
      score: z.number(),
      metadata: z.record(z.string(), z.unknown()).optional()
    })
  ).optional()
});

export const ListAgentsQuerySchema = z.object({
  taskDomain: AgentTaskDomainSchema.optional(),
  status: AgentLifecycleStatusSchema.optional()
});

export const OrchestrationPlanBodySchema = z.object({
  workflow: z.enum(["brand_pipeline"]),
  subjectId: z.string().min(1),
  payload: z.record(z.string(), z.unknown()),
  delegatedAgents: z.array(AgentIdSchema).optional(),
  queueForWorker: z.boolean().optional().default(false)
});

export const OrchestrationEscalateBodySchema = z.object({
  olderThanMinutes: z.number().int().positive().max(10_080),
  agentId: AgentIdSchema.optional()
});

export const OrchestrationExecutionListQuerySchema = z.object({
  status: z.enum(["QUEUED", "PENDING_APPROVAL", "RUNNING", "COMPLETED", "FAILED"]).optional(),
  deadLetteredOnly: z.coerce.boolean().optional().default(false)
});

export const OrchestrationApprovalSlaQuerySchema = z.object({
  olderThanMinutes: z.coerce.number().int().positive().max(10_080).default(60),
  agentId: AgentIdSchema.optional()
});

export const OrchestrationReplayRequestBodySchema = z.object({});

export const OrchestrationBundleVerifyBodySchema = z.object({
  sealedAt: z.string().datetime(),
  payloadHash: z.string().min(1),
  signature: z.string().min(1)
});

export const OrchestrationAlertAckBodySchema = z.object({
  reason: z.string().min(1),
  details: z.record(z.string(), z.unknown()).optional()
});

export const OrchestrationRequeueBodySchema = z.object({
  approvalRequestId: z.string().min(1)
});

export const OrchestrationDiagnosticsQuerySchema = z.object({
  olderThanMinutes: z.coerce.number().int().positive().max(10_080).default(60)
});

export const OrchestrationAlertsQuerySchema = z.object({
  olderThanMinutes: z.coerce.number().int().positive().max(10_080).default(60),
  heartbeatStaleMinutes: z.coerce.number().int().positive().max(10_080).default(15)
});

export const OrchestrationAlertAckListQuerySchema = z.object({
  alertCode: z.string().min(1).optional()
});

export const OrchestrationAlertAckStatusQuerySchema = z.object({
  expiresAfterMinutes: z.coerce.number().int().positive().max(10_080).default(60)
});

export const OrchestrationAlertReopenBodySchema = z.object({
  reason: z.string().min(1)
});

export const WorkerFreshnessQuerySchema = z.object({
  staleAfterMinutes: z.coerce.number().int().positive().max(10_080).default(15)
});

export const OrchestrationOpsExportQuerySchema = z.object({
  olderThanMinutes: z.coerce.number().int().positive().max(10_080).default(60),
  heartbeatStaleMinutes: z.coerce.number().int().positive().max(10_080).default(15),
  staleAfterMinutes: z.coerce.number().int().positive().max(10_080).default(15)
});

export const OrchestrationOpsHistoryVerifyBodySchema = z.object({
  sealedAt: z.string().datetime(),
  payloadHash: z.string().min(1),
  signature: z.string().min(1)
});

export const OrchestrationWorkerProcessBodySchema = z.object({
  limit: z.number().int().positive().max(50).default(10),
  retryDelayMs: z.number().int().positive().max(3_600_000).optional()
});

const ExecutiveIdSchema = z.enum([
  "maestro-orchestrator",
  "cro",
  "cmo",
  "cio",
  "cco",
  "cto",
  "cpo",
  "coo",
  "cgo",
  "cso"
]);

const DepartmentIdSchema = z.enum([
  "revenue-sales",
  "marketing",
  "intelligence-research",
  "creative-content",
  "technology-engineering",
  "product",
  "operations",
  "growth",
  "strategy-security-risk"
]);

const LeadAgentOrgIdSchema = z.enum([
  "brandyn",
  "jordyn",
  "kobe",
  "jingle-jon",
  "jingle-jane",
  "code-sentinel"
]);

const SubAgentOrgIdSchema = z.enum([
  "build-monitor",
  "dependency-watcher",
  "runtime-health-monitor",
  "migration-guardian",
  "route-contract-watcher",
  "slo-enforcer"
]);

const OrgAgentIdSchema = z.union([LeadAgentOrgIdSchema, SubAgentOrgIdSchema]);

const ResponsibilityKeySchema = z.enum([
  "brand_identity_governance",
  "visual_identity_governance",
  "social_campaign_deployment",
  "sonic_brand_composition",
  "sonic_campaign_packaging",
  "build_breakage_detection",
  "dependency_drift_detection",
  "runtime_health_monitoring",
  "migration_integrity_monitoring",
  "route_contract_monitoring",
  "slo_release_gate_monitoring",
  "growth_intelligence",
  "revenue_optimization",
  "orchestration_workflow"
]);

const OperationalSignalTypeSchema = z.enum([
  "build_breakage",
  "dependency_drift",
  "runtime_health",
  "migration_integrity",
  "route_contract",
  "slo_release_gate"
]);

const RoutingTaskCategorySchema = z.enum([
  "brand_identity",
  "campaign_growth",
  "visual_design",
  "jingle_music",
  "build_integrity_monitoring",
  "dependency_integrity_monitoring",
  "runtime_health_monitoring",
  "migration_integrity_monitoring",
  "route_contract_monitoring",
  "slo_integrity_monitoring"
]);

const JingleRoutingModeSchema = z.enum(["composition", "packaging"]);
const RoutingRequestedAgentIdSchema = z.union([AgentIdSchema, LeadAgentOrgIdSchema, SubAgentOrgIdSchema]);

const ManifestVersionSchema = z.literal(AGENT_ORG_MANIFEST_VERSION);
const ResourceTypeSchema = z.enum([
  "org_manifest",
  "executive_detail",
  "department_detail",
  "agent_detail",
  "reporting_chain",
  "responsibility_ownership",
  "operational_signal_ownership",
  "code_sentinel_signal_list",
  "code_sentinel_signal_detail",
  "routing_decision",
  "email_account_list",
  "email_account_detail",
  "gmail_oauth_start",
  "gmail_oauth_callback",
  "email_account_process_batch",
  "email_account_process_single",
  "aaliyah_workspace_gmail_draft_result",
  "aaliyah_workspace_calendar_availability_result",
  "aaliyah_workspace_calendar_event_result",
  "aaliyah_founder_briefing",
  "aaliyah_runtime_result",
  "voice_intake_result",
  "voice_call_detail",
  "voice_escalation_list"
]);

const ExecutiveResourceSchema = z.object({
  executiveId: ExecutiveIdSchema,
  title: z.string(),
  mission: z.string().optional(),
  ownsDepartments: z.array(DepartmentIdSchema).optional(),
  reportsTo: ExecutiveIdSchema.nullish()
});

const DepartmentResourceSchema = z.object({
  departmentId: DepartmentIdSchema,
  displayName: z.string().optional(),
  mission: z.string().optional(),
  executiveOwnerId: ExecutiveIdSchema
});

const LeadAgentResourceSchema = z.object({
  leadAgentId: LeadAgentOrgIdSchema,
  displayName: z.string().optional(),
  departmentId: DepartmentIdSchema,
  reportsToExecutiveId: ExecutiveIdSchema,
  primaryResponsibility: z.string().optional(),
  allowedScope: z.array(z.string()).optional(),
  forbiddenScope: z.array(z.string()).optional(),
  laneType: z.enum(["lead_agent", "specialized_lane_owner"]).optional()
});

const SubAgentResourceSchema = z.object({
  subAgentId: SubAgentOrgIdSchema,
  displayName: z.string().optional(),
  parentLeadAgentId: LeadAgentOrgIdSchema,
  departmentId: DepartmentIdSchema.optional(),
  reportsToExecutiveId: ExecutiveIdSchema.optional(),
  primaryResponsibility: z.string().optional()
});

const ReportingChainNodeSchema = z.object({
  nodeType: z.enum(["sub-agent", "lead-agent", "executive"]),
  nodeId: z.string(),
  displayName: z.string()
});

const ResponsibilityOwnershipSchema = z.object({
  executive: ExecutiveResourceSchema,
  department: DepartmentResourceSchema,
  leadAgent: LeadAgentResourceSchema
});

const OperationalSignalOwnershipSchema = z.object({
  executive: ExecutiveResourceSchema,
  department: DepartmentResourceSchema,
  leadAgent: LeadAgentResourceSchema,
  subAgent: SubAgentResourceSchema
});

const CodeSentinelSignalDefinitionSchema = z.object({
  signalType: OperationalSignalTypeSchema,
  responsibilityKey: ResponsibilityKeySchema,
  leadAgentId: LeadAgentOrgIdSchema,
  subAgentId: SubAgentOrgIdSchema,
  sourceSurface: z.string(),
  description: z.string()
});

export const OrgManifestResponseSchema = z.object({
  manifestVersion: ManifestVersionSchema,
  resourceType: z.literal("org_manifest"),
  manifest: z.object({
    manifestVersion: ManifestVersionSchema,
    executives: z.array(ExecutiveResourceSchema),
    departments: z.array(DepartmentResourceSchema),
    leadAgents: z.array(LeadAgentResourceSchema),
    subAgents: z.array(SubAgentResourceSchema)
  })
});

export const ExecutiveDetailResponseSchema = z.object({
  manifestVersion: ManifestVersionSchema,
  resourceType: z.literal("executive_detail"),
  executiveId: ExecutiveIdSchema,
  executive: ExecutiveResourceSchema,
  agents: z.object({
    departments: z.array(DepartmentResourceSchema),
    leadAgents: z.array(LeadAgentResourceSchema),
    subAgents: z.array(SubAgentResourceSchema)
  })
});

export const DepartmentDetailResponseSchema = z.object({
  manifestVersion: ManifestVersionSchema,
  resourceType: z.literal("department_detail"),
  departmentId: DepartmentIdSchema,
  department: DepartmentResourceSchema,
  executiveOwner: ExecutiveResourceSchema,
  agents: z.object({
    leadAgents: z.array(LeadAgentResourceSchema),
    subAgents: z.array(SubAgentResourceSchema)
  })
});

export const OrgAgentDetailResponseSchema = z.object({
  manifestVersion: ManifestVersionSchema,
  resourceType: z.literal("agent_detail"),
  agentId: OrgAgentIdSchema,
  agentType: z.enum(["lead-agent", "sub-agent"]),
  leadAgent: LeadAgentResourceSchema.optional(),
  subAgent: SubAgentResourceSchema.optional(),
  scope: z
    .object({
      allowedScope: z.array(z.string()),
      forbiddenScope: z.array(z.string())
    })
    .optional(),
  subAgents: z.array(SubAgentResourceSchema).optional()
});

export const ReportingChainResponseSchema = z.object({
  manifestVersion: ManifestVersionSchema,
  resourceType: z.literal("reporting_chain"),
  agentId: OrgAgentIdSchema,
  chain: z.array(ReportingChainNodeSchema)
});

export const ResponsibilityOwnershipResponseSchema = z.object({
  manifestVersion: ManifestVersionSchema,
  resourceType: z.literal("responsibility_ownership"),
  responsibilityKey: ResponsibilityKeySchema,
  supported: z.boolean(),
  ownership: ResponsibilityOwnershipSchema.nullable()
});

export const OperationalSignalOwnershipResponseSchema = z.object({
  manifestVersion: ManifestVersionSchema,
  resourceType: z.literal("operational_signal_ownership"),
  signalType: OperationalSignalTypeSchema,
  supported: z.literal(true),
  ownership: OperationalSignalOwnershipSchema
});

export const CodeSentinelSignalListResponseSchema = z.object({
  manifestVersion: ManifestVersionSchema,
  resourceType: z.literal("code_sentinel_signal_list"),
  items: z.array(CodeSentinelSignalDefinitionSchema)
});

export const CodeSentinelSignalDetailResponseSchema = z.object({
  manifestVersion: ManifestVersionSchema,
  resourceType: z.literal("code_sentinel_signal_detail"),
  signalType: OperationalSignalTypeSchema,
  supported: z.literal(true),
  signal: CodeSentinelSignalDefinitionSchema,
  ownership: OperationalSignalOwnershipSchema
});

export const RoutingResolveBodySchema = z.object({
  category: RoutingTaskCategorySchema,
  requestedAgentId: RoutingRequestedAgentIdSchema.optional(),
  jingleMode: JingleRoutingModeSchema.optional()
});

export const RoutingResolveResponseSchema = z.object({
  manifestVersion: ManifestVersionSchema,
  resourceType: z.literal("routing_decision"),
  decision: z.object({
    requestedCategory: RoutingTaskCategorySchema,
    resolvedDepartment: DepartmentIdSchema,
    resolvedExecutive: ExecutiveIdSchema,
    resolvedLeadAgentId: LeadAgentOrgIdSchema,
    resolvedSubAgentId: SubAgentOrgIdSchema.nullable(),
    executionAgentId: AgentIdSchema.nullable(),
    responsibilityKey: ResponsibilityKeySchema,
    operationalSignalType: OperationalSignalTypeSchema.nullable(),
    policyValidated: z.literal(true),
    trace: z.array(z.string())
  })
});

export const AgentIncidentSignalBodySchema = z.object({
  signalType: OperationalSignalTypeSchema,
  status: z.enum(["healthy", "warning", "critical"]),
  sourceSystem: z.string().min(1),
  message: z.string().min(1),
  details: z.record(z.string(), z.unknown()).optional(),
  relatedAssignmentRecordId: z.string().min(1).optional().nullable(),
  relatedRunRecordId: z.string().min(1).optional().nullable()
});

export const AgentIncidentListQuerySchema = z.object({
  status: IncidentStatusSchema.optional(),
  severity: IncidentSeveritySchema.optional(),
  incidentType: IncidentTypeSchema.optional(),
  limit: z.coerce.number().int().positive().max(100).default(25)
});

export const AgentIncidentAcknowledgeBodySchema = z.object({
  acknowledgedAt: z.string().datetime().optional()
});

export const AgentIncidentResolveBodySchema = z.object({
  resolutionNote: z.string().min(1),
  resolvedAt: z.string().datetime().optional()
});

export const IncidentListResponseSchema = z.object({
  resourceType: z.literal("incident_list"),
  items: z.array(IncidentRecordSchema)
});

export const IncidentDetailResponseSchema = z.object({
  resourceType: z.literal("incident_detail"),
  incident: IncidentRecordSchema
});

const OpsStatusLevelSchema = z.enum(["healthy", "warning", "critical"]);
const TelemetrySurfaceSchema = z.enum([
  "build",
  "dependency",
  "runtime",
  "migrations",
  "route_contracts",
  "slo",
  "policy_routing",
  "execution_runtime"
]);
const IncidentCountBySeveritySchema = z.object({
  info: z.number().int().nonnegative(),
  warning: z.number().int().nonnegative(),
  critical: z.number().int().nonnegative()
});
const IncidentCountByTypeSchema = z.object({
  build_integrity_failure: z.number().int().nonnegative(),
  dependency_integrity_failure: z.number().int().nonnegative(),
  runtime_health_failure: z.number().int().nonnegative(),
  migration_integrity_failure: z.number().int().nonnegative(),
  route_contract_failure: z.number().int().nonnegative(),
  slo_integrity_failure: z.number().int().nonnegative(),
  execution_policy_failure: z.number().int().nonnegative(),
  execution_runtime_failure: z.number().int().nonnegative()
});
const ExecutionCountByStateSchema = z.object({
  requested: z.number().int().nonnegative(),
  validated: z.number().int().nonnegative(),
  routed: z.number().int().nonnegative(),
  blocked: z.number().int().nonnegative(),
  executing: z.number().int().nonnegative(),
  retriable: z.number().int().nonnegative(),
  succeeded: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative()
});
const CodeSentinelCountBySubAgentSchema = z.object({
  "build-monitor": z.number().int().nonnegative(),
  "dependency-watcher": z.number().int().nonnegative(),
  "runtime-health-monitor": z.number().int().nonnegative(),
  "migration-guardian": z.number().int().nonnegative(),
  "route-contract-watcher": z.number().int().nonnegative(),
  "slo-enforcer": z.number().int().nonnegative()
});
const CodeSentinelCountBySignalSchema = z.object({
  build_breakage: z.number().int().nonnegative(),
  dependency_drift: z.number().int().nonnegative(),
  runtime_health: z.number().int().nonnegative(),
  migration_integrity: z.number().int().nonnegative(),
  route_contract: z.number().int().nonnegative(),
  slo_release_gate: z.number().int().nonnegative()
});

export const OpsIncidentSummaryResponseSchema = z.object({
  manifestVersion: ManifestVersionSchema,
  resourceType: z.literal("ops_incident_summary"),
  summary: z.object({
    manifestVersion: ManifestVersionSchema,
    generatedAt: z.string().datetime(),
    openBySeverity: IncidentCountBySeveritySchema,
    openByType: IncidentCountByTypeSchema,
    releaseBlockingOpenCount: z.number().int().nonnegative(),
    degradedSurfaces: z.array(TelemetrySurfaceSchema)
  })
});

export const OpsExecutionSummaryResponseSchema = z.object({
  manifestVersion: ManifestVersionSchema,
  resourceType: z.literal("ops_execution_summary"),
  summary: z.object({
    manifestVersion: ManifestVersionSchema,
    generatedAt: z.string().datetime(),
    recentByState: ExecutionCountByStateSchema,
    recentFailuresByCategory: z.record(z.string(), z.number().int().nonnegative()),
    routingFailureCount: z.number().int().nonnegative(),
    policyRejectionCount: z.number().int().nonnegative()
  })
});

export const OpsCodeSentinelSummaryResponseSchema = z.object({
  manifestVersion: ManifestVersionSchema,
  resourceType: z.literal("ops_code_sentinel_summary"),
  summary: z.object({
    manifestVersion: ManifestVersionSchema,
    generatedAt: z.string().datetime(),
    openIncidentCountBySubAgent: CodeSentinelCountBySubAgentSchema,
    openIncidentCountBySignal: CodeSentinelCountBySignalSchema,
    mostImpactedSubAgent: SubAgentOrgIdSchema.nullable()
  })
});

export const OpsStatusSummaryResponseSchema = z.object({
  manifestVersion: ManifestVersionSchema,
  resourceType: z.literal("ops_status_summary"),
  summary: z.object({
    status: OpsStatusLevelSchema,
    manifestVersion: ManifestVersionSchema,
    generatedAt: z.string().datetime(),
    incidents: OpsIncidentSummaryResponseSchema.shape.summary,
    executions: OpsExecutionSummaryResponseSchema.shape.summary,
    codeSentinel: OpsCodeSentinelSummaryResponseSchema.shape.summary,
    degradedSurfaces: z.array(TelemetrySurfaceSchema)
  })
});

export const AdminIntegrityResponseSchema = z.object({
  manifestVersion: ManifestVersionSchema,
  resourceType: z.literal("admin_integrity"),
  integrity: z.object({
    manifestVersion: ManifestVersionSchema,
    valid: z.boolean(),
    validatedAt: z.string().datetime(),
    error: z.string().nullable()
  })
});

export const AdminRoutingCategoriesResponseSchema = z.object({
  manifestVersion: ManifestVersionSchema,
  resourceType: z.literal("admin_routing_categories"),
  items: z.array(
    z.object({
      category: RoutingTaskCategorySchema,
      responsibilityKey: ResponsibilityKeySchema.nullable(),
      operationalSignalType: OperationalSignalTypeSchema.nullable(),
      requiresDisambiguation: z.boolean(),
      supported: z.boolean(),
      supportedJingleModes: z.array(JingleRoutingModeSchema).optional()
    })
  )
});

export const AdminRoutingPreviewResponseSchema = z.object({
  manifestVersion: ManifestVersionSchema,
  resourceType: z.literal("admin_routing_preview"),
  decision: RoutingDecisionSchema
});

export const AdminExecutionRecordListResponseSchema = z.object({
  manifestVersion: ManifestVersionSchema,
  resourceType: z.literal("admin_execution_record_list"),
  items: z.array(AssignmentRecordSchema)
});

export const AdminExecutionRecordDetailResponseSchema = z.object({
  manifestVersion: ManifestVersionSchema,
  resourceType: z.literal("admin_execution_record_detail"),
  item: AssignmentRecordSchema
});

export const AdminExecutionRunListResponseSchema = z.object({
  manifestVersion: ManifestVersionSchema,
  resourceType: z.literal("admin_execution_run_list"),
  items: z.array(ExecutionRunRecordSchema)
});

export const AdminExecutionRunDetailResponseSchema = z.object({
  manifestVersion: ManifestVersionSchema,
  resourceType: z.literal("admin_execution_run_detail"),
  item: ExecutionRunRecordSchema
});

export const AdminIncidentListResponseSchema = z.object({
  manifestVersion: ManifestVersionSchema,
  resourceType: z.literal("admin_incident_list"),
  items: z.array(IncidentRecordSchema)
});

export const AdminIncidentDetailResponseSchema = z.object({
  manifestVersion: ManifestVersionSchema,
  resourceType: z.literal("admin_incident_detail"),
  item: IncidentRecordSchema
});

const EmailProcessingOutcomeSummarySchema = z.object({
  threadId: z.string().min(1),
  assignmentRecordId: z.string().min(1),
  runRecordId: z.string().min(1),
  status: z.enum(["drafted", "escalated", "suppressed", "failed"]),
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
  approvalRequired: z.literal(true),
  blockedAutoSend: z.literal(true),
  reviewItemId: z.string().min(1).nullable()
});

export const EmailAccountListResponseSchema = z.object({
  resourceType: z.literal("email_account_list"),
  items: z.array(EmailAccountConnectionRecordSchema)
});

export const EmailAccountDetailResponseSchema = z.object({
  resourceType: z.literal("email_account_detail"),
  account: EmailAccountConnectionRecordSchema
});

export const GmailOauthStartResponseSchema = z.object({
  resourceType: z.literal("gmail_oauth_start"),
  account: EmailAccountConnectionRecordSchema,
  authorizationUrl: z.string().url(),
  state: z.string().min(1),
  redirectUri: z.string().url(),
  scopes: z.array(z.string().min(1)).min(1)
});

export const GmailOauthCallbackResponseSchema = z.object({
  resourceType: z.literal("gmail_oauth_callback"),
  account: EmailAccountConnectionRecordSchema
});

export const EmailAccountProcessBatchResponseSchema = z.object({
  resourceType: z.literal("email_account_process_batch"),
  account: EmailAccountConnectionRecordSchema,
  processedCount: z.number().int().nonnegative(),
  nextPageToken: z.string().nullable(),
  outcomes: z.array(EmailProcessingOutcomeSummarySchema)
});

export const EmailAccountProcessSingleResponseSchema = z.object({
  resourceType: z.literal("email_account_process_single"),
  account: EmailAccountConnectionRecordSchema,
  outcome: EmailProcessingOutcomeSummarySchema
});

export const AdminSummaryResponseSchema = z.object({
  manifestVersion: ManifestVersionSchema,
  resourceType: z.literal("admin_summary"),
  summary: z.object({
    manifestVersion: ManifestVersionSchema,
    generatedAt: z.string().datetime(),
    integrity: AdminIntegrityResponseSchema.shape.integrity,
    ops: OpsStatusSummaryResponseSchema.shape.summary,
    releaseBlockingIncidentCount: z.number().int().nonnegative(),
    openIncidentCount: z.number().int().nonnegative(),
    recentExecutionFailureCount: z.number().int().nonnegative(),
    degradedSurfaces: z.array(TelemetrySurfaceSchema)
  })
});

const FounderBriefingModeSchema = z.enum(["founder", "zbestmedia"]);
const FounderBriefingSectionSchema = z.enum([
  "top_priorities",
  "waiting_on_me",
  "revenue_watch",
  "operations_watch",
  "calendar_watch",
  "relationship_watch",
  "recommended_actions"
]);
const FounderInterruptClassSchema = z.enum(["interrupt_now", "review_soon", "can_wait"]);
const FounderBriefingOwnerSchema = z.object({
  executiveId: ExecutiveIdSchema.nullable(),
  departmentId: DepartmentIdSchema.nullable(),
  leadAgentId: LeadAgentOrgIdSchema.nullable(),
  subAgentId: SubAgentOrgIdSchema.nullable(),
  sourceLane: z.string().min(1)
});
const FounderBriefingItemSchema = z.object({
  itemId: z.string().min(1),
  category: FounderBriefingSectionSchema,
  title: z.string().min(1),
  summary: z.string().min(1),
  urgency: z.enum(["low", "normal", "high", "urgent"]),
  owner: FounderBriefingOwnerSchema,
  recommendedAction: z.string().min(1),
  interruptionClass: FounderInterruptClassSchema,
  requiresFounderAttention: z.boolean(),
  provenanceReferences: z.array(z.string().min(1))
});
const FounderRecommendedActionSchema = z.object({
  actionId: z.string().min(1),
  title: z.string().min(1),
  action: z.string().min(1),
  urgency: z.enum(["low", "normal", "high", "urgent"]),
  sourceItemId: z.string().min(1)
});
const FounderBriefingSchema = z.object({
  briefingId: z.string().min(1),
  generatedAt: z.string().datetime(),
  activeMode: FounderBriefingModeSchema,
  manifestVersion: ManifestVersionSchema,
  topPriorities: z.array(FounderBriefingItemSchema),
  waitingOnMe: z.array(FounderBriefingItemSchema),
  revenueWatch: z.array(FounderBriefingItemSchema),
  operationsWatch: z.array(FounderBriefingItemSchema),
  calendarWatch: z.array(FounderBriefingItemSchema),
  relationshipWatch: z.array(FounderBriefingItemSchema),
  recommendedActions: z.array(FounderRecommendedActionSchema),
  interruptSummary: z.object({
    interruptNowCount: z.number().int().nonnegative(),
    reviewSoonCount: z.number().int().nonnegative(),
    canWaitCount: z.number().int().nonnegative()
  }),
  confidenceSummary: z.object({
    status: OpsStatusLevelSchema,
    lowConfidenceSignals: z.number().int().nonnegative(),
    degradedSurfaces: z.array(TelemetrySurfaceSchema)
  }),
  sourceMetadata: z.object({
    orgManifestVersion: ManifestVersionSchema,
    aaliyahRegistryVersion: z.string().min(1),
    generatedFrom: z.object({
      pendingReviewCount: z.number().int().nonnegative(),
      openIncidentCount: z.number().int().nonnegative(),
      releaseBlockingIncidentCount: z.number().int().nonnegative(),
      recentExecutionFailureCount: z.number().int().nonnegative()
    })
  })
});

export const AaliyahBriefingQuerySchema = z.object({
  mode: FounderBriefingModeSchema.optional().default("founder")
});

export const AaliyahBriefingResponseSchema = z.object({
  manifestVersion: ManifestVersionSchema,
  resourceType: z.literal("aaliyah_founder_briefing"),
  briefing: FounderBriefingSchema
});

const AaliyahQuickActionSchema = z.object({
  actionId: z.string().min(1),
  actionType: z.enum([
    "refresh_founder_briefing",
    "open_approval_queue",
    "review_voice_escalations",
    "get_incident_summary",
    "get_ops_status",
    "switch_mode",
    "preview_routing"
  ]),
  label: z.string().min(1),
  targetIntent: z.enum([
    "get_founder_briefing",
    "get_waiting_approvals",
    "get_pending_voice_escalations",
    "get_incident_summary",
    "get_ops_status",
    "switch_mode",
    "preview_routing"
  ]),
  allowedParameters: z.array(z.string().min(1)),
  defaultParameters: z.record(z.string(), z.unknown()),
  approvalRequired: z.boolean(),
  availabilityStatus: z.enum(["available", "requires_parameters", "disabled"]),
  availabilityReason: z.string().min(1).nullable()
});

const AaliyahCommandSurfaceInterruptSummarySchema = z.object({
  interruptNowCount: z.number().int().nonnegative(),
  sameDayBriefingCount: z.number().int().nonnegative(),
  passiveQueueCount: z.number().int().nonnegative(),
  silentLogCount: z.number().int().nonnegative()
});

const AaliyahConfidenceAssessmentSchema = z.object({
  confidenceId: z.string().min(1),
  sourceSubsystem: z.string().min(1),
  assessedItemType: z.string().min(1),
  confidenceLevel: z.enum(["high", "medium", "low"]),
  confidenceBand: z.number().min(0).max(1),
  reasonCodes: z.array(z.string().min(1)),
  recommendedFallbackAction: z.enum(["proceed", "defer", "escalate", "suppress"])
});

const AaliyahConfidenceSummarySchema = z.object({
  generatedAt: z.string().datetime(),
  activeMode: FounderBriefingModeSchema,
  overallConfidenceLevel: z.enum(["high", "medium", "low"]),
  highConfidenceCount: z.number().int().nonnegative(),
  mediumConfidenceCount: z.number().int().nonnegative(),
  lowConfidenceCount: z.number().int().nonnegative(),
  deferredCount: z.number().int().nonnegative(),
  suppressedCount: z.number().int().nonnegative(),
  topReasonCodes: z.array(z.string().min(1)),
  items: z.array(AaliyahConfidenceAssessmentSchema)
});

const AaliyahInterruptQueueItemSchema = z.object({
  sourceItemId: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().min(1),
  recommendedAction: z.string().min(1),
  visibilityAction: z.enum(["interrupt_now", "same_day_briefing", "passive_queue", "silent_log"]),
  confidenceLevel: z.enum(["high", "medium", "low"]),
  founderRelevance: z.boolean(),
  reasonCodes: z.array(z.string().min(1))
});

const AaliyahInterruptionSummarySchema = z.object({
  generatedAt: z.string().datetime(),
  activeMode: FounderBriefingModeSchema,
  items: z.array(AaliyahInterruptQueueItemSchema),
  interruptNowCount: z.number().int().nonnegative(),
  sameDayBriefingCount: z.number().int().nonnegative(),
  passiveQueueCount: z.number().int().nonnegative(),
  silentLogCount: z.number().int().nonnegative()
});

const AaliyahApprovalSummarySchema = z.object({
  totalPending: z.number().int().nonnegative(),
  items: z.array(EmailDraftReviewRecordSchema)
});

const AaliyahVoiceEscalationSummarySchema = z.object({
  totalPending: z.number().int().nonnegative(),
  items: z.array(VoiceCallRecordSchema),
  interruptNowCount: z.number().int().nonnegative()
});

const AaliyahCommandSurfaceProvenanceSummarySchema = z.object({
  orgManifestVersion: ManifestVersionSchema,
  aaliyahRegistryVersion: z.string().min(1),
  generatedFrom: z.object({
    pendingApprovalCount: z.number().int().nonnegative(),
    pendingVoiceEscalationCount: z.number().int().nonnegative(),
    releaseBlockingIncidentCount: z.number().int().nonnegative(),
    degradedSurfaceCount: z.number().int().nonnegative()
  })
});

const AaliyahCommandSurfaceSchema = z.object({
  shellId: z.string().min(1),
  generatedAt: z.string().datetime(),
  activeMode: FounderBriefingModeSchema,
  manifestVersion: ManifestVersionSchema,
  founderBriefingSummary: FounderBriefingSchema,
  whatMattersNow: z.array(FounderBriefingItemSchema),
  waitingOnMe: z.array(FounderBriefingItemSchema),
  openApprovals: AaliyahApprovalSummarySchema,
  openIncidentSummary: OpsIncidentSummaryResponseSchema.shape.summary,
  opsStatusSummary: OpsStatusSummaryResponseSchema.shape.summary,
  openVoiceEscalations: AaliyahVoiceEscalationSummarySchema,
  recommendedNextActions: z.array(
    z.object({
      actionId: z.string().min(1),
      title: z.string().min(1),
      action: z.string().min(1),
      urgency: z.enum(["low", "normal", "high", "urgent"]),
      sourceItemId: z.string().min(1)
    })
  ),
  interruptQueueSummary: AaliyahCommandSurfaceInterruptSummarySchema,
  confidenceSummary: AaliyahConfidenceSummarySchema,
  interruptionQueue: AaliyahInterruptionSummarySchema,
  founderReviewQueue: z.lazy(() => AaliyahReviewQueueSummarySchema),
  founderInbox: z.lazy(() => AaliyahInboxSummarySchema),
  quickActions: z.array(AaliyahQuickActionSchema),
  provenanceSummary: AaliyahCommandSurfaceProvenanceSummarySchema
});

export const AaliyahCommandSurfaceQuerySchema = z.object({
  mode: FounderBriefingModeSchema.optional().default("founder")
});

export const AaliyahPreferenceQuerySchema = z.object({
  mode: FounderBriefingModeSchema.optional().default("founder")
});

export const AaliyahPreferenceCreateBodySchema = z.object({
  category: AaliyahPreferenceCategorySchema,
  value: AaliyahPreferenceValueSchema,
  scope: AaliyahPreferenceScopeSchema.partial().optional(),
  confidenceLevel: AaliyahPreferenceConfidenceLevelSchema.optional()
});

export const AaliyahPreferenceIdParamSchema = z.object({
  preferenceId: z.string().min(1)
});

export const AaliyahCommandSurfaceResponseSchema = z.object({
  manifestVersion: ManifestVersionSchema,
  resourceType: z.literal("aaliyah_command_surface"),
  shell: AaliyahCommandSurfaceSchema
});

export const AaliyahQuickActionsResponseSchema = z.object({
  manifestVersion: ManifestVersionSchema,
  resourceType: z.literal("aaliyah_quick_actions"),
  activeMode: FounderBriefingModeSchema,
  items: z.array(AaliyahQuickActionSchema)
});

export const AaliyahInterruptionsResponseSchema = z.object({
  manifestVersion: ManifestVersionSchema,
  resourceType: z.literal("aaliyah_interruptions"),
  summary: AaliyahInterruptionSummarySchema
});

export const AaliyahConfidenceSummaryResponseSchema = z.object({
  manifestVersion: ManifestVersionSchema,
  resourceType: z.literal("aaliyah_confidence_summary"),
  summary: AaliyahConfidenceSummarySchema
});

const AaliyahPreferenceListSchema = z.object({
  generatedAt: z.string().datetime(),
  activeMode: FounderBriefingModeSchema,
  defaults: z.object({
    activeMode: FounderBriefingModeSchema,
    briefingLength: z.enum(["compact", "standard", "expanded"]),
    interruptionTolerance: z.enum(["minimal", "standard", "high"]),
    approvalVisibility: z.enum(["all_pending", "urgent_only"]),
    tonePreference: z.enum(["concise", "balanced", "detailed"]),
    modeVisibility: z.enum(["strict", "founder_summary"]),
    appliedPreferences: z.array(AaliyahFounderPreferenceRecordSchema)
  }),
  items: z.array(AaliyahFounderPreferenceRecordSchema)
});

const AaliyahMemoryBoundaryDecisionSchema = z.object({
  decisionId: z.string().min(1),
  activeMode: FounderBriefingModeSchema,
  requestedMode: FounderBriefingModeSchema,
  requestedCompanies: z.array(z.string().min(1)),
  detailLevel: z.enum(["summary", "detail"]),
  access: z.enum(["allowed", "allowed_founder_summary_only", "denied"]),
  founderSummaryOnly: z.boolean(),
  reasonCodes: z.array(z.enum([
    "valid_scope",
    "founder_summary_only",
    "unsupported_mode",
    "unscoped_request",
    "unknown_company_scope",
    "cross_company_detail_denied",
    "company_detail_scope_denied"
  ]))
});

const AaliyahMemoryBoundarySummarySchema = z.object({
  generatedAt: z.string().datetime(),
  activeMode: FounderBriefingModeSchema,
  supportedModes: z.array(FounderBriefingModeSchema),
  supportedCompanies: z.array(z.string().min(1)),
  founderAggregationRule: z.literal("single_company_detail_allowed_multi_company_summary_only"),
  decisions: z.array(AaliyahMemoryBoundaryDecisionSchema)
});

const AaliyahReviewQueueItemSchema = z.object({
  queueItemId: z.string().min(1),
  sourceSubsystem: z.enum([
    "email_review_queue",
    "email_dispatch_queue",
    "voice_intake",
    "incident_pipeline",
    "founder_briefing"
  ]),
  sourceItemId: z.string().min(1),
  itemType: z.enum([
    "approval_required",
    "voice_escalation",
    "incident_attention",
    "dispatch_action",
    "routing_preview_action",
    "founder_recommended_action"
  ]),
  title: z.string().min(1),
  summary: z.string().min(1),
  urgency: z.enum(["low", "normal", "high", "urgent"]),
  risk: z.enum(["low", "medium", "high", "critical"]),
  confidenceLevel: z.enum(["high", "medium", "low"]),
  interruptionClass: z.enum(["interrupt_now", "same_day_briefing", "passive_queue", "silent_log"]),
  activeMode: FounderBriefingModeSchema,
  founderAttentionRequired: z.boolean(),
  recommendedNextAction: z.string().min(1),
  allowedNextActions: z.array(z.enum([
    "open_review_item",
    "approve_review_item",
    "reject_review_item",
    "request_review_revision",
    "dispatch_approved_email",
    "open_voice_escalation",
    "open_incident",
    "refresh_founder_briefing"
  ])),
  provenanceSummary: z.object({
    manifestVersion: ManifestVersionSchema,
    references: z.array(z.string().min(1)),
    contributingSourceItemIds: z.array(z.string().min(1))
  }),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

const AaliyahReviewQueueSummarySchema = z.object({
  queueId: z.string().min(1),
  generatedAt: z.string().datetime(),
  activeMode: FounderBriefingModeSchema,
  manifestVersion: ManifestVersionSchema,
  itemCountsByType: z.object({
    approval_required: z.number().int().nonnegative(),
    voice_escalation: z.number().int().nonnegative(),
    incident_attention: z.number().int().nonnegative(),
    dispatch_action: z.number().int().nonnegative(),
    routing_preview_action: z.number().int().nonnegative(),
    founder_recommended_action: z.number().int().nonnegative()
  }),
  itemCountsByInterruptionClass: z.object({
    interrupt_now: z.number().int().nonnegative(),
    same_day_briefing: z.number().int().nonnegative(),
    passive_queue: z.number().int().nonnegative(),
    silent_log: z.number().int().nonnegative()
  }),
  topActionableItems: z.array(AaliyahReviewQueueItemSchema),
  totalFounderActionableItems: z.number().int().nonnegative()
});

const AaliyahReviewQueueSchema = AaliyahReviewQueueSummarySchema.extend({
  items: z.array(AaliyahReviewQueueItemSchema)
});

const AaliyahSessionIntentTrailEntrySchema = z.object({
  entryId: z.string().min(1),
  sourceSurface: z.enum(["aaliyah_runtime", "aaliyah_admin"]),
  requestId: z.string().min(1).nullable(),
  requestedIntent: z.string().min(1),
  resolvedIntent: z.string().min(1).nullable(),
  activeMode: FounderBriefingModeSchema,
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
    targetMode: FounderBriefingModeSchema.optional()
  }),
  createdAt: z.string().datetime()
});

const AaliyahSessionWorkingItemSchema = z.object({
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
});

const AaliyahSessionReviewContextSchema = z.object({
  reviewItemId: z.string().min(1),
  draftId: z.string().min(1).nullable(),
  accountId: z.string().min(1).nullable(),
  threadId: z.string().min(1).nullable(),
  reviewStatus: z.enum(["pending_review", "approved", "rejected", "revision_requested"]),
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
});

const AaliyahSessionSnapshotSchema = z.object({
  sessionId: z.string().min(1),
  tenantId: z.string().uuid(),
  actorId: z.string().min(1),
  principalContext: z.enum(["founder", "operator"]),
  activeModeState: z.object({
    activeMode: FounderBriefingModeSchema,
    previousMode: FounderBriefingModeSchema.nullable(),
    switchedAt: z.string().datetime(),
    switchReason: z.enum([
      "session_resume",
      "explicit_request",
      "runtime_switch_intent",
      "fallback_to_default",
      "boundary_enforced_reset"
    ]),
    boundaryDecisionId: z.string().min(1).nullable()
  }),
  interactionState: z.object({
    lastInteractionAt: z.string().datetime().nullable(),
    lastIntent: z.string().min(1).nullable(),
    lastResolvedIntent: z.string().min(1).nullable(),
    intentTrail: z.array(AaliyahSessionIntentTrailEntrySchema),
    workingItem: AaliyahSessionWorkingItemSchema.nullable(),
    reviewApprovalContext: AaliyahSessionReviewContextSchema.nullable(),
    pendingDisambiguation: z.object({
      reason: z.string().min(1),
      requestedIntent: z.string().min(1).nullable(),
      createdAt: z.string().datetime()
    }).nullable()
  }),
  retentionPolicy: z.object({
    intentTrailMaxEntries: z.number().int().positive(),
    idleTtlSeconds: z.number().int().positive(),
    hardTtlSeconds: z.number().int().positive(),
    snapshotIntentTrailEntries: z.number().int().positive()
  }),
  expiresAt: z.string().datetime(),
  hardExpiresAt: z.string().datetime(),
  lastResetAt: z.string().datetime().nullable(),
  lastResetReason: z.enum([
    "manual_reset",
    "idle_expired",
    "hard_expired",
    "mode_switch",
    "boundary_violation",
    "ambiguity_reset",
    "working_item_closed"
  ]).nullable(),
  updatedAt: z.string().datetime(),
  version: z.number().int().positive()
});

export const AaliyahPreferenceListResponseSchema = z.object({
  manifestVersion: ManifestVersionSchema,
  resourceType: z.literal("aaliyah_preferences"),
  preferences: AaliyahPreferenceListSchema
});

export const AaliyahPreferenceDetailResponseSchema = z.object({
  manifestVersion: ManifestVersionSchema,
  resourceType: z.literal("aaliyah_preference_detail"),
  preference: AaliyahFounderPreferenceRecordSchema
});

export const AaliyahMemoryBoundaryResponseSchema = z.object({
  manifestVersion: ManifestVersionSchema,
  resourceType: z.literal("aaliyah_memory_boundaries"),
  summary: AaliyahMemoryBoundarySummarySchema
});

export const AaliyahReviewQueueItemIdParamSchema = z.object({
  queueItemId: z.string().min(1)
});

export const AaliyahReviewQueueListResponseSchema = z.object({
  manifestVersion: ManifestVersionSchema,
  resourceType: z.literal("aaliyah_review_queue"),
  queue: AaliyahReviewQueueSchema
});

export const AaliyahReviewQueueDetailResponseSchema = z.object({
  manifestVersion: ManifestVersionSchema,
  resourceType: z.literal("aaliyah_review_queue_item"),
  item: AaliyahReviewQueueItemSchema
});

export const AaliyahInboxQuerySchema = z.object({
  mode: FounderBriefingModeSchema.default("founder")
});

export const AaliyahInboxItemIdParamSchema = z.object({
  itemId: z.string().min(1)
});

const AaliyahInboxItemSchema = z.object({
  inboxItemId: z.string().min(1),
  queueItemId: z.string().min(1),
  sourceSubsystem: AaliyahReviewQueueItemSchema.shape.sourceSubsystem,
  sourceItemId: z.string().min(1),
  itemType: AaliyahReviewQueueItemSchema.shape.itemType,
  title: z.string().min(1),
  summary: z.string().min(1),
  activeMode: FounderBriefingModeSchema,
  urgency: AaliyahReviewQueueItemSchema.shape.urgency,
  risk: AaliyahReviewQueueItemSchema.shape.risk,
  triageClass: z.enum(["act_now", "review_today", "blocked", "stale", "monitor", "resolved_or_terminal"]),
  priorityBand: z.enum(["p0", "p1", "p2", "p3"]),
  reasonCodes: z.array(z.enum([
    "release_blocking_incident",
    "interrupt_now_signal",
    "same_day_attention",
    "founder_attention_required",
    "approval_required",
    "dispatch_ready",
    "pending_review_over_sla",
    "queue_item_over_sla",
    "dispatch_blocked_by_policy",
    "blocked_no_allowed_actions",
    "blocked_missing_next_action",
    "terminal_state",
    "escalation_active",
    "critical_risk",
    "high_risk",
    "low_confidence_wait",
    "next_action_available",
    "monitor_only"
  ])),
  nextFounderAction: z.enum([
    "approve_review_item",
    "reject_review_item",
    "request_revision",
    "dispatch_email",
    "review_voice_escalation",
    "review_incident",
    "review_routing_preview",
    "refresh_briefing",
    "select_new_item",
    "wait",
    "none_terminal"
  ]),
  founderAttentionRequired: z.boolean(),
  interruptionClass: AaliyahReviewQueueItemSchema.shape.interruptionClass,
  confidenceLevel: AaliyahReviewQueueItemSchema.shape.confidenceLevel,
  followThroughStatus: z.enum(["active", "completed", "abandoned", "escalated", "invalidated", "reset"]).nullable(),
  followThroughClosureReason: z.enum([
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
  ]).nullable(),
  nextGovernedAction: z.enum([
    "none_terminal",
    "await_founder_review",
    "dispatch_approved_email",
    "open_voice_escalation",
    "refresh_briefing",
    "select_new_queue_item",
    "resolve_disambiguation"
  ]).nullable(),
  isBlocked: z.boolean(),
  isStale: z.boolean(),
  ageSeconds: z.number().int().nonnegative(),
  provenanceSummary: AaliyahReviewQueueItemSchema.shape.provenanceSummary,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

const AaliyahInboxSummarySchema = z.object({
  inboxId: z.string().min(1),
  generatedAt: z.string().datetime(),
  activeMode: FounderBriefingModeSchema,
  manifestVersion: ManifestVersionSchema,
  totalItems: z.number().int().nonnegative(),
  countsByTriageClass: z.object({
    act_now: z.number().int().nonnegative(),
    review_today: z.number().int().nonnegative(),
    blocked: z.number().int().nonnegative(),
    stale: z.number().int().nonnegative(),
    monitor: z.number().int().nonnegative(),
    resolved_or_terminal: z.number().int().nonnegative()
  }),
  countsByPriorityBand: z.object({
    p0: z.number().int().nonnegative(),
    p1: z.number().int().nonnegative(),
    p2: z.number().int().nonnegative(),
    p3: z.number().int().nonnegative()
  }),
  topActionableItems: z.array(AaliyahInboxItemSchema),
  blockedItems: z.array(AaliyahInboxItemSchema),
  staleItems: z.array(AaliyahInboxItemSchema),
  items: z.array(AaliyahInboxItemSchema)
});

export const AaliyahInboxListResponseSchema = z.object({
  manifestVersion: ManifestVersionSchema,
  resourceType: z.literal("aaliyah_inbox"),
  inbox: AaliyahInboxSummarySchema
});

export const AaliyahInboxItemResponseSchema = z.object({
  manifestVersion: ManifestVersionSchema,
  resourceType: z.literal("aaliyah_inbox_item"),
  item: AaliyahInboxItemSchema
});

export const AaliyahSessionResetBodySchema = z.object({
  scope: z.enum(["soft", "hard"]).optional().default("soft")
});

export const AaliyahSessionSnapshotResponseSchema = z.object({
  manifestVersion: ManifestVersionSchema,
  resourceType: z.literal("aaliyah_session_snapshot"),
  session: AaliyahSessionSnapshotSchema
});

export const AaliyahSessionResetResponseSchema = z.object({
  manifestVersion: ManifestVersionSchema,
  resourceType: z.literal("aaliyah_session_reset"),
  reset: z.object({
    session: AaliyahSessionSnapshotSchema,
    resetReason: z.enum([
      "manual_reset",
      "idle_expired",
      "hard_expired",
      "mode_switch",
      "boundary_violation",
      "ambiguity_reset",
      "working_item_closed"
    ])
  })
});

const AaliyahFollowThroughRecordSchema = z.object({
  tenantId: z.string().uuid(),
  followThroughId: z.string().min(1),
  version: z.number().int().positive(),
  sessionId: z.string().min(1),
  actorId: z.string().min(1),
  principalContext: z.enum(["founder", "operator"]),
  activeMode: FounderBriefingModeSchema,
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
  status: z.enum(["active", "completed", "abandoned", "escalated", "invalidated", "reset"]),
  closureState: z.enum(["active", "completed", "abandoned", "escalated", "invalidated", "reset"]),
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
  ]).nullable(),
  nextGovernedAction: z.enum([
    "none_terminal",
    "await_founder_review",
    "dispatch_approved_email",
    "open_voice_escalation",
    "refresh_briefing",
    "select_new_queue_item",
    "resolve_disambiguation"
  ]),
  founderDeclaredCompletion: z.boolean(),
  downstreamActionRef: z.string().min(1).nullable(),
  escalationTarget: z.string().min(1).nullable(),
  escalationClass: z.enum([
    "founder_attention",
    "operator_review",
    "incident_response",
    "specialist_handoff"
  ]).nullable(),
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
});

const AaliyahFollowThroughHistoryEntrySchema = z.object({
  tenantId: z.string().uuid(),
  eventId: z.string().min(1),
  followThroughId: z.string().min(1),
  action: z.enum(["complete", "abandon", "escalate", "invalidate"]),
  previousStatus: z.enum(["active", "completed", "abandoned", "escalated", "invalidated", "reset"]),
  resultingStatus: z.enum(["active", "completed", "abandoned", "escalated", "invalidated", "reset"]),
  closureState: z.enum(["active", "completed", "abandoned", "escalated", "invalidated", "reset"]),
  closureReason: AaliyahFollowThroughRecordSchema.shape.closureReason.unwrap(),
  nextGovernedAction: AaliyahFollowThroughRecordSchema.shape.nextGovernedAction,
  founderDeclaredCompletion: z.boolean(),
  downstreamActionRef: z.string().min(1).nullable(),
  escalationTarget: z.string().min(1).nullable(),
  escalationClass: AaliyahFollowThroughRecordSchema.shape.escalationClass,
  escalationRationale: z.string().min(1).nullable(),
  escalationProvenance: z.record(z.string(), z.unknown()).nullable(),
  note: z.string().min(1).nullable(),
  actorId: z.string().min(1),
  createdAt: z.string().datetime()
});

export const AaliyahFollowThroughActionBodySchema = z.object({
  queueItemId: z.string().min(1).optional(),
  closureReason: AaliyahFollowThroughHistoryEntrySchema.shape.closureReason,
  closureNote: z.string().min(1).optional(),
  founderDeclaredCompletion: z.boolean().optional(),
  downstreamActionRef: z.string().min(1).optional(),
  escalationTarget: z.string().min(1).optional(),
  escalationClass: AaliyahFollowThroughRecordSchema.shape.escalationClass.optional(),
  escalationRationale: z.string().min(1).optional(),
  escalationProvenance: z.record(z.string(), z.unknown()).optional()
});

export const AaliyahFollowThroughResponseSchema = z.object({
  manifestVersion: ManifestVersionSchema,
  resourceType: z.literal("aaliyah_follow_through"),
  record: AaliyahFollowThroughRecordSchema.nullable()
});

export const AaliyahFollowThroughHistoryResponseSchema = z.object({
  manifestVersion: ManifestVersionSchema,
  resourceType: z.literal("aaliyah_follow_through_history"),
  items: z.array(AaliyahFollowThroughHistoryEntrySchema),
  total: z.number().int().nonnegative()
});

export const AaliyahFollowThroughActionResponseSchema = z.object({
  manifestVersion: ManifestVersionSchema,
  resourceType: z.literal("aaliyah_follow_through_action"),
  result: z.object({
    record: AaliyahFollowThroughRecordSchema,
    historyEntry: AaliyahFollowThroughHistoryEntrySchema,
    nextGovernedAction: AaliyahFollowThroughRecordSchema.shape.nextGovernedAction
  })
});

const AaliyahDiagnosticsWindowSchema = z.enum(["24h", "7d", "30d"]);

export const AaliyahDiagnosticsQuerySchema = z.object({
  window: AaliyahDiagnosticsWindowSchema.default("7d")
});

const AaliyahDriftSignalSchema = z.object({
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
});

const AaliyahDiagnosticsResponseCoreSchema = z.object({
  tenantId: z.string().uuid(),
  principalContext: z.enum(["founder", "operator"]),
  activeMode: z.enum(["founder", "zbestmedia", "mixed"]),
  snapshot: z.object({
    snapshotId: z.string().min(1),
    generatedAt: z.string().datetime(),
    window: AaliyahDiagnosticsWindowSchema,
    windowStartedAt: z.string().datetime(),
    windowEndedAt: z.string().datetime(),
    nextGovernedActionDistribution: z.record(z.string(), z.number().int().nonnegative()),
    followThroughTerminalCounts: z.record(z.string(), z.number().int().nonnegative()),
    reviewQueueLatency: z.object({
      pendingReviewCount: z.number().int().nonnegative(),
      pendingReviewAgeBuckets: z.object({
        under1Hour: z.number().int().nonnegative(),
        oneToFourHours: z.number().int().nonnegative(),
        fourToTwentyFourHours: z.number().int().nonnegative(),
        overTwentyFourHours: z.number().int().nonnegative()
      }),
      oldestPendingReviewAgeSeconds: z.number().int().nonnegative().nullable()
    }),
    closureQuality: z.object({
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
    }),
    interruptionLoad: z.object({
      interruptNowCount: z.number().int().nonnegative(),
      sameDayBriefingCount: z.number().int().nonnegative(),
      passiveQueueCount: z.number().int().nonnegative(),
      silentLogCount: z.number().int().nonnegative(),
      highInterruptionConcentrationWindows: z.array(z.object({
        hourStartedAt: z.string().datetime(),
        interruptNowCount: z.number().int().positive()
      }))
    }),
    sessionReset: z.object({
      softResetCount: z.number().int().nonnegative(),
      hardExpirationCount: z.number().int().nonnegative(),
      disambiguationExpiryCount: z.number().int().nonnegative(),
      staleContextRejectionCount: z.number().int().nonnegative()
    }),
    enforcementTriggers: z.object({
      deniedDueToScopeCount: z.number().int().nonnegative(),
      deniedDueToModeBoundaryCount: z.number().int().nonnegative(),
      lowConfidenceDeferCount: z.number().int().nonnegative(),
      ambiguityFallbackCount: z.number().int().nonnegative(),
      specialistDelegationCount: z.number().int().nonnegative(),
      invalidActionAttemptCount: z.number().int().nonnegative()
    }),
    founderFriction: z.object({
      founderDeclaredCompletionCount: z.number().int().nonnegative(),
      manualResetCount: z.number().int().nonnegative(),
      pendingReviewOverTwentyFourHoursCount: z.number().int().nonnegative(),
      staleContextRejectionCount: z.number().int().nonnegative(),
      openCriticalIncidentCount: z.number().int().nonnegative()
    }),
    driftSignals: z.array(AaliyahDriftSignalSchema),
    sourceMetadata: z.object({
      runtimeEventCount: z.number().int().nonnegative(),
      followThroughHistoryCount: z.number().int().nonnegative(),
      voiceCallCount: z.number().int().nonnegative(),
      pendingReviewCount: z.number().int().nonnegative(),
      incidentCount: z.number().int().nonnegative()
    })
  }),
  attentionFlags: z.array(z.object({
    code: z.string().min(1),
    severity: z.enum(["info", "warning", "critical"]),
    summary: z.string().min(1)
  }))
});

export const AaliyahDiagnosticsResponseSchema = z.object({
  manifestVersion: ManifestVersionSchema,
  resourceType: z.literal("aaliyah_diagnostics"),
  diagnostics: AaliyahDiagnosticsResponseCoreSchema
});

const AaliyahRuntimeIntentSchema = z.enum([
  "get_founder_briefing",
  "get_founder_command_surface",
  "get_quick_actions",
  "execute_quick_action",
  "get_interrupt_queue",
  "get_confidence_summary",
  "get_founder_preferences",
  "get_memory_boundary_summary",
  "get_founder_review_queue",
  "get_founder_queue_item",
  "get_founder_queue_summary",
  "get_session_snapshot",
  "reset_session_context",
  "complete_active_item",
  "abandon_active_item",
  "escalate_active_item",
  "invalidate_active_item",
  "get_active_follow_through",
  "get_follow_through_history",
  "get_prioritized_founder_inbox",
  "get_blocked_founder_items",
  "get_stale_founder_items",
  "get_waiting_approvals",
  "get_email_review_queue",
  "approve_email_review_item",
  "reject_email_review_item",
  "request_email_revision",
  "dispatch_approved_email",
  "get_ops_status",
  "get_incident_summary",
  "switch_mode",
  "preview_routing",
  "process_voice_intake",
  "get_voice_call_summary",
  "get_pending_voice_escalations"
]);

const AaliyahRuntimeModeSchema = FounderBriefingModeSchema;
const AaliyahRuntimeFallbackOutcomeSchema = z.enum([
  "delegate_to_specialist",
  "escalate_for_clarification",
  "deny_due_to_scope",
  "defer_due_to_low_confidence",
  "deny_due_to_mode_boundary"
]);

const AaliyahRuntimeRequestParametersSchema = z.record(z.string(), z.unknown()).default({});

export const AaliyahRuntimeRequestBodySchema = z.object({
  intent: z.string().min(1),
  mode: AaliyahRuntimeModeSchema.optional(),
  parameters: AaliyahRuntimeRequestParametersSchema.optional().default({}),
  idempotencyKey: z.string().min(1).optional()
});

const AaliyahRuntimeProvenanceSchema = z.object({
  manifestVersion: ManifestVersionSchema,
  aaliyahRegistryVersion: z.string().min(1),
  requestId: z.string().min(1).nullable(),
  generatedAt: z.string().datetime(),
  invokedSurface: z.string().min(1),
  enforcement: z.object({
    requestedAgentId: z.string().min(1),
    requestedAtomicTaskId: z.string().min(1).nullable(),
    resolvedAgentId: z.string().min(1),
    resolvedAtomicTaskId: z.string().min(1),
    confidence: z.enum(["high", "medium", "low"]),
    company: z.string().min(1),
    mode: z.string().min(1),
    principalContext: z.enum(["founder", "operator"]),
    approvalState: z.enum(["not_required", "required_missing", "approved"]),
    approvalClass: z.enum(["orchestration_only", "always_required", "operator_action_required", "system_guarded"]),
    reason: z.string().min(1)
  })
});

const AaliyahApprovalQueuePayloadSchema = z.object({
  items: z.array(EmailDraftReviewRecordSchema),
  totalPending: z.number().int().nonnegative()
});

const AaliyahReviewActionPayloadSchema = z.object({
  action: z.enum(["approve", "reject", "request_revision"]),
  item: EmailDraftReviewRecordSchema
});

const AaliyahModeSwitchPayloadSchema = z.object({
  previousMode: AaliyahRuntimeModeSchema,
  activeMode: AaliyahRuntimeModeSchema,
  supportedCategories: z.array(
    z.object({
      category: RoutingTaskCategorySchema,
      responsibilityKey: ResponsibilityKeySchema.nullable(),
      operationalSignalType: OperationalSignalTypeSchema.nullable(),
      requiresDisambiguation: z.boolean(),
      supported: z.boolean(),
      supportedJingleModes: z.array(JingleRoutingModeSchema).optional()
    })
  )
});

const AaliyahRoutingPreviewPayloadSchema = z.object({
  category: RoutingTaskCategorySchema,
  jingleMode: JingleRoutingModeSchema.optional(),
  decision: RoutingResolveResponseSchema.shape.decision
});

const VoiceSummarySchema = z.object({
  callerDisplay: z.string().min(1),
  intent: VoiceCallRecordSchema.shape.intent,
  urgency: VoiceCallRecordSchema.shape.urgency,
  riskLevel: VoiceCallRecordSchema.shape.riskLevel,
  companyMode: VoiceCallRecordSchema.shape.companyMode,
  routingTarget: VoiceCallRecordSchema.shape.routingTarget,
  recommendedNextAction: z.string().min(1),
  founderAttentionRequired: z.boolean(),
  interruptionClass: VoiceCallRecordSchema.shape.interruptionClass
});

const VoiceProcessingResultSchema = z.object({
  call: VoiceCallRecordSchema,
  summary: VoiceSummarySchema
});

const VoiceEscalationsPayloadSchema = z.object({
  items: z.array(VoiceCallRecordSchema),
  totalPending: z.number().int().nonnegative()
});

const AaliyahQuickActionsPayloadSchema = z.object({
  items: z.array(AaliyahQuickActionSchema)
});

const AaliyahRuntimeSuccessSchema = z.object({
  runtimeRequestId: z.string().min(1),
  resolvedIntent: AaliyahRuntimeIntentSchema,
  outcomeType: z.literal("completed"),
  activeMode: AaliyahRuntimeModeSchema,
  payloadType: z.enum([
    "founder_briefing",
    "approval_queue",
    "email_review_queue",
    "email_review_action",
    "email_dispatch_result",
    "ops_status",
    "incident_summary",
    "mode_switch",
    "routing_preview",
    "voice_call_result",
    "voice_call_summary",
    "voice_escalations",
    "founder_command_surface",
    "quick_actions",
    "interrupt_queue",
    "confidence_summary",
    "founder_preferences",
    "memory_boundary_summary",
    "founder_review_queue",
    "founder_queue_item",
    "founder_queue_summary",
    "session_snapshot",
    "session_reset",
    "follow_through_active",
    "follow_through_action",
    "follow_through_history",
    "founder_inbox",
    "blocked_founder_items",
    "stale_founder_items"
  ]),
  payload: z.union([
    FounderBriefingSchema,
    AaliyahCommandSurfaceSchema,
    AaliyahQuickActionsPayloadSchema,
    AaliyahInterruptionSummarySchema,
    AaliyahConfidenceSummarySchema,
    AaliyahPreferenceListSchema,
    AaliyahMemoryBoundarySummarySchema,
    AaliyahReviewQueueSchema,
    AaliyahReviewQueueItemSchema,
    AaliyahReviewQueueSummarySchema,
    AaliyahSessionSnapshotSchema,
    AaliyahSessionResetResponseSchema.shape.reset,
    AaliyahFollowThroughRecordSchema.nullable(),
    AaliyahFollowThroughActionResponseSchema.shape.result,
    AaliyahFollowThroughHistoryResponseSchema.pick({ items: true, total: true }),
    AaliyahInboxSummarySchema,
    z.object({ items: z.array(AaliyahInboxItemSchema), total: z.number().int().nonnegative() }),
    AaliyahApprovalQueuePayloadSchema,
    AaliyahReviewActionPayloadSchema,
    z.object({
      sent: z.boolean(),
      dispatch: EmailDispatchRecordSchema
    }),
    OpsStatusSummaryResponseSchema.shape.summary,
    OpsIncidentSummaryResponseSchema.shape.summary,
    AaliyahModeSwitchPayloadSchema,
    AaliyahRoutingPreviewPayloadSchema,
    VoiceProcessingResultSchema,
    VoiceCallRecordSchema,
    VoiceEscalationsPayloadSchema
  ]),
  provenance: AaliyahRuntimeProvenanceSchema,
  fallback: z.null()
});

const AaliyahRuntimeFallbackSchema = z.object({
  runtimeRequestId: z.string().min(1),
  resolvedIntent: AaliyahRuntimeIntentSchema.nullable(),
  outcomeType: z.literal("fallback"),
  activeMode: AaliyahRuntimeModeSchema,
  payloadType: z.null(),
  payload: z.null(),
  provenance: AaliyahRuntimeProvenanceSchema,
  fallback: z.object({
    outcome: AaliyahRuntimeFallbackOutcomeSchema,
    reason: z.string().min(1),
    delegateToAgentId: z.string().min(1).nullable()
  })
});

export const AaliyahRuntimeResponseSchema = z.object({
  manifestVersion: ManifestVersionSchema,
  resourceType: z.literal("aaliyah_runtime_result"),
  result: z.union([AaliyahRuntimeSuccessSchema, AaliyahRuntimeFallbackSchema])
});

export const VoiceIntakeResponseSchema = z.object({
  manifestVersion: ManifestVersionSchema,
  resourceType: z.literal("voice_intake_result"),
  result: VoiceProcessingResultSchema
});

export const VoiceCallDetailResponseSchema = z.object({
  manifestVersion: ManifestVersionSchema,
  resourceType: z.literal("voice_call_detail"),
  call: VoiceCallRecordSchema
});

export const VoiceEscalationListResponseSchema = z.object({
  manifestVersion: ManifestVersionSchema,
  resourceType: z.literal("voice_escalation_list"),
  items: z.array(VoiceCallRecordSchema)
});

export const ExecutiveIdParamSchema = z.object({
  executiveId: ExecutiveIdSchema
});

export const DepartmentIdParamSchema = z.object({
  departmentId: DepartmentIdSchema
});

export const OrgAgentIdParamSchema = z.object({
  agentId: OrgAgentIdSchema
});

export const ResponsibilityKeyParamSchema = z.object({
  responsibilityKey: ResponsibilityKeySchema
});

export const OperationalSignalParamSchema = z.object({
  signalType: OperationalSignalTypeSchema
});

export const IncidentIdParamSchema = z.object({
  incidentId: z.string().min(1)
});
