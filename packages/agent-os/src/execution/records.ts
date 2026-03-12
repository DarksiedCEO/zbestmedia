import { z } from "zod";

import { RoutingDecisionSchema, RoutingTaskCategorySchema } from "../org/routing-types.js";
import { DepartmentIdSchema, ExecutiveIdSchema, LeadAgentIdSchema, SubAgentIdSchema } from "../org/types.js";
import type { AssignmentPolicyDecision, AssignmentRecord, ExecutionRunRecord, ExecutionRunState } from "./record-types.js";

export const AssignmentPolicyDecisionSchema = z.enum(["approved", "rejected"]);
export const ExecutionRunStateSchema = z.enum([
  "requested",
  "validated",
  "routed",
  "blocked",
  "executing",
  "retriable",
  "succeeded",
  "failed"
]);

export const AssignmentRecordSchema = z.object({
  tenantId: z.string().uuid(),
  assignmentRecordId: z.string().min(1),
  manifestVersion: z.string().min(1),
  correlationId: z.string().min(1),
  requestSource: z.string().min(1),
  requestedBy: z.string().min(1),
  requestedTaskCategory: RoutingTaskCategorySchema.nullable(),
  requestedResponsibilityKey: z.string().nullable(),
  requestMetadata: z.record(z.string(), z.unknown()),
  requestedExecutionTarget: z.string().nullable(),
  resolvedExecutiveId: ExecutiveIdSchema.nullable(),
  resolvedDepartmentId: DepartmentIdSchema.nullable(),
  resolvedLeadAgentId: LeadAgentIdSchema.nullable(),
  resolvedSubAgentId: SubAgentIdSchema.nullable(),
  executionAgentId: z.string().nullable(),
  policyDecision: AssignmentPolicyDecisionSchema,
  policyDecisionReason: z.string().min(1),
  routingDecision: RoutingDecisionSchema.nullable(),
  routingTrace: z.array(z.string().min(1)),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export const ExecutionRunRecordSchema = z.object({
  tenantId: z.string().uuid(),
  runRecordId: z.string().min(1),
  assignmentRecordId: z.string().min(1),
  executionId: z.string().nullable(),
  currentState: ExecutionRunStateSchema,
  requestedAt: z.string().datetime(),
  validatedAt: z.string().datetime().nullable(),
  routedAt: z.string().datetime().nullable(),
  blockedAt: z.string().datetime().nullable(),
  executionStartedAt: z.string().datetime().nullable(),
  retriableAt: z.string().datetime().nullable(),
  executionEndedAt: z.string().datetime().nullable(),
  failureCategory: z.string().nullable(),
  failureMessage: z.string().nullable(),
  retryable: z.boolean(),
  metadata: z.record(z.string(), z.unknown()),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export type AssignmentPolicyDecisionType = AssignmentPolicyDecision;
export type AssignmentRecordType = AssignmentRecord;
export type ExecutionRunStateType = ExecutionRunState;
export type ExecutionRunRecordType = ExecutionRunRecord;
