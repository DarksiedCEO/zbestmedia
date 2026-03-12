import type { IncidentSeverity, IncidentType } from "../incidents/types.js";
import type { ExecutionRunState } from "../execution/record-types.js";
import type { OperationalSignalType } from "../org/selectors.js";
import type { SubAgentId } from "../org/types.js";

export type OpsStatusLevel = "healthy" | "warning" | "critical";

export type TelemetrySurface =
  | "build"
  | "dependency"
  | "runtime"
  | "migrations"
  | "route_contracts"
  | "slo"
  | "policy_routing"
  | "execution_runtime";

export type OpsStatusSummary = {
  status: OpsStatusLevel;
  manifestVersion: string;
  generatedAt: string;
  incidents: IncidentTelemetrySummary;
  executions: ExecutionTelemetrySummary;
  codeSentinel: CodeSentinelTelemetrySummary;
  degradedSurfaces: TelemetrySurface[];
};

export type IncidentTelemetrySummary = {
  manifestVersion: string;
  generatedAt: string;
  openBySeverity: Record<IncidentSeverity, number>;
  openByType: Record<IncidentType, number>;
  releaseBlockingOpenCount: number;
  degradedSurfaces: TelemetrySurface[];
};

export type ExecutionTelemetrySummary = {
  manifestVersion: string;
  generatedAt: string;
  recentByState: Record<ExecutionRunState, number>;
  recentFailuresByCategory: Record<string, number>;
  routingFailureCount: number;
  policyRejectionCount: number;
};

export type CodeSentinelTelemetrySummary = {
  manifestVersion: string;
  generatedAt: string;
  openIncidentCountBySubAgent: Record<SubAgentId, number>;
  openIncidentCountBySignal: Record<OperationalSignalType, number>;
  mostImpactedSubAgent: SubAgentId | null;
};
