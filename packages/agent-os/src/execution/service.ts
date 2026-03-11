import { getAgentDefinition, type AgentId } from "../agents/registry.js";
import type { ApprovalWorkflowService } from "../approvals/service.js";
import { AGENT_EVAL_PROFILES } from "../evals/specs.js";
import { AGENT_MEMORY_PARTITIONS } from "../memory/partitions.js";
import { AGENT_POLICY_PROFILES } from "../policy/profiles.js";
import type { AgentOsRepository } from "../persistence/repository.js";
import type { ExecutionRecord } from "../persistence/contracts.js";
import { AGENT_HANDOFFS, MAESTRO_DELEGATION_GRAPH } from "../workflows/routing.js";

export type AgentExecutionInput = {
  tenantId: string;
  agentId: AgentId;
  actorId: string;
  correlationId: string;
  requestSource: string;
  subjectType: string;
  subjectId: string;
  payload: Record<string, unknown>;
  queueForWorker?: boolean;
  createdAt?: string;
};

type PromptAlignedExecutionOutput = {
  summary: string;
  actions: string[];
  risks: string[];
  approvalRequired: boolean;
  handoffTarget: AgentId | null;
  evidence: string[];
};

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.length > 0) : [];
}

function nextHandoffTarget(agentId: AgentId, payload: Record<string, unknown>): AgentId | null {
  if (agentId === "maestro") {
    const delegatedAgents = Array.isArray(payload.delegatedAgents)
      ? payload.delegatedAgents.filter((item): item is AgentId => typeof item === "string")
      : [];
    return delegatedAgents[0] ?? null;
  }

  const next = AGENT_HANDOFFS[agentId];
  return next?.[0] ?? null;
}

function summarizeObjective(payload: Record<string, unknown>) {
  if (typeof payload.objective === "string" && payload.objective.trim().length > 0) {
    return payload.objective.trim();
  }
  if (typeof payload.subjectSummary === "string" && payload.subjectSummary.trim().length > 0) {
    return payload.subjectSummary.trim();
  }
  return null;
}

export function buildDeterministicExecutionOutput(agentId: AgentId, payload: Record<string, unknown>): PromptAlignedExecutionOutput {
  const definition = getAgentDefinition(agentId);
  const policy = AGENT_POLICY_PROFILES[agentId];
  const memory = AGENT_MEMORY_PARTITIONS[agentId];
  const evalProfile = AGENT_EVAL_PROFILES[agentId];
  const objective = summarizeObjective(payload);
  const actions = [
    objective
      ? `Execute ${definition.taskDomain} objective: ${objective}`
      : `Advance ${definition.displayName}'s ${definition.taskDomain} work within policy`,
    `Apply policy profile ${policy.profileId} without crossing denied capabilities`,
    `Use memory partition ${memory.partitionId} and preserve eval profile ${evalProfile.profileId}`
  ];

  const risks = [
    `Denied capabilities: ${policy.denied.join(", ")}`,
    `Prohibited domains: ${definition.prohibitedDomains.join(", ")}`
  ];

  const evidence = [
    `allowedCapabilities=${policy.allowed.join(", ")}`,
    `memoryCollections=${memory.ownedCollections.join(", ")}`,
    `evalMetrics=${evalProfile.metrics.map((metric) => metric.metric).join(", ")}`
  ];

  if (agentId === "maestro") {
    const delegatedAgents = asStringArray(payload.delegatedAgents);
    const routedWorkflow = typeof payload.routedWorkflow === "string" ? payload.routedWorkflow : "unknown_workflow";
    actions[0] = `Route workflow ${routedWorkflow} across delegated agents: ${delegatedAgents.join(" -> ") || "none"}`;
    evidence.push(`delegationTargets=${MAESTRO_DELEGATION_GRAPH.maestro.join(", ")}`);
  }

  return {
    summary: `${definition.displayName} executed ${definition.taskDomain} as ${definition.workflowRole}.`,
    actions,
    risks,
    approvalRequired: false,
    handoffTarget: nextHandoffTarget(agentId, payload),
    evidence
  };
}

