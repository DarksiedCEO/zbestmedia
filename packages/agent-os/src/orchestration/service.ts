import type { AgentExecutionService } from "../execution/service.js";
import type { ApprovalEscalationService } from "../approvals/escalation.js";
import { getApprovalEscalationPolicy } from "../approvals/escalationProfiles.js";
import type { AgentId } from "../agents/registry.js";
import { canDelegateTo, canHandOffTo } from "../workflows/routing.js";
import type { AgentOsRepository } from "../persistence/repository.js";

export class MaestroOrchestrationError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export type OrchestrationWorkflowId = "brand_pipeline";

const WORKFLOW_DEFAULT_DELEGATION: Record<OrchestrationWorkflowId, AgentId[]> = {
  brand_pipeline: ["brandyn", "jordyn", "kobe", "oracle", "titan"]
};

function buildHandoffPlan(workflow: OrchestrationWorkflowId, delegatedAgents: AgentId[]) {
  if (workflow !== "brand_pipeline") {
    throw new MaestroOrchestrationError("unsupported_workflow");
  }

  const handoffs: Array<{ fromAgent: AgentId; toAgent: AgentId }> = [];
  for (let i = 0; i < delegatedAgents.length - 1; i += 1) {
    const fromAgent = delegatedAgents[i]!;
    const toAgent = delegatedAgents[i + 1]!;
    if (fromAgent !== "maestro" && !canHandOffTo(fromAgent as Exclude<AgentId, "maestro">, toAgent)) {
      throw new MaestroOrchestrationError(`invalid_handoff:${fromAgent}->${toAgent}`);
    }
    handoffs.push({ fromAgent, toAgent });
  }

  return handoffs;
}

export class MaestroOrchestrationService {
  constructor(
    private readonly repository: AgentOsRepository,
    private readonly executionService: AgentExecutionService,
    private readonly approvalEscalation: ApprovalEscalationService
  ) {}

  async createDelegatedPlan(args: {
    tenantId: string;
    actorId: string;
    correlationId: string;
    requestSource: string;
    workflow: OrchestrationWorkflowId;
    subjectId: string;
    payload: Record<string, unknown>;
    delegatedAgents?: AgentId[];
    queueForWorker?: boolean;
    createdAt?: string;
  }) {
    const delegatedAgents = args.delegatedAgents ?? WORKFLOW_DEFAULT_DELEGATION[args.workflow];

    for (const agentId of delegatedAgents) {
      if (!canDelegateTo("maestro", agentId)) {
        throw new MaestroOrchestrationError(`invalid_delegate:${agentId}`);
      }
    }

    const handoffPlan = buildHandoffPlan(args.workflow, delegatedAgents);
    const execution = await this.executionService.execute({
      tenantId: args.tenantId,
      agentId: "maestro",
      actorId: args.actorId,
      correlationId: args.correlationId,
      requestSource: args.requestSource,
      subjectType: "orchestration_workflow",
      subjectId: args.subjectId,
      payload: {
        routedWorkflow: args.workflow,
        delegatedAgents,
        handoffPlan,
        ...args.payload
      },
      queueForWorker: args.queueForWorker,
      createdAt: args.createdAt
    });

    for (const [index, handoff] of handoffPlan.entries()) {
      await this.repository.appendExecutionStep({
        tenantId: args.tenantId,
        executionId: execution.execution.executionId,
        stepName: `handoff_planned:${handoff.fromAgent}->${handoff.toAgent}`,
        stepOrder: 10 + index,
        status: "COMPLETED",
        payload: handoff,
        createdAt: args.createdAt
      });
    }

    return {
      workflow: args.workflow,
      delegatedAgents,
      handoffPlan,
      execution
    };
  }

  async getHandoffAudit(args: {
    tenantId: string;
    executionId: string;
  }) {
    const execution = await this.repository.getExecution({
      tenantId: args.tenantId,
      executionId: args.executionId
    });

    if (!execution) {
      return null;
    }

    return {
      execution: execution.execution,
      handoffs: execution.steps.filter((step) => step.stepName.startsWith("handoff_planned:"))
    };
  }

  async getWorkflowExecution(args: {
    tenantId: string;
    executionId: string;
  }) {
    const execution = await this.repository.getExecution(args);
    if (!execution || execution.execution.agentId !== "maestro") {
      return null;
    }
    return execution;
  }

