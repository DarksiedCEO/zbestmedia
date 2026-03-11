import { z } from "zod";

import { AgentTaskDomainSchema } from "../agents/domains.js";
import type { AgentId } from "../agents/registry.js";
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

export const OrchestrationOpsSnapshotTypeSchema = z.enum(["worker_freshness", "alerts"]);
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
