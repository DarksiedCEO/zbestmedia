import type { AgentExecutionService } from "../execution/service.js";
import type { ApprovalEscalationService } from "../approvals/escalation.js";
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
}
