import type { SubAgentDefinition } from "./types.js";

export const CODE_SENTINEL_SUB_AGENT_IDS: SubAgentDefinition["subAgentId"][] = [
  "build-monitor",
  "dependency-watcher",
  "runtime-health-monitor",
  "migration-guardian",
  "route-contract-watcher",
  "slo-enforcer"
];

export const SUB_AGENTS: Record<SubAgentDefinition["subAgentId"], SubAgentDefinition> = {
  "build-monitor": {
    subAgentId: "build-monitor",
    displayName: "Build Monitor",
    parentLeadAgentId: "code-sentinel",
    departmentId: "technology-engineering",
    reportsToExecutiveId: "cto",
    primaryResponsibility: "Detect build and test breakage only."
  },
  "dependency-watcher": {
    subAgentId: "dependency-watcher",
    displayName: "Dependency Watcher",
    parentLeadAgentId: "code-sentinel",
    departmentId: "technology-engineering",
    reportsToExecutiveId: "cto",
    primaryResponsibility: "Detect stale or vulnerable dependency drift only."
  },
  "runtime-health-monitor": {
    subAgentId: "runtime-health-monitor",
    displayName: "Runtime Health Monitor",
    parentLeadAgentId: "code-sentinel",
    departmentId: "technology-engineering",
    reportsToExecutiveId: "cto",
    primaryResponsibility: "Detect live service health degradation only."
  },
  "migration-guardian": {
    subAgentId: "migration-guardian",
    displayName: "Migration Guardian",
    parentLeadAgentId: "code-sentinel",
    departmentId: "technology-engineering",
    reportsToExecutiveId: "cto",
    primaryResponsibility: "Detect schema and migration integrity issues only."
  },
  "route-contract-watcher": {
    subAgentId: "route-contract-watcher",
    displayName: "Route Contract Watcher",
    parentLeadAgentId: "code-sentinel",
    departmentId: "technology-engineering",
    reportsToExecutiveId: "cto",
    primaryResponsibility: "Detect API and route contract regressions only."
  },
  "slo-enforcer": {
    subAgentId: "slo-enforcer",
    displayName: "SLO Enforcer",
    parentLeadAgentId: "code-sentinel",
    departmentId: "technology-engineering",
    reportsToExecutiveId: "cto",
    primaryResponsibility: "Detect SLO degradation and release gate telemetry violations only."
  }
};
