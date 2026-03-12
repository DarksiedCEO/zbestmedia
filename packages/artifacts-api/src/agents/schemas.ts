import { z } from "zod";

import { AgentLifecycleStatusSchema, AgentTaskDomainSchema } from "@zbest/agent-os";

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
