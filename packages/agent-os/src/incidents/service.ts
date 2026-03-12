import type { OperationalSignalType } from "../org/selectors.js";
import { AgentOrgService } from "../org/service.js";
import type { IncidentRecord, IncidentOwnership, IncidentSeverity, IncidentSignalInput, IncidentStatus, IncidentType, ExecutionFailureIncidentInput } from "./types.js";
import type { AgentOsRepository } from "../persistence/repository.js";

const SIGNAL_TO_INCIDENT_TYPE: Record<OperationalSignalType, IncidentType> = {
  build_breakage: "build_integrity_failure",
  dependency_drift: "dependency_integrity_failure",
  runtime_health: "runtime_health_failure",
  migration_integrity: "migration_integrity_failure",
  route_contract: "route_contract_failure",
  slo_release_gate: "slo_integrity_failure"
};

const SIGNAL_RECOMMENDED_ACTION: Record<OperationalSignalType, string> = {
  build_breakage: "Investigate the failing build/test lane and restore a passing CI path.",
  dependency_drift: "Review dependency drift or vulnerabilities and apply the required update plan.",
  runtime_health: "Inspect service health, logs, and runtime dependencies; restore healthy service operation.",
  migration_integrity: "Verify schema state and rerun the required migrations against the intended database.",
  route_contract: "Inspect the affected route contract and restore the expected API behavior.",
  slo_release_gate: "Investigate worker freshness/SLO degradation and restore release-gate health before shipping."
};

const EXECUTION_FAILURE_DEFAULTS: Record<
  ExecutionFailureIncidentInput["incidentType"],
  { severity: IncidentSeverity; releaseBlocking: boolean; recommendedAction: string; signalType: OperationalSignalType }
> = {
  execution_policy_failure: {
    severity: "critical",
    releaseBlocking: true,
    recommendedAction: "Correct the invalid assignment or routing decision before retrying execution.",
    signalType: "route_contract"
  },
  execution_runtime_failure: {
    severity: "warning",
    releaseBlocking: false,
    recommendedAction: "Inspect execution runtime inputs and service health, then retry if safe.",
    signalType: "runtime_health"
  }
};

export class AgentIncidentService {
  constructor(
    private readonly repository: AgentOsRepository,
    private readonly org: AgentOrgService = new AgentOrgService()
  ) {}

  async createFromOperationalSignal(args: {
    tenantId: string;
    actorId: string;
    signal: IncidentSignalInput;
    createdAt?: string;
  }): Promise<IncidentRecord> {
    const ownership = this.resolveSignalOwnership(args.signal.signalType);
    const incidentType = SIGNAL_TO_INCIDENT_TYPE[args.signal.signalType];
    const severity = this.severityFromSignalStatus(args.signal.status);
    return this.repository.createIncidentRecord({
      tenantId: args.tenantId,
      incidentType,
      severity,
      status: "open",
      sourceSystem: args.signal.sourceSystem,
      relatedSignalType: args.signal.signalType,
      relatedAssignmentRecordId: args.signal.relatedAssignmentRecordId ?? null,
      relatedRunRecordId: args.signal.relatedRunRecordId ?? null,
      title: this.titleForIncident(incidentType),
      summary: args.signal.message,
      details: args.signal.details ?? {},
      recommendedAction: SIGNAL_RECOMMENDED_ACTION[args.signal.signalType],
      releaseBlocking: severity === "critical",
      createdAt: args.createdAt,
      ...ownership
    });
  }

  async createFromExecutionFailure(args: {
    tenantId: string;
    actorId: string;
    failure: ExecutionFailureIncidentInput;
    createdAt?: string;
  }): Promise<IncidentRecord> {
    const defaults = EXECUTION_FAILURE_DEFAULTS[args.failure.incidentType];
    const ownership = this.resolveSignalOwnership(defaults.signalType);
    return this.repository.createIncidentRecord({
      tenantId: args.tenantId,
      incidentType: args.failure.incidentType,
      severity: defaults.severity,
      status: "open",
      sourceSystem: args.failure.sourceSystem,
      relatedSignalType: defaults.signalType,
      relatedAssignmentRecordId: args.failure.relatedAssignmentRecordId ?? null,
      relatedRunRecordId: args.failure.relatedRunRecordId ?? null,
      title: this.titleForIncident(args.failure.incidentType),
      summary: args.failure.message,
      details: args.failure.details ?? {},
      recommendedAction: defaults.recommendedAction,
      releaseBlocking: args.failure.releaseBlocking ?? defaults.releaseBlocking,
      createdAt: args.createdAt,
      ...ownership
    });
  }

  async listIncidents(args: {
    tenantId: string;
    status?: IncidentStatus;
    severity?: IncidentSeverity;
    incidentType?: IncidentType;
    limit?: number;
  }) {
    return this.repository.listIncidentRecords(args);
  }

  async getIncident(args: { tenantId: string; incidentId: string }) {
    return this.repository.getIncidentRecord(args);
  }

  async acknowledgeIncident(args: {
    tenantId: string;
    incidentId: string;
    actorId: string;
    acknowledgedAt?: string;
  }) {
    return this.repository.acknowledgeIncidentRecord({
      tenantId: args.tenantId,
      incidentId: args.incidentId,
      acknowledgedBy: args.actorId,
      acknowledgedAt: args.acknowledgedAt
    });
  }

  async resolveIncident(args: {
    tenantId: string;
    incidentId: string;
    actorId: string;
    resolutionNote: string;
    resolvedAt?: string;
  }) {
    return this.repository.resolveIncidentRecord({
      tenantId: args.tenantId,
      incidentId: args.incidentId,
      resolvedBy: args.actorId,
      resolutionNote: args.resolutionNote,
      resolvedAt: args.resolvedAt
    });
  }

  private resolveSignalOwnership(signalType: OperationalSignalType): IncidentOwnership {
    const ownership = this.org.resolveOperationalSignalOwner(signalType);
    return {
      owningExecutiveId: ownership.leadAgent.reportsToExecutiveId,
      owningDepartmentId: ownership.leadAgent.departmentId,
      owningLeadAgentId: ownership.leadAgent.leadAgentId,
      owningSubAgentId: ownership.subAgent.subAgentId
    };
  }

  private severityFromSignalStatus(status: IncidentSignalInput["status"]): IncidentSeverity {
    if (status === "healthy") return "info";
    if (status === "warning") return "warning";
    return "critical";
  }

  private titleForIncident(type: IncidentType): string {
    switch (type) {
      case "build_integrity_failure":
        return "Build integrity failure";
      case "dependency_integrity_failure":
        return "Dependency integrity failure";
      case "runtime_health_failure":
        return "Runtime health failure";
      case "migration_integrity_failure":
        return "Migration integrity failure";
      case "route_contract_failure":
        return "Route contract failure";
      case "slo_integrity_failure":
        return "SLO integrity failure";
      case "execution_policy_failure":
        return "Execution policy failure";
      case "execution_runtime_failure":
        return "Execution runtime failure";
    }
  }
}
