import { LEAD_AGENTS } from "./lead-agents.js";
import { SUB_AGENTS } from "./sub-agents.js";
import {
  CODE_SENTINEL_SIGNAL_OWNERS,
  type OperationalSignalType,
  type ResponsibilityKey
} from "./selectors.js";
import type { LeadAgentId, SubAgentId } from "./types.js";

export type CodeSentinelSignalStatus = "healthy" | "warning" | "critical";

export type CodeSentinelSignalDefinition = {
  signalType: OperationalSignalType;
  responsibilityKey: ResponsibilityKey;
  leadAgentId: LeadAgentId;
  subAgentId: SubAgentId;
  sourceSurface: string;
  description: string;
};

export type CodeSentinelSignalPayload = {
  signalType: OperationalSignalType;
  status: CodeSentinelSignalStatus;
  owningLeadAgentId: LeadAgentId;
  owningSubAgentId: SubAgentId;
  source: string;
  message: string;
  metadata?: Record<string, unknown>;
  observedAt: string;
};

const CODE_SENTINEL_SIGNAL_DEFINITIONS: Record<OperationalSignalType, CodeSentinelSignalDefinition> = {
  build_breakage: {
    signalType: "build_breakage",
    responsibilityKey: "build_breakage_detection",
    leadAgentId: "code-sentinel",
    subAgentId: CODE_SENTINEL_SIGNAL_OWNERS.build_breakage,
    sourceSurface: "build-and-test-integrity",
    description: "Build/test breakage belongs to Code Sentinel Build Monitor."
  },
  dependency_drift: {
    signalType: "dependency_drift",
    responsibilityKey: "dependency_drift_detection",
    leadAgentId: "code-sentinel",
    subAgentId: CODE_SENTINEL_SIGNAL_OWNERS.dependency_drift,
    sourceSurface: "dependency-integrity",
    description: "Dependency drift belongs to Code Sentinel Dependency Watcher."
  },
  runtime_health: {
    signalType: "runtime_health",
    responsibilityKey: "runtime_health_monitoring",
    leadAgentId: "code-sentinel",
    subAgentId: CODE_SENTINEL_SIGNAL_OWNERS.runtime_health,
    sourceSurface: "runtime-health",
    description: "Runtime health degradation belongs to Code Sentinel Runtime Health Monitor."
  },
  migration_integrity: {
    signalType: "migration_integrity",
    responsibilityKey: "migration_integrity_monitoring",
    leadAgentId: "code-sentinel",
    subAgentId: CODE_SENTINEL_SIGNAL_OWNERS.migration_integrity,
    sourceSurface: "schema-migration-integrity",
    description: "Migration and schema integrity belongs to Code Sentinel Migration Guardian."
  },
  route_contract: {
    signalType: "route_contract",
    responsibilityKey: "route_contract_monitoring",
    leadAgentId: "code-sentinel",
    subAgentId: CODE_SENTINEL_SIGNAL_OWNERS.route_contract,
    sourceSurface: "route-contract-integrity",
    description: "Route and API contract regressions belong to Code Sentinel Route Contract Watcher."
  },
  slo_release_gate: {
    signalType: "slo_release_gate",
    responsibilityKey: "slo_release_gate_monitoring",
    leadAgentId: "code-sentinel",
    subAgentId: CODE_SENTINEL_SIGNAL_OWNERS.slo_release_gate,
    sourceSurface: "release-gate-telemetry",
    description: "Release-gate and SLO degradation belongs to Code Sentinel SLO Enforcer."
  }
};

const KNOWN_SIGNAL_TYPES = Object.keys(CODE_SENTINEL_SIGNAL_DEFINITIONS) as OperationalSignalType[];

export function listCodeSentinelSignals(): CodeSentinelSignalDefinition[] {
  return KNOWN_SIGNAL_TYPES.map((signalType) => CODE_SENTINEL_SIGNAL_DEFINITIONS[signalType]);
}

export function isOperationalSignalType(value: string): value is OperationalSignalType {
  return KNOWN_SIGNAL_TYPES.includes(value as OperationalSignalType);
}

export function assertCodeSentinelSignalType(value: string): OperationalSignalType {
  if (!isOperationalSignalType(value)) {
    throw new Error(`unknown_code_sentinel_signal:${value}`);
  }
  return value;
}

export function getCodeSentinelSignalDefinition(
  signalType: OperationalSignalType
): CodeSentinelSignalDefinition {
  return CODE_SENTINEL_SIGNAL_DEFINITIONS[signalType];
}

export function buildCodeSentinelSignal(args: {
  signalType: OperationalSignalType;
  status: CodeSentinelSignalStatus;
  source: string;
  message: string;
  metadata?: Record<string, unknown>;
  observedAt?: string;
}): CodeSentinelSignalPayload {
  const definition = getCodeSentinelSignalDefinition(args.signalType);
  return {
    signalType: definition.signalType,
    status: args.status,
    owningLeadAgentId: definition.leadAgentId,
    owningSubAgentId: definition.subAgentId,
    source: args.source,
    message: args.message,
    metadata: args.metadata,
    observedAt: args.observedAt ?? new Date().toISOString()
  };
}

export function getCodeSentinelSignalOwnership(signalType: OperationalSignalType) {
  const definition = getCodeSentinelSignalDefinition(signalType);
  return {
    definition,
    leadAgent: LEAD_AGENTS[definition.leadAgentId],
    subAgent: SUB_AGENTS[definition.subAgentId]
  };
}
