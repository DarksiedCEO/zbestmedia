import { z } from "zod";

import {
  AGENT_ORG_MANIFEST_VERSION,
  AgentLifecycleStatusSchema,
  AgentTaskDomainSchema,
  AssignmentRecordSchema,
  EmailAccountConnectionRecordSchema,
  EmailDispatchRecordSchema,
  EmailDraftReviewRecordSchema,
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

const AaliyahRuntimeIntentSchema = z.enum([
  "get_founder_briefing",
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
  parameters: AaliyahRuntimeRequestParametersSchema.optional().default({})
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
    "voice_escalations"
  ]),
  payload: z.union([
    FounderBriefingSchema,
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