  async listWorkflowExecutions(args: {
    tenantId: string;
    status?: "QUEUED" | "PENDING_APPROVAL" | "RUNNING" | "COMPLETED" | "FAILED";
    deadLetteredOnly?: boolean;
  }) {
    const items = await this.repository.listExecutions({
      tenantId: args.tenantId,
      agentId: "maestro",
      status: args.status
    });

    return args.deadLetteredOnly ? items.filter((item) => item.deadLetteredAt) : items;
  }

  async escalateApprovals(args: {
    tenantId: string;
    olderThanMinutes: number;
    agentId?: AgentId;
  }) {
    const olderThanIso = new Date(Date.now() - args.olderThanMinutes * 60_000).toISOString();
    return this.approvalEscalation.escalateStaleRequests({
      tenantId: args.tenantId,
      olderThanIso,
      agentId: args.agentId
    });
  }

  async buildApprovalSlaReport(args: {
    tenantId: string;
    olderThanMinutes: number;
    agentId?: AgentId;
  }) {
    const olderThanIso = new Date(Date.now() - args.olderThanMinutes * 60_000).toISOString();
    const pending = await this.repository.listApprovalRequests({
      tenantId: args.tenantId,
      agentId: args.agentId,
      status: "PENDING"
    });
    const stale = await this.repository.listStaleApprovalRequests({
      tenantId: args.tenantId,
      olderThanIso,
      agentId: args.agentId
    });

    const byAgent = pending.reduce<Record<string, { pending: number; stale: number; escalated: number }>>((acc, item) => {
      const bucket = (acc[item.agentId] ??= { pending: 0, stale: 0, escalated: 0 });
      bucket.pending += 1;
      if (item.escalatedAt) {
        bucket.escalated += 1;
      }
      return acc;
    }, {});

    for (const item of stale) {
      const bucket = (byAgent[item.agentId] ??= { pending: 0, stale: 0, escalated: 0 });
      bucket.stale += 1;
    }

    return {
      olderThanMinutes: args.olderThanMinutes,
      totals: {
        pending: pending.length,
        stale: stale.length,
        escalated: pending.filter((item) => item.escalatedAt).length
      },
      byAgent,
      policies: Object.fromEntries(
        Object.keys(byAgent).map((agentId) => [agentId, getApprovalEscalationPolicy(agentId as AgentId)])
      )
    };
  }

  async buildReplayBundle(args: {
    tenantId: string;
    executionId: string;
  }) {
    const execution = await this.getWorkflowExecution(args);
    if (!execution) {
      return null;
    }

    const handoffs = execution.steps.filter(
      (step) =>
        step.stepName.startsWith("handoff_planned:") || step.stepName.startsWith("handoff_executed:")
    );

    return {
      execution: execution.execution,
      replay: {
        workflow: execution.execution.inputPayload.routedWorkflow ?? null,
        delegatedAgents: execution.execution.inputPayload.delegatedAgents ?? [],
        subjectType: execution.execution.subjectType,
        subjectId: execution.execution.subjectId,
        inputPayload: execution.execution.inputPayload,
        outputPayload: execution.execution.outputPayload,
        failureClass: execution.execution.failureClass,
        failureMessage: execution.execution.failureMessage,
        retryCount: execution.execution.retryCount,
        deadLetteredAt: execution.execution.deadLetteredAt
      },
      handoffs,
      auditTrail: execution.steps
    };
  }

  async requestDeadLetterReplayApproval(args: {
    tenantId: string;
    executionId: string;
    actorId: string;
    createdAt?: string;
  }) {
    const execution = await this.getWorkflowExecution({
      tenantId: args.tenantId,
      executionId: args.executionId
    });
    if (!execution) {
      return null;
    }
    if (!execution.execution.deadLetteredAt) {
      throw new MaestroOrchestrationError("execution_not_dead_lettered");
    }

    return this.repository.createApprovalRequest({
      tenantId: args.tenantId,
      agentId: "maestro",
      subjectType: "orchestration_dead_letter_replay",
      subjectId: args.executionId,
      requestedBy: args.actorId,
      requiredApprovers: ["ops_lead", "platform_owner"],
      payload: {
        executionId: args.executionId,
        retryCount: execution.execution.retryCount,
        failureClass: execution.execution.failureClass,
        failureMessage: execution.execution.failureMessage
      },
      createdAt: args.createdAt
    });
  }

