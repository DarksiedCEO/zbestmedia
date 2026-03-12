import type { AgentId } from "../agents/registry.js";
import type { ApprovalWorkflowService } from "../approvals/service.js";
import type { AgentOsRepository } from "../persistence/repository.js";
import type { ExecutionRecord } from "../persistence/contracts.js";
import { AgentOrgPolicyService } from "../org/policy.js";
import {
  buildDeterministicExecutionOutput,
  DeterministicAgentPromptExecutor,
  type AgentPromptExecutor
} from "./promptExecutor.js";

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

export class AgentExecutionService {
  constructor(
    private readonly repository: AgentOsRepository,
    private readonly approvals: ApprovalWorkflowService,
    private readonly promptExecutor: AgentPromptExecutor = new DeterministicAgentPromptExecutor(),
    private readonly orgPolicy: AgentOrgPolicyService = new AgentOrgPolicyService()
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
    this.orgPolicy.assertExecutionAgentResponsibility({
      agentId: args.agentId,
      subjectType: args.subjectType,
      payload: args.payload
    });

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

    const output = await this.promptExecutor.execute({
      tenantId: args.tenantId,
      agentId: args.agentId,
      correlationId: args.correlationId,
      payload: args.payload
    });

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
