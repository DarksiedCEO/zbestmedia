import { AGENT_DEFINITIONS } from "../agents/registry.js";

import { DEPARTMENTS } from "./departments.js";
import { EXECUTIVES } from "./executives.js";
import { LEAD_AGENTS } from "./lead-agents.js";
import { SUB_AGENTS } from "./sub-agents.js";
import type {
  DepartmentDefinition,
  DepartmentId,
  ExecutiveDefinition,
  ExecutiveId,
  LeadAgentDefinition,
  LeadAgentId,
  ReportingChainNode,
  SubAgentDefinition,
  SubAgentId
} from "./types.js";

function uniqueIds(items: string[]): boolean {
  return new Set(items).size === items.length;
}

export type AgentOrgRegistry = {
  executives: ExecutiveDefinition[];
  departments: DepartmentDefinition[];
  leadAgents: LeadAgentDefinition[];
  subAgents: SubAgentDefinition[];
};

export const AGENT_ORG_MANIFEST_VERSION = "2026-03-12.v1";

export const AGENT_ORG_REGISTRY: AgentOrgRegistry = {
  executives: Object.values(EXECUTIVES),
  departments: Object.values(DEPARTMENTS),
  leadAgents: Object.values(LEAD_AGENTS),
  subAgents: Object.values(SUB_AGENTS)
};

export function getExecutiveById(executiveId: ExecutiveId): ExecutiveDefinition {
  return EXECUTIVES[executiveId];
}

export function getDepartmentById(departmentId: DepartmentId): DepartmentDefinition {
  return DEPARTMENTS[departmentId];
}

export function getLeadAgentById(leadAgentId: LeadAgentId): LeadAgentDefinition {
  return LEAD_AGENTS[leadAgentId];
}

export function getSubAgentById(subAgentId: SubAgentId): SubAgentDefinition {
  return SUB_AGENTS[subAgentId];
}

export function listExecutives(): ExecutiveDefinition[] {
  return AGENT_ORG_REGISTRY.executives;
}

export function listDepartments(): DepartmentDefinition[] {
  return AGENT_ORG_REGISTRY.departments;
}

export function listLeadAgents(): LeadAgentDefinition[] {
  return AGENT_ORG_REGISTRY.leadAgents;
}

export function listSubAgents(): SubAgentDefinition[] {
  return AGENT_ORG_REGISTRY.subAgents;
}

export function getAgentsByDepartment(departmentId: DepartmentId): {
  leadAgents: LeadAgentDefinition[];
  subAgents: SubAgentDefinition[];
} {
  return {
    leadAgents: AGENT_ORG_REGISTRY.leadAgents.filter((agent) => agent.departmentId === departmentId),
    subAgents: AGENT_ORG_REGISTRY.subAgents.filter((agent) => agent.departmentId === departmentId)
  };
}

export function getAgentsByExecutive(executiveId: ExecutiveId): {
  departments: DepartmentDefinition[];
  leadAgents: LeadAgentDefinition[];
  subAgents: SubAgentDefinition[];
} {
  const departments = AGENT_ORG_REGISTRY.departments.filter((department) => department.executiveOwnerId === executiveId);
  const departmentIds = new Set(departments.map((department) => department.departmentId));
  return {
    departments,
    leadAgents: AGENT_ORG_REGISTRY.leadAgents.filter((agent) => departmentIds.has(agent.departmentId)),
    subAgents: AGENT_ORG_REGISTRY.subAgents.filter((agent) => departmentIds.has(agent.departmentId))
  };
}

export function getSubAgentsByParent(parentLeadAgentId: LeadAgentId): SubAgentDefinition[] {
  return AGENT_ORG_REGISTRY.subAgents.filter((agent) => agent.parentLeadAgentId === parentLeadAgentId);
}