  async requeueDeadLetteredExecution(args: {
    tenantId: string;
    executionId: string;
    actorId: string;
    approvalRequestId: string;
    createdAt?: string;
  }) {
    const execution = await this.getWorkflowExecution({
      tenantId: args.tenantId,
      executionId: args.executionId
    });
    if (!execution) {
      return null;
    }
    if (!execution.execution.deadLetteredAt) {
      throw new MaestroOrchestrationError("execution_not_dead_lettered");
    }

    const approval = await this.repository.getApprovalRequest({
      tenantId: args.tenantId,
      approvalRequestId: args.approvalRequestId
    });
    if (
      !approval ||
      approval.request.status !== "APPROVED" ||
      approval.request.subjectType !== "orchestration_dead_letter_replay" ||
      approval.request.subjectId !== args.executionId
    ) {
      throw new MaestroOrchestrationError("replay_approval_required");
    }

    const policy = getApprovalEscalationPolicy("maestro");
    if (approval.request.escalationCount > policy.maxEscalations) {
      throw new MaestroOrchestrationError("replay_approval_escalation_exhausted");
    }
    if (!approval.request.resolvedAt) {
      throw new MaestroOrchestrationError("replay_approval_unresolved");
    }

    const resolvedAtMs = Date.parse(approval.request.resolvedAt);
    const nowMs = Date.parse(args.createdAt ?? new Date().toISOString());
    if (!Number.isFinite(resolvedAtMs) || nowMs - resolvedAtMs > policy.staleAfterMinutes * 60_000) {
      throw new MaestroOrchestrationError("replay_approval_expired");
    }

    const requeued = await this.repository.requeueExecution({
      tenantId: args.tenantId,
      executionId: args.executionId,
      updatedAt: args.createdAt
    });
    await this.repository.appendExecutionStep({
      tenantId: args.tenantId,
      executionId: args.executionId,
      stepName: "execution_requeued",
      stepOrder: 100,
      status: "COMPLETED",
      payload: { requeuedBy: args.actorId },
      createdAt: args.createdAt
    });

    return requeued;
  }

  async getDiagnostics(args: {
    tenantId: string;
    olderThanMinutes: number;
  }) {
    const executions = await this.listWorkflowExecutions({
      tenantId: args.tenantId
    });
    const approvalSla = await this.buildApprovalSlaReport({
      tenantId: args.tenantId,
      olderThanMinutes: args.olderThanMinutes
    });

    const executionStatusCounts = executions.reduce<Record<string, number>>((acc, item) => {
      acc[item.status] = (acc[item.status] ?? 0) + 1;
      return acc;
    }, {});

    const failureCounts = executions.reduce<Record<string, number>>((acc, item) => {
      if (item.failureClass) {
        acc[item.failureClass] = (acc[item.failureClass] ?? 0) + 1;
      }
      return acc;
    }, {});

    return {
      executions: {
        total: executions.length,
        deadLettered: executions.filter((item) => item.deadLetteredAt).length,
        queuedRetries: executions.filter((item) => item.status === "QUEUED" && item.retryCount > 0).length,
        pendingApproval: executions.filter((item) => item.status === "PENDING_APPROVAL").length,
        byStatus: executionStatusCounts,
        byFailureClass: failureCounts
      },
      approvalSla
    };
  }

  async getOperationsInventory(args: {
    tenantId: string;
  }) {
    const executions = await this.listWorkflowExecutions({
      tenantId: args.tenantId
    });

    return {
      deadLettered: executions
        .filter((item) => item.deadLetteredAt)
        .map((item) => ({
          executionId: item.executionId,
          status: item.status,
          failureClass: item.failureClass,
          retryCount: item.retryCount,
          deadLetteredAt: item.deadLetteredAt
        })),
      retryQueue: executions
        .filter((item) => item.status === "QUEUED" && (item.retryCount > 0 || item.nextRetryAt))
        .map((item) => ({
          executionId: item.executionId,
          status: item.status,
          retryCount: item.retryCount,
          nextRetryAt: item.nextRetryAt,
          maxRetries: item.maxRetries
        }))
    };
  }
}
