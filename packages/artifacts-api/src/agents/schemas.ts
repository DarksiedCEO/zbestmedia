import { z } from "zod";

import { AgentLifecycleStatusSchema, AgentTaskDomainSchema } from "@zbest/agent-os";

export const AgentIdParamSchema = z.object({
  agentId: z.enum(["brandyn", "jordyn", "kobe"])
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
  agentId: z.enum(["brandyn", "jordyn", "kobe"]).optional(),
  status: z.enum(["PENDING", "APPROVED", "REJECTED"]).optional()
});

export const ApprovalRequestIdParamSchema = z.object({
  approvalRequestId: z.string().min(1)
});

export const ExecutionIdParamSchema = z.object({
  executionId: z.string().min(1)
});

export const ExecutionListQuerySchema = z.object({
  agentId: z.enum(["brandyn", "jordyn", "kobe"]).optional(),
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
  agentId: z.enum(["brandyn", "jordyn", "kobe"]).optional(),
  limit: z.number().int().positive().max(50).default(10)
});

export const WorkerQueueEvalBodySchema = z.object({
  agentId: z.enum(["brandyn", "jordyn", "kobe"]),
  suiteName: z.string().min(1)
});

export const WorkerClaimEvalsBodySchema = z.object({
  agentId: z.enum(["brandyn", "jordyn", "kobe"]).optional(),
  limit: z.number().int().positive().max(50).default(10)
});

export const BrandPipelineAdvanceBodySchema = z.object({
  subjectId: z.string().min(1),
  completedSteps: z.array(
    z.enum([
      "brandyn_direction_approved",
      "jordyn_visual_alignment_approved",
      "kobe_distribution_queued",
      "oracle_performance_evaluated",
      "titan_monetization_feedback_recorded"
    ])
  ),
  nextStep: z.enum([
    "brandyn_direction_approved",
    "jordyn_visual_alignment_approved",
    "kobe_distribution_queued"
  ]),
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
