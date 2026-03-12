import type { AgentId } from "../agents/registry.js";

export type ExecutiveId =
  | "maestro-orchestrator"
  | "cro"
  | "cmo"
  | "cio"
  | "cco"
  | "cto"
  | "cpo"
  | "coo"
  | "cgo"
  | "cso";

export type DepartmentId =
  | "revenue-sales"
  | "marketing"
  | "intelligence-research"
  | "creative-content"
  | "technology-engineering"
  | "product"
  | "operations"
  | "growth"
  | "strategy-security-risk";

export type LeadAgentId =
  | "brandyn"
  | "jordyn"
  | "kobe"
  | "jingle-jon"
  | "jingle-jane"
  | "code-sentinel";

export type SubAgentId =
  | "build-monitor"
  | "dependency-watcher"
  | "runtime-health-monitor"
  | "migration-guardian"
  | "route-contract-watcher"
  | "slo-enforcer";

export type ExecutiveDefinition = {
  executiveId: ExecutiveId;
  title: string;
  mission: string;
  ownsDepartments: DepartmentId[];
  reportsTo: ExecutiveId | null;
};

export type DepartmentDefinition = {
  departmentId: DepartmentId;
  displayName: string;
  mission: string;
  executiveOwnerId: ExecutiveId;
};

export type LeadAgentDefinition = {
  leadAgentId: LeadAgentId;
  displayName: string;
  departmentId: DepartmentId;
  reportsToExecutiveId: ExecutiveId;
  primaryResponsibility: string;
  allowedScope: string[];
  forbiddenScope: string[];
  laneType: "lead_agent" | "specialized_lane_owner";
  executionAgentId?: AgentId;
};

export type SubAgentDefinition = {
  subAgentId: SubAgentId;
  displayName: string;
  parentLeadAgentId: LeadAgentId;
  departmentId: DepartmentId;
  reportsToExecutiveId: ExecutiveId;
  primaryResponsibility: string;
};

export type OrgNodeId = ExecutiveId | DepartmentId | LeadAgentId | SubAgentId;

export type ReportingChainNode =
  | { nodeType: "sub-agent"; nodeId: SubAgentId; displayName: string }
  | { nodeType: "lead-agent"; nodeId: LeadAgentId; displayName: string }
  | { nodeType: "executive"; nodeId: ExecutiveId; displayName: string };
