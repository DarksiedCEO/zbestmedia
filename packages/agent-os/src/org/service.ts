import {
  AGENT_ORG_MANIFEST_VERSION,
  AGENT_ORG_REGISTRY,
  getAgentsByDepartment,
  getAgentsByExecutive,
  getDepartmentById,
  getExecutiveById,
  getLeadAgentById,
  getReportingChainForAgent,
  getSubAgentById,
  getSubAgentsByParent,
  listDepartments,
  listExecutives,
  listLeadAgents,
  listSubAgents
} from "./registry.js";
import {
  buildCodeSentinelSignal,
  getCodeSentinelSignalDefinition,
  getCodeSentinelSignalOwnership,
  listCodeSentinelSignals,
  type CodeSentinelSignalPayload,
  type CodeSentinelSignalStatus
} from "./code-sentinel.js";
import { ensureOrgSystemIntegrity } from "./guards.js";
import {
  getLeadAgentAllowedScope,
  getLeadAgentForbiddenScope,
  getOperationalSignalOwner,
  getResponsibilityOwner,
  type OperationalSignalType,
  type ResponsibilityKey
} from "./selectors.js";
import type { DepartmentId, ExecutiveId, LeadAgentId, SubAgentId } from "./types.js";

const LEAD_AGENT_ID_SET = new Set(AGENT_ORG_REGISTRY.leadAgents.map((agent) => agent.leadAgentId));
const SUB_AGENT_ID_SET = new Set(AGENT_ORG_REGISTRY.subAgents.map((agent) => agent.subAgentId));

export class AgentOrgService {
  constructor() {
    ensureOrgSystemIntegrity();
  }

  isLeadAgentId(agentId: string): agentId is LeadAgentId {
    return LEAD_AGENT_ID_SET.has(agentId as LeadAgentId);
  }

  isSubAgentId(agentId: string): agentId is SubAgentId {
    return SUB_AGENT_ID_SET.has(agentId as SubAgentId);
  }

  getManifest() {
    return {
      manifestVersion: AGENT_ORG_MANIFEST_VERSION,
      ...AGENT_ORG_REGISTRY
    };
  }

  getManifestVersion() {
    return AGENT_ORG_MANIFEST_VERSION;
  }

  listExecutives() {
    return listExecutives();
  }

  listDepartments() {
    return listDepartments();
  }

  listLeadAgents() {
    return listLeadAgents();
  }

  listSubAgents() {
    return listSubAgents();
  }

  getExecutive(executiveId: ExecutiveId) {
    return getExecutiveById(executiveId);
  }

  getDepartment(departmentId: DepartmentId) {
    return getDepartmentById(departmentId);
  }

  getLeadAgent(leadAgentId: LeadAgentId) {
    return getLeadAgentById(leadAgentId);
  }

  getSubAgent(subAgentId: SubAgentId) {
    return getSubAgentById(subAgentId);
  }

  getExecutiveOwnerForDepartment(departmentId: DepartmentId) {
    const department = getDepartmentById(departmentId);
    return getExecutiveById(department.executiveOwnerId);
  }

  getDepartmentAgents(departmentId: DepartmentId) {
    return getAgentsByDepartment(departmentId);
  }

  getExecutiveAgents(executiveId: ExecutiveId) {
    return getAgentsByExecutive(executiveId);
  }

  getSubAgentsForLead(leadAgentId: LeadAgentId) {
    return getSubAgentsByParent(leadAgentId);
  }

  getReportingChain(agentId: LeadAgentId | SubAgentId) {
    return getReportingChainForAgent(agentId);
  }

  getLeadAgentScope(leadAgentId: LeadAgentId) {
    return {
      allowedScope: getLeadAgentAllowedScope(leadAgentId),
      forbiddenScope: getLeadAgentForbiddenScope(leadAgentId)
    };
  }

  resolveResponsibilityOwner(responsibilityKey: ResponsibilityKey) {
    const leadAgentId = getResponsibilityOwner(responsibilityKey);
    return leadAgentId ? getLeadAgentById(leadAgentId) : null;
  }

  resolveOperationalSignalOwner(signalType: OperationalSignalType) {
    return getOperationalSignalOwner(signalType);
  }

  listCodeSentinelSignals() {
    return listCodeSentinelSignals();
  }

  getCodeSentinelSignal(signalType: OperationalSignalType) {
    return getCodeSentinelSignalOwnership(signalType);
  }

  buildCodeSentinelSignal(args: {
    signalType: OperationalSignalType;
    status: CodeSentinelSignalStatus;
    source: string;
    message: string;
    metadata?: Record<string, unknown>;
    observedAt?: string;
  }): CodeSentinelSignalPayload {
    return buildCodeSentinelSignal(args);
  }

  getCodeSentinelSignalDefinition(signalType: OperationalSignalType) {
    return getCodeSentinelSignalDefinition(signalType);
  }

}
