import type { AgentId } from "../agents/registry.js";
import type { RoutingDecision } from "../org/routing-types.js";
import { AgentOrgService } from "../org/service.js";
import type { AssignmentRecord, ExecutionRunRecord } from "../persistence/contracts.js";
import type { AgentOsRepository } from "../persistence/repository.js";
import type { ExecutionRunTransition } from "./record-types.js";

export class AgentExecutionLedgerStateError extends Error {
  constructor(message: string) {
    super(message);
  }
}

const RUN_STATE_TRANSITIONS: Record<ExecutionRunRecord["currentState"], ExecutionRunTransition[]> = {
  requested: ["validate", "fail"],
  validated: ["route", "block", "fail"],
  routed: ["start_execution", "block", "fail", "mark_retriable"],
  blocked: ["route", "start_execution", "fail"],
  executing: ["succeed", "fail", "mark_retriable"],
  retriable: ["start_execution", "fail"],
  succeeded: [],
  failed: []
};

export class AgentExecutionLedgerService {
  constructor(
    private readonly repository: AgentOsRepository,
    private readonly org: AgentOrgService = new AgentOrgService()
  ) {}

  async createAssignment(args: {
    tenantId: string;
    correlationId: string;
    requestSource: string;
    requestedBy: string;
    requestedTaskCategory: AssignmentRecord["requestedTaskCategory"];
    requestedResponsibilityKey?: string | null;
    requestMetadata: Record<string, unknown>;
    requestedExecutionTarget?: string | null;
    routingDecision?: RoutingDecision | null;
    policyDecision: AssignmentRecord["policyDecision"];
    policyDecisionReason: string;
    createdAt?: string;
  }): Promise<AssignmentRecord> {
    const routing = args.routingDecision ?? null;
    return this.repository.createAssignmentRecord({
      tenantId: args.tenantId,
      manifestVersion: this.org.getManifestVersion(),
      correlationId: args.correlationId,
      requestSource: args.requestSource,
      requestedBy: args.requestedBy,
      requestedTaskCategory: args.requestedTaskCategory ?? null,
      requestedResponsibilityKey: args.requestedResponsibilityKey ?? null,
      requestMetadata: args.requestMetadata,
      requestedExecutionTarget: args.requestedExecutionTarget ?? null,
      resolvedExecutiveId: routing?.resolvedExecutive ?? null,
      resolvedDepartmentId: routing?.resolvedDepartment ?? null,
      resolvedLeadAgentId: routing?.resolvedLeadAgentId ?? null,
      resolvedSubAgentId: routing?.resolvedSubAgentId ?? null,
      executionAgentId: routing?.executionAgentId ?? null,
      policyDecision: args.policyDecision,
      policyDecisionReason: args.policyDecisionReason,
      routingDecision: routing,
      routingTrace: routing?.trace ?? [],
      createdAt: args.createdAt
    });
  }

  async createRun(args: {
    tenantId: string;
    assignmentRecordId: string;
    metadata?: Record<string, unknown>;
    requestedAt?: string;
  }): Promise<ExecutionRunRecord> {
    return this.repository.createExecutionRunRecord({
      tenantId: args.tenantId,
      assignmentRecordId: args.assignmentRecordId,
      currentState: "requested",
      metadata: args.metadata,
      requestedAt: args.requestedAt
    });
  }

  async attachExecution(args: {
    tenantId: string;
    runRecordId: string;
    executionId: string;
    currentState: ExecutionRunRecord["currentState"];
    metadata?: Record<string, unknown>;
    transitionedAt?: string;
  }) {
    return this.repository.transitionExecutionRunRecord({
      tenantId: args.tenantId,
      runRecordId: args.runRecordId,
      fromState: args.currentState,
      toState: args.currentState,
      executionId: args.executionId,
      metadata: args.metadata,
      transitionedAt: args.transitionedAt
    });
  }

  async transition(args: {
    tenantId: string;
    runRecord: ExecutionRunRecord;
    transition: ExecutionRunTransition;
    executionId?: string | null;
    failureCategory?: string | null;
    failureMessage?: string | null;
    retryable?: boolean;
    metadata?: Record<string, unknown>;
    transitionedAt?: string;
  }): Promise<ExecutionRunRecord> {
    const allowed = RUN_STATE_TRANSITIONS[args.runRecord.currentState];
    if (!allowed.includes(args.transition)) {
      throw new AgentExecutionLedgerStateError(
        `invalid_execution_run_transition:${args.runRecord.currentState}:${args.transition}`
      );
    }

    const toState = this.resolveToState(args.transition);
    return this.repository.transitionExecutionRunRecord({
      tenantId: args.tenantId,
      runRecordId: args.runRecord.runRecordId,
      fromState: args.runRecord.currentState,
      toState,
      executionId: args.executionId,
      failureCategory: args.failureCategory ?? null,
      failureMessage: args.failureMessage ?? null,
      retryable: args.retryable ?? (toState === "retriable"),
      metadata: args.metadata,
      transitionedAt: args.transitionedAt
    });
  }

  async getAssignmentRecord(args: { tenantId: string; assignmentRecordId: string }) {
    return this.repository.getAssignmentRecord(args);
  }

  async listAssignmentRecords(args: { tenantId: string; limit?: number }) {
    return this.repository.listAssignmentRecords(args);
  }

  async getExecutionRunRecord(args: { tenantId: string; runRecordId: string }) {
    return this.repository.getExecutionRunRecord(args);
  }

  async getExecutionRunRecordByExecutionId(args: { tenantId: string; executionId: string }) {
    return this.repository.getExecutionRunRecordByExecutionId(args);
  }

  async listExecutionRunRecords(args: {
    tenantId: string;
    currentState?: ExecutionRunRecord["currentState"];
    limit?: number;
  }) {
    return this.repository.listExecutionRunRecords(args);
  }

  private resolveToState(transition: ExecutionRunTransition): ExecutionRunRecord["currentState"] {
    switch (transition) {
      case "validate":
        return "validated";
      case "route":
        return "routed";
      case "block":
        return "blocked";
      case "start_execution":
        return "executing";
      case "mark_retriable":
        return "retriable";
      case "succeed":
        return "succeeded";
      case "fail":
        return "failed";
    }
    throw new AgentExecutionLedgerStateError(`unknown_execution_run_transition:${transition}`);
  }
}

export function buildAssignmentRequestMetadata(args: {
  agentId: AgentId;
  subjectType: string;
  subjectId: string;
  payload: Record<string, unknown>;
}) {
  return {
    agentId: args.agentId,
    subjectType: args.subjectType,
    subjectId: args.subjectId,
    payloadSummary: Object.keys(args.payload).sort()
  };
}
