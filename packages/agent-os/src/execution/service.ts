import type { AgentId } from "../agents/registry.js";
import type { ApprovalWorkflowService } from "../approvals/service.js";
import type { AgentOsRepository } from "../persistence/repository.js";
import type { ExecutionRecord } from "../persistence/contracts.js";

export type AgentExecutionInput = {
  tenantId: string;
  agentId: AgentId;
  actorId: string;
  correlationId: string;
  requestSource: string;
  subjectType: string;
  subjectId: string;
  payload: Record<string, unknown>;
  createdAt?: string;
};

function buildDeterministicOutput(agentId: AgentId, payload: Record<string, unknown>) {
  switch (agentId) {
    case "brandyn":
      return {
        kind: "brand_governance_output",
        messagingPillars: payload.messagingPillars ?? [],
        toneGuardrails: payload.toneGuardrails ?? [],
        recommendedTaglineDirection: payload.taglineDirection ?? null
      };
    case "jordyn":
      return {
        kind: "visual_governance_output",
        typographyRules: payload.typographyRules ?? [],
        colorGuidance: payload.colorGuidance ?? [],
        assetQaChecklist: payload.assetQaChecklist ?? []
      };
    case "kobe":
      return {
        kind: "social_deployment_output",
        channels: payload.channels ?? [],
        cadence: payload.cadence ?? null,
        packagingChecklist: payload.packagingChecklist ?? []
      };
  }
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

    const output = buildDeterministicOutput(args.agentId, args.payload);

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
