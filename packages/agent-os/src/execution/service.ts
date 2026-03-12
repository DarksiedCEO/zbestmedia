import type { AgentId } from "../agents/registry.js";
import type { ApprovalWorkflowService } from "../approvals/service.js";
import { AgentExecutionLedgerService, buildAssignmentRequestMetadata } from "./ledger.js";
import { AgentIncidentService } from "../incidents/service.js";
import type { AgentOsRepository } from "../persistence/repository.js";
import type { ExecutionRecord } from "../persistence/contracts.js";
import { AgentOrgPolicyService } from "../org/policy.js";
import { AgentOrgRoutingService } from "../org/routing.js";
import type { JingleRoutingMode, RoutingTaskCategory } from "../org/routing-types.js";
import {
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
    private readonly orgPolicy: AgentOrgPolicyService = new AgentOrgPolicyService(),
    private readonly orgRouting: AgentOrgRoutingService = new AgentOrgRoutingService(),
    private readonly ledger: AgentExecutionLedgerService = new AgentExecutionLedgerService(repository),
    private readonly incidents: AgentIncidentService = new AgentIncidentService(repository)
  ) {}

  async execute(args: AgentExecutionInput): Promise<
      | {
        execution: ExecutionRecord;
        assignmentRecordId: string;
        runRecordId: string;
        approvalRequired: true;
        approvalRequestId: string;
        requiredApprovers: string[];
        reason: string;
      }
    | {
        execution: ExecutionRecord;
        assignmentRecordId: string;
        runRecordId: string;
        approvalRequired: false;
        output: Record<string, unknown>;
      }
  > {
    const createdAt = args.createdAt ?? new Date().toISOString();
    const requestedRoute = this.resolveRequestedRoute(args.subjectType, args.payload);
    let routingDecision = null;
    let policyDecision: "approved" | "rejected" = "approved";
    let policyDecisionReason = "assignment_policy_valid";

    try {
      if (requestedRoute) {
        routingDecision = this.orgRouting.resolve({
          category: requestedRoute.category,
          requestedAgentId: args.agentId,
          jingleMode: requestedRoute.jingleMode
        });
      } else {
        this.orgPolicy.assertExecutionAgentResponsibility({
          agentId: args.agentId,
          subjectType: args.subjectType,
          payload: args.payload
        });
      }
    } catch (error) {
      policyDecision = "rejected";
      policyDecisionReason = error instanceof Error ? error.message : "assignment_policy_rejected";
      const assignment = await this.ledger.createAssignment({
        tenantId: args.tenantId,
        correlationId: args.correlationId,
        requestSource: args.requestSource,
        requestedBy: args.actorId,
        requestedTaskCategory: requestedRoute?.category ?? null,
        requestedResponsibilityKey:
          typeof args.payload.responsibilityKey === "string" ? args.payload.responsibilityKey : null,
        requestMetadata: buildAssignmentRequestMetadata(args),
        requestedExecutionTarget: args.agentId,
        routingDecision,
        policyDecision,
        policyDecisionReason,
        createdAt
      });
      const run = await this.ledger.createRun({
        tenantId: args.tenantId,
        assignmentRecordId: assignment.assignmentRecordId,
        metadata: { decision: "rejected_before_execution" },
        requestedAt: createdAt
      });
      await this.ledger.transition({
        tenantId: args.tenantId,
        runRecord: run,
        transition: "fail",
        failureCategory: "assignment_policy_error",
        failureMessage: policyDecisionReason,
        metadata: { requestedAgentId: args.agentId },
        transitionedAt: createdAt
      });
      await this.incidents.createFromExecutionFailure({
        tenantId: args.tenantId,
        actorId: args.actorId,
        failure: {
          incidentType: "execution_policy_failure",
          sourceSystem: "agent-execution-service",
          message: policyDecisionReason,
          details: {
            requestedAgentId: args.agentId,
            subjectType: args.subjectType,
            subjectId: args.subjectId
          },
          relatedAssignmentRecordId: assignment.assignmentRecordId,
          relatedRunRecordId: run.runRecordId,
          releaseBlocking: true
        },
        createdAt
      });
      throw error;
    }

    const assignment = await this.ledger.createAssignment({
      tenantId: args.tenantId,
      correlationId: args.correlationId,
      requestSource: args.requestSource,
      requestedBy: args.actorId,
      requestedTaskCategory: requestedRoute?.category ?? null,
      requestedResponsibilityKey:
        typeof args.payload.responsibilityKey === "string" ? args.payload.responsibilityKey : null,
      requestMetadata: buildAssignmentRequestMetadata(args),
      requestedExecutionTarget: args.agentId,
      routingDecision,
      policyDecision,
      policyDecisionReason,
      createdAt
    });
    let run = await this.ledger.createRun({
      tenantId: args.tenantId,
      assignmentRecordId: assignment.assignmentRecordId,
      metadata: { requestedAgentId: args.agentId },
      requestedAt: createdAt
    });
    run = await this.ledger.transition({
      tenantId: args.tenantId,
      runRecord: run,
      transition: "validate",
      metadata: { policyDecision },
      transitionedAt: createdAt
    });
    run = await this.ledger.transition({
      tenantId: args.tenantId,
      runRecord: run,
      transition: "route",
      metadata: { routingDecision },
      transitionedAt: createdAt
    });

    let approval;
    try {
      approval = await this.approvals.ensureApproval({
        tenantId: args.tenantId,
        agentId: args.agentId,
        subjectType: args.subjectType,
        subjectId: args.subjectId,
        actorId: args.actorId,
        payload: args.payload,
        createdAt
      });
    } catch (error) {
      const failureMessage = error instanceof Error ? error.message : "approval_resolution_failed";
      await this.ledger.transition({
        tenantId: args.tenantId,
        runRecord: run,
        transition: "fail",
        failureCategory: "approval_resolution_error",
        failureMessage,
        retryable: false,
        transitionedAt: createdAt
      });
      await this.incidents.createFromExecutionFailure({
        tenantId: args.tenantId,
        actorId: args.actorId,
        failure: {
          incidentType: "execution_runtime_failure",
          sourceSystem: "agent-execution-service",
          message: failureMessage,
          details: {
            stage: "approval_resolution",
            agentId: args.agentId,
            subjectType: args.subjectType
          },
          relatedAssignmentRecordId: assignment.assignmentRecordId,
          relatedRunRecordId: run.runRecordId,
          releaseBlocking: false
        },
        createdAt
      });
      throw error;
    }

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
        createdAt
      });
      run = await this.ledger.attachExecution({
        tenantId: args.tenantId,
        runRecordId: run.runRecordId,
        executionId: execution.executionId,
        currentState: run.currentState,
        metadata: { approvalRequestId: approval.approvalRequestId },
        transitionedAt: createdAt
      });
      run = await this.ledger.transition({
        tenantId: args.tenantId,
        runRecord: run,
        transition: "block",
        metadata: { approvalRequired: true, approvalRequestId: approval.approvalRequestId },
        transitionedAt: createdAt
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
        createdAt
      });

      return {
        execution,
        assignmentRecordId: assignment.assignmentRecordId,
        runRecordId: run.runRecordId,
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
        createdAt
      });
      run = await this.ledger.attachExecution({
        tenantId: args.tenantId,
        runRecordId: run.runRecordId,
        executionId: execution.executionId,
        currentState: run.currentState,
        metadata: { queuedForWorker: true },
        transitionedAt: createdAt
      });

      await this.repository.appendExecutionStep({
        tenantId: args.tenantId,
        executionId: execution.executionId,
        stepName: "execution_queued",
        stepOrder: 1,
        status: "PENDING",
        payload: { queuedForWorker: true },
        createdAt
      });

      return {
        execution,
        assignmentRecordId: assignment.assignmentRecordId,
        runRecordId: run.runRecordId,
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
      createdAt
    });
    run = await this.ledger.attachExecution({
      tenantId: args.tenantId,
      runRecordId: run.runRecordId,
      executionId: execution.executionId,
      currentState: run.currentState,
      transitionedAt: createdAt
    });
    run = await this.ledger.transition({
      tenantId: args.tenantId,
      runRecord: run,
      transition: "start_execution",
      executionId: execution.executionId,
      metadata: { executionId: execution.executionId },
      transitionedAt: createdAt
    });

    await this.repository.appendExecutionStep({
      tenantId: args.tenantId,
      executionId: execution.executionId,
      stepName: "execution_started",
      stepOrder: 1,
      status: "COMPLETED",
      payload: { agentId: args.agentId },
      createdAt
    });

    try {
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
        createdAt
      });
      await this.repository.completeExecution({
        tenantId: args.tenantId,
        executionId: execution.executionId,
        outputPayload: output,
        completedAt: createdAt
      });
      run = await this.ledger.transition({
        tenantId: args.tenantId,
        runRecord: run,
        transition: "succeed",
        executionId: execution.executionId,
        metadata: { outputSummary: output.summary ?? null },
        transitionedAt: createdAt
      });

      return {
        execution: {
          ...execution,
          status: "COMPLETED",
          outputPayload: output,
          completedAt: createdAt,
          updatedAt: createdAt
        },
        assignmentRecordId: assignment.assignmentRecordId,
        runRecordId: run.runRecordId,
        approvalRequired: false,
        output
      };
    } catch (error) {
      const failureMessage = error instanceof Error ? error.message : "execution_failed";
      await this.repository.appendExecutionStep({
        tenantId: args.tenantId,
        executionId: execution.executionId,
        stepName: "execution_failed",
        stepOrder: 2,
        status: "FAILED",
        payload: { failureMessage },
        createdAt
      });
      await this.repository.failExecution({
        tenantId: args.tenantId,
        executionId: execution.executionId,
        failureClass: "execution_runtime_error",
        failureMessage,
        completedAt: createdAt
      });
      await this.ledger.transition({
        tenantId: args.tenantId,
        runRecord: run,
        transition: "fail",
        executionId: execution.executionId,
        failureCategory: "execution_runtime_error",
        failureMessage,
        retryable: false,
        transitionedAt: createdAt
      });
      await this.incidents.createFromExecutionFailure({
        tenantId: args.tenantId,
        actorId: args.actorId,
        failure: {
          incidentType: "execution_runtime_failure",
          sourceSystem: "agent-execution-service",
          message: failureMessage,
          details: {
            agentId: args.agentId,
            subjectType: args.subjectType,
            subjectId: args.subjectId
          },
          relatedAssignmentRecordId: assignment.assignmentRecordId,
          relatedRunRecordId: run.runRecordId,
          releaseBlocking: false
        },
        createdAt
      });
      throw error;
    }
  }

  private resolveRequestedRoute(
    subjectType: string,
    payload: Record<string, unknown>
  ): { category: RoutingTaskCategory; jingleMode?: JingleRoutingMode } | null {
    const explicit = payload.responsibilityKey;
    if (typeof explicit === "string") {
      switch (explicit) {
        case "brand_identity_governance":
          return { category: "brand_identity" };
        case "social_campaign_deployment":
          return { category: "campaign_growth" };
        case "visual_identity_governance":
          return { category: "visual_design" };
        case "sonic_brand_composition":
          return { category: "jingle_music", jingleMode: "composition" };
        case "sonic_campaign_packaging":
          return { category: "jingle_music", jingleMode: "packaging" };
        case "build_breakage_detection":
          return { category: "build_integrity_monitoring" };
        case "dependency_drift_detection":
          return { category: "dependency_integrity_monitoring" };
        case "runtime_health_monitoring":
          return { category: "runtime_health_monitoring" };
        case "migration_integrity_monitoring":
          return { category: "migration_integrity_monitoring" };
        case "route_contract_monitoring":
          return { category: "route_contract_monitoring" };
        case "slo_release_gate_monitoring":
          return { category: "slo_integrity_monitoring" };
      }
    }

    switch (subjectType) {
      case "brand_smoke":
      case "brand_identity_governance":
        return { category: "brand_identity" };
      case "visual_identity_governance":
        return { category: "visual_design" };
      case "social_campaign_deployment":
        return { category: "campaign_growth" };
      default:
        return null;
    }
  }
}