export class AgentExecutionService {
  constructor(
    private readonly repository: AgentOsRepository,
    private readonly approvals: ApprovalWorkflowService
  ) {}

  async execute(args: AgentExecutionInput): Promise<
    | {
        execution: ExecutionRecord;
        approvalRequired: true;
        approvalRequestId: string;
        requiredApprovers: string[];
        reason: string;
      }
    | {
        execution: ExecutionRecord;
        approvalRequired: false;
        output: Record<string, unknown>;
      }
  > {
    const approval = await this.approvals.ensureApproval({
      tenantId: args.tenantId,
      agentId: args.agentId,
      subjectType: args.subjectType,
      subjectId: args.subjectId,
      actorId: args.actorId,
      payload: args.payload,
      createdAt: args.createdAt
    });

    if (approval.approvalRequired) {
      const execution = await this.repository.createExecution({
        tenantId: args.tenantId,
        agentId: args.agentId,
        correlationId: args.correlationId,
        requestSource: args.requestSource,
        requestedBy: args.actorId,
        subjectType: args.subjectType,
        subjectId: args.subjectId,
        inputPayload: args.payload,
        status: "PENDING_APPROVAL",
        approvalRequestId: approval.approvalRequestId,
        createdAt: args.createdAt
      });

      await this.repository.appendExecutionStep({
        tenantId: args.tenantId,
        executionId: execution.executionId,
        stepName: "approval_required",
        stepOrder: 1,
        status: "PENDING",
        payload: {
          approvalRequestId: approval.approvalRequestId,
          requiredApprovers: approval.requiredApprovers,
          reason: approval.reason
        },
        createdAt: args.createdAt
      });

      return {
        execution,
        approvalRequired: true,
        approvalRequestId: approval.approvalRequestId,
        requiredApprovers: approval.requiredApprovers,
        reason: approval.reason
      };
    }

    if (args.queueForWorker) {
      const execution = await this.repository.createExecution({
        tenantId: args.tenantId,
        agentId: args.agentId,
        correlationId: args.correlationId,
        requestSource: args.requestSource,
        requestedBy: args.actorId,
        subjectType: args.subjectType,
        subjectId: args.subjectId,
        inputPayload: args.payload,
        status: "QUEUED",
        createdAt: args.createdAt
      });

      await this.repository.appendExecutionStep({
        tenantId: args.tenantId,
        executionId: execution.executionId,
        stepName: "execution_queued",
        stepOrder: 1,
        status: "PENDING",
        payload: { queuedForWorker: true },
        createdAt: args.createdAt
      });

      return {
        execution,
        approvalRequired: false,
        output: { queued: true }
      };
    }

    const execution = await this.repository.createExecution({
      tenantId: args.tenantId,
      agentId: args.agentId,
      correlationId: args.correlationId,
      requestSource: args.requestSource,
      requestedBy: args.actorId,
      subjectType: args.subjectType,
      subjectId: args.subjectId,
      inputPayload: args.payload,
      status: "RUNNING",
      createdAt: args.createdAt
    });

    await this.repository.appendExecutionStep({
      tenantId: args.tenantId,
      executionId: execution.executionId,
      stepName: "execution_started",
      stepOrder: 1,
      status: "COMPLETED",
      payload: { agentId: args.agentId },
      createdAt: args.createdAt
    });

    const output = buildDeterministicExecutionOutput(args.agentId, args.payload);

    await this.repository.appendExecutionStep({
      tenantId: args.tenantId,
      executionId: execution.executionId,
      stepName: "execution_completed",
      stepOrder: 2,
      status: "COMPLETED",
      payload: output,
      createdAt: args.createdAt
    });
    await this.repository.completeExecution({
      tenantId: args.tenantId,
      executionId: execution.executionId,
      outputPayload: output,
      completedAt: args.createdAt
    });

    return {
      execution: {
        ...execution,
        status: "COMPLETED",
        outputPayload: output,
        completedAt: args.createdAt ?? new Date().toISOString(),
        updatedAt: args.createdAt ?? new Date().toISOString()
      },
      approvalRequired: false,
      output
    };
  }
}