export function getReportingChainForAgent(agentId: LeadAgentId | SubAgentId): ReportingChainNode[] {
  if (agentId in SUB_AGENTS) {
    const subAgent = getSubAgentById(agentId as SubAgentId);
    const leadAgent = getLeadAgentById(subAgent.parentLeadAgentId);
    const executive = getExecutiveById(leadAgent.reportsToExecutiveId);
    return [
      { nodeType: "sub-agent", nodeId: subAgent.subAgentId, displayName: subAgent.displayName },
      { nodeType: "lead-agent", nodeId: leadAgent.leadAgentId, displayName: leadAgent.displayName },
      { nodeType: "executive", nodeId: executive.executiveId, displayName: executive.title }
    ];
  }

  const leadAgent = getLeadAgentById(agentId as LeadAgentId);
  const executive = getExecutiveById(leadAgent.reportsToExecutiveId);
  return [
    { nodeType: "lead-agent", nodeId: leadAgent.leadAgentId, displayName: leadAgent.displayName },
    { nodeType: "executive", nodeId: executive.executiveId, displayName: executive.title }
  ];
}

export function validateAgentOrgRegistry(registry: AgentOrgRegistry = AGENT_ORG_REGISTRY): void {
  const executiveIds = registry.executives.map((executive) => executive.executiveId);
  const departmentIds = registry.departments.map((department) => department.departmentId);
  const leadAgentIds = registry.leadAgents.map((agent) => agent.leadAgentId);
  const subAgentIds = registry.subAgents.map((agent) => agent.subAgentId);

  if (!uniqueIds(executiveIds)) {
    throw new Error("agent-org: duplicate executive ids");
  }
  if (!uniqueIds(departmentIds)) {
    throw new Error("agent-org: duplicate department ids");
  }
  if (!uniqueIds(leadAgentIds)) {
    throw new Error("agent-org: duplicate lead agent ids");
  }
  if (!uniqueIds(subAgentIds)) {
    throw new Error("agent-org: duplicate sub-agent ids");
  }

  const executiveIdSet = new Set(executiveIds);
  const departmentIdSet = new Set(departmentIds);
  const leadAgentIdSet = new Set(leadAgentIds);

  for (const executive of registry.executives) {
    if (executive.reportsTo && !executiveIdSet.has(executive.reportsTo)) {
      throw new Error(`agent-org: executive ${executive.executiveId} reports to unknown executive ${executive.reportsTo}`);
    }
    for (const departmentId of executive.ownsDepartments) {
      if (!departmentIdSet.has(departmentId)) {
        throw new Error(`agent-org: executive ${executive.executiveId} owns unknown department ${departmentId}`);
      }
    }
  }

  for (const department of registry.departments) {
    if (!executiveIdSet.has(department.executiveOwnerId)) {
      throw new Error(`agent-org: department ${department.departmentId} has unknown executive owner ${department.executiveOwnerId}`);
    }
  }

  for (const leadAgent of registry.leadAgents) {
    if (!departmentIdSet.has(leadAgent.departmentId)) {
      throw new Error(`agent-org: lead agent ${leadAgent.leadAgentId} has unknown department ${leadAgent.departmentId}`);
    }
    if (!executiveIdSet.has(leadAgent.reportsToExecutiveId)) {
      throw new Error(`agent-org: lead agent ${leadAgent.leadAgentId} has unknown executive ${leadAgent.reportsToExecutiveId}`);
    }
    if (leadAgent.executionAgentId && !(leadAgent.executionAgentId in AGENT_DEFINITIONS)) {
      throw new Error(`agent-org: lead agent ${leadAgent.leadAgentId} maps to unknown execution agent ${leadAgent.executionAgentId}`);
    }
    if (!leadAgent.primaryResponsibility.trim()) {
      throw new Error(`agent-org: lead agent ${leadAgent.leadAgentId} is missing primary responsibility`);
    }
  }

  for (const subAgent of registry.subAgents) {
    if (!leadAgentIdSet.has(subAgent.parentLeadAgentId)) {
      throw new Error(`agent-org: sub-agent ${subAgent.subAgentId} has unknown parent ${subAgent.parentLeadAgentId}`);
    }
    if (!departmentIdSet.has(subAgent.departmentId)) {
      throw new Error(`agent-org: sub-agent ${subAgent.subAgentId} has unknown department ${subAgent.departmentId}`);
    }
    if (!executiveIdSet.has(subAgent.reportsToExecutiveId)) {
      throw new Error(`agent-org: sub-agent ${subAgent.subAgentId} has unknown executive ${subAgent.reportsToExecutiveId}`);
    }
    if (!subAgent.primaryResponsibility.trim()) {
      throw new Error(`agent-org: sub-agent ${subAgent.subAgentId} is missing primary responsibility`);
    }
  }
}

validateAgentOrgRegistry();
