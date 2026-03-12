import type { IncidentRecord } from "../incidents/types.js";
import type { ExecutionRunRecord } from "../execution/record-types.js";
import type { AgentExecutionLedgerService } from "../execution/ledger.js";
import type { AgentIncidentService } from "../incidents/service.js";
import { AgentOrgService } from "../org/service.js";
import type { OperationalSignalType } from "../org/selectors.js";
import type { SubAgentId } from "../org/types.js";

import type {
  CodeSentinelTelemetrySummary,
  ExecutionTelemetrySummary,
  IncidentTelemetrySummary,
  OpsStatusLevel,
  OpsStatusSummary,
  TelemetrySurface
} from "./types.js";

const WARNING_EXECUTION_FAILURE_THRESHOLD = 3;
const WARNING_POLICY_REJECTION_THRESHOLD = 1;
const WARNING_ROUTING_FAILURE_THRESHOLD = 1;

const INCIDENT_SEVERITIES = ["info", "warning", "critical"] as const;
const INCIDENT_TYPES = [
  "build_integrity_failure",
  "dependency_integrity_failure",
  "runtime_health_failure",
  "migration_integrity_failure",
  "route_contract_failure",
  "slo_integrity_failure",
  "execution_policy_failure",
  "execution_runtime_failure"
] as const;
const EXECUTION_STATES = [
  "requested",
  "validated",
  "routed",
  "blocked",
  "executing",
  "retriable",
  "succeeded",
  "failed"
] as const;
const CODE_SENTINEL_SUB_AGENTS = [
  "build-monitor",
  "dependency-watcher",
  "runtime-health-monitor",
  "migration-guardian",
  "route-contract-watcher",
  "slo-enforcer"
] as const satisfies readonly SubAgentId[];
const CODE_SENTINEL_SIGNALS = [
  "build_breakage",
  "dependency_drift",
  "runtime_health",
  "migration_integrity",
  "route_contract",
  "slo_release_gate"
] as const satisfies readonly OperationalSignalType[];

export class AgentTelemetryService {
  constructor(
    private readonly ledger: AgentExecutionLedgerService,
    private readonly incidents: AgentIncidentService,
    private readonly org: AgentOrgService = new AgentOrgService()
  ) {}

  async getOpsStatusSummary(args: { tenantId: string }): Promise<OpsStatusSummary> {
    const generatedAt = new Date().toISOString();
    const [incidentSummary, executionSummary, codeSentinelSummary] = await Promise.all([
      this.getIncidentSummary({ tenantId: args.tenantId, generatedAt }),
      this.getExecutionSummary({ tenantId: args.tenantId, generatedAt }),
      this.getCodeSentinelSummary({ tenantId: args.tenantId, generatedAt })
    ]);

    const status = this.classifyStatus({
      incidentSummary,
      executionSummary
    });

    return {
      status,
      manifestVersion: this.org.getManifestVersion(),
      generatedAt,
      incidents: incidentSummary,
      executions: executionSummary,
      codeSentinel: codeSentinelSummary,
      degradedSurfaces: this.collectDegradedSurfaces(incidentSummary, executionSummary)
    };
  }

  async getIncidentSummary(args: {
    tenantId: string;
    generatedAt?: string;
  }): Promise<IncidentTelemetrySummary> {
    const generatedAt = args.generatedAt ?? new Date().toISOString();
    const openIncidents = await this.incidents.listIncidents({
      tenantId: args.tenantId,
      status: "open",
      limit: 500
    });

    const openBySeverity = Object.fromEntries(
      INCIDENT_SEVERITIES.map((severity) => [severity, 0])
    ) as IncidentTelemetrySummary["openBySeverity"];
    const openByType = Object.fromEntries(
      INCIDENT_TYPES.map((type) => [type, 0])
    ) as IncidentTelemetrySummary["openByType"];

    let releaseBlockingOpenCount = 0;
    const degraded = new Set<TelemetrySurface>();

    for (const incident of openIncidents) {
      openBySeverity[incident.severity] += 1;
      openByType[incident.incidentType] += 1;
      if (incident.releaseBlocking) {
        releaseBlockingOpenCount += 1;
      }
      degraded.add(this.surfaceForIncident(incident));
    }

    return {
      manifestVersion: this.org.getManifestVersion(),
      generatedAt,
      openBySeverity,
      openByType,
      releaseBlockingOpenCount,
      degradedSurfaces: [...degraded]
    };
  }

  async getExecutionSummary(args: {
    tenantId: string;
    generatedAt?: string;
  }): Promise<ExecutionTelemetrySummary> {
    const generatedAt = args.generatedAt ?? new Date().toISOString();
    const runs = await this.ledger.listExecutionRunRecords({
      tenantId: args.tenantId,
      limit: 500
    });

    const recentByState = Object.fromEntries(
      EXECUTION_STATES.map((state) => [state, 0])
    ) as ExecutionTelemetrySummary["recentByState"];
    const recentFailuresByCategory: Record<string, number> = {};
    let routingFailureCount = 0;
    let policyRejectionCount = 0;

    for (const run of runs) {
      recentByState[run.currentState] += 1;
      if (run.failureCategory) {
        recentFailuresByCategory[run.failureCategory] = (recentFailuresByCategory[run.failureCategory] ?? 0) + 1;
      }
      if (run.failureCategory === "routing_failure") {
        routingFailureCount += 1;
      }
      if (run.failureCategory === "policy_rejection") {
        policyRejectionCount += 1;
      }
    }

    return {
      manifestVersion: this.org.getManifestVersion(),
      generatedAt,
      recentByState,
      recentFailuresByCategory,
      routingFailureCount,
      policyRejectionCount
    };
  }

  async getCodeSentinelSummary(args: {
    tenantId: string;
    generatedAt?: string;
  }): Promise<CodeSentinelTelemetrySummary> {
    const generatedAt = args.generatedAt ?? new Date().toISOString();
    const openIncidents = await this.incidents.listIncidents({
      tenantId: args.tenantId,
      status: "open",
      limit: 500
    });

    const openIncidentCountBySubAgent = Object.fromEntries(
      CODE_SENTINEL_SUB_AGENTS.map((subAgentId) => [subAgentId, 0])
    ) as CodeSentinelTelemetrySummary["openIncidentCountBySubAgent"];
    const openIncidentCountBySignal = Object.fromEntries(
      CODE_SENTINEL_SIGNALS.map((signalType) => [signalType, 0])
    ) as CodeSentinelTelemetrySummary["openIncidentCountBySignal"];

    for (const incident of openIncidents) {
      if (incident.owningLeadAgentId !== "code-sentinel") {
        continue;
      }
      if (
        incident.owningSubAgentId &&
        CODE_SENTINEL_SUB_AGENTS.includes(incident.owningSubAgentId as SubAgentId)
      ) {
        openIncidentCountBySubAgent[incident.owningSubAgentId as SubAgentId] += 1;
      }
      if (incident.relatedSignalType && incident.relatedSignalType in openIncidentCountBySignal) {
        openIncidentCountBySignal[incident.relatedSignalType as OperationalSignalType] += 1;
      }
    }

    let mostImpactedSubAgent: SubAgentId | null = null;
    let highestCount = 0;
    for (const subAgentId of CODE_SENTINEL_SUB_AGENTS) {
      const count = openIncidentCountBySubAgent[subAgentId];
      if (count > highestCount) {
        highestCount = count;
        mostImpactedSubAgent = subAgentId;
      }
    }

    return {
      manifestVersion: this.org.getManifestVersion(),
      generatedAt,
      openIncidentCountBySubAgent,
      openIncidentCountBySignal,
      mostImpactedSubAgent
    };
  }

  private classifyStatus(args: {
    incidentSummary: IncidentTelemetrySummary;
    executionSummary: ExecutionTelemetrySummary;
  }): OpsStatusLevel {
    if (args.incidentSummary.openBySeverity.critical > 0 && args.incidentSummary.releaseBlockingOpenCount > 0) {
      return "critical";
    }

    const warningIncidents = args.incidentSummary.openBySeverity.warning;
    const executionFailures =
      (args.executionSummary.recentFailuresByCategory.policy_rejection ?? 0) +
      (args.executionSummary.recentFailuresByCategory.routing_failure ?? 0) +
      (args.executionSummary.recentFailuresByCategory.execution_runtime_failure ?? 0);

    if (
      warningIncidents > 0 ||
      executionFailures >= WARNING_EXECUTION_FAILURE_THRESHOLD ||
      args.executionSummary.policyRejectionCount >= WARNING_POLICY_REJECTION_THRESHOLD ||
      args.executionSummary.routingFailureCount >= WARNING_ROUTING_FAILURE_THRESHOLD
    ) {
      return "warning";
    }

    return "healthy";
  }

  private collectDegradedSurfaces(
    incidentSummary: IncidentTelemetrySummary,
    executionSummary: ExecutionTelemetrySummary
  ): TelemetrySurface[] {
    const degraded = new Set<TelemetrySurface>(incidentSummary.degradedSurfaces);
    if (executionSummary.policyRejectionCount > 0 || executionSummary.routingFailureCount > 0) {
      degraded.add("policy_routing");
    }
    if ((executionSummary.recentFailuresByCategory.execution_runtime_failure ?? 0) > 0) {
      degraded.add("execution_runtime");
    }
    return [...degraded];
  }

  private surfaceForIncident(incident: IncidentRecord): TelemetrySurface {
    switch (incident.incidentType) {
      case "build_integrity_failure":
        return "build";
      case "dependency_integrity_failure":
        return "dependency";
      case "runtime_health_failure":
        return "runtime";
      case "migration_integrity_failure":
        return "migrations";
      case "route_contract_failure":
        return "route_contracts";
      case "slo_integrity_failure":
        return "slo";
      case "execution_policy_failure":
        return "policy_routing";
      case "execution_runtime_failure":
        return "execution_runtime";
    }
  }
}
