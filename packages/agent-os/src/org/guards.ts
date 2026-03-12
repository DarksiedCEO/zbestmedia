import {
  AGENT_ORG_REGISTRY,
  type AgentOrgRegistry,
  validateAgentOrgRegistry
} from "./registry.js";
import {
  RESPONSIBILITY_KEYS,
  RESPONSIBILITY_OWNER,
  OPERATIONAL_SIGNAL_TYPES,
  CODE_SENTINEL_SIGNAL_OWNERS,
  type OperationalSignalType,
  type ResponsibilityKey
} from "./selectors.js";
import {
  JINGLE_MODE_TO_RESPONSIBILITY,
  ROUTING_CATEGORY_TO_RESPONSIBILITY,
  ROUTING_CATEGORY_TO_SIGNAL
} from "./routing.js";
import {
  JINGLE_ROUTING_MODES,
  ROUTING_TASK_CATEGORIES,
  type RoutingTaskCategory
} from "./routing-types.js";
import type { ExecutiveDefinition, LeadAgentDefinition, SubAgentDefinition } from "./types.js";

export class AgentOrgIntegrityError extends Error {
  constructor(message: string) {
    super(message);
  }
}

type IntegrityInput = {
  registry?: AgentOrgRegistry;
  responsibilityOwner?: Record<ResponsibilityKey, LeadAgentDefinition["leadAgentId"] | null>;
  signalOwners?: Record<OperationalSignalType, SubAgentDefinition["subAgentId"]>;
  routeResponsibility?: Record<RoutingTaskCategory, ResponsibilityKey | null>;
  routeSignals?: Partial<Record<RoutingTaskCategory, OperationalSignalType>>;
  jingleModeResponsibility?: Record<(typeof JINGLE_ROUTING_MODES)[number], ResponsibilityKey>;
};

let integrityValidated = false;

export function ensureOrgSystemIntegrity(): void {
  if (integrityValidated) {
    return;
  }
  validateOrgSystemIntegrity();
  integrityValidated = true;
}

export function validateOrgSystemIntegrity(input: IntegrityInput = {}): void {
  const registry = input.registry ?? AGENT_ORG_REGISTRY;
  const responsibilityOwner = input.responsibilityOwner ?? RESPONSIBILITY_OWNER;
  const signalOwners = input.signalOwners ?? CODE_SENTINEL_SIGNAL_OWNERS;
  const routeResponsibility = input.routeResponsibility ?? ROUTING_CATEGORY_TO_RESPONSIBILITY;
  const routeSignals = input.routeSignals ?? ROUTING_CATEGORY_TO_SIGNAL;
  const jingleModeResponsibility = input.jingleModeResponsibility ?? JINGLE_MODE_TO_RESPONSIBILITY;

  validateAgentOrgRegistry(registry);
  validateExecutiveChains(registry.executives);
  validateLeadAndSubAgentChains(registry);
  validateResponsibilityOwnership(registry, responsibilityOwner);
  validateCodeSentinelCoverage(registry, signalOwners);
  validateRoutingCoherence(registry, responsibilityOwner, signalOwners, routeResponsibility, routeSignals, jingleModeResponsibility);
}

function validateExecutiveChains(executives: ExecutiveDefinition[]) {
  const byId = new Map(executives.map((executive) => [executive.executiveId, executive]));

  for (const executive of executives) {
    const seen = new Set<string>([executive.executiveId]);
    let cursor = executive;
    while (cursor.reportsTo) {
      if (seen.has(cursor.reportsTo)) {
        throw new AgentOrgIntegrityError(`agent-org: circular executive chain detected at ${cursor.reportsTo}`);
      }
      seen.add(cursor.reportsTo);
      const next = byId.get(cursor.reportsTo);
      if (!next) {
        throw new AgentOrgIntegrityError(`agent-org: executive ${cursor.executiveId} reports to unknown executive ${cursor.reportsTo}`);
      }
      cursor = next;
    }
  }
}

function validateLeadAndSubAgentChains(registry: AgentOrgRegistry) {
  const leadAgents = new Map(registry.leadAgents.map((agent) => [agent.leadAgentId, agent]));
  const departments = new Map(registry.departments.map((department) => [department.departmentId, department]));
  const seenSubAgents = new Set<string>();

  for (const leadAgent of registry.leadAgents) {
    const department = departments.get(leadAgent.departmentId);
    if (!department) {
      throw new AgentOrgIntegrityError(`agent-org: orphan lead agent ${leadAgent.leadAgentId}`);
    }
    if (department.executiveOwnerId !== leadAgent.reportsToExecutiveId) {
      throw new AgentOrgIntegrityError(
        `agent-org: lead agent ${leadAgent.leadAgentId} executive mismatch ${leadAgent.reportsToExecutiveId}:${department.executiveOwnerId}`
      );
    }
  }

  for (const subAgent of registry.subAgents) {
    if (seenSubAgents.has(subAgent.subAgentId)) {
      throw new AgentOrgIntegrityError(`agent-org: duplicate reporting hop for sub-agent ${subAgent.subAgentId}`);
    }
    seenSubAgents.add(subAgent.subAgentId);
    const parent = leadAgents.get(subAgent.parentLeadAgentId);
    if (!parent) {
      throw new AgentOrgIntegrityError(`agent-org: orphan sub-agent ${subAgent.subAgentId}`);
    }
    if (parent.departmentId !== subAgent.departmentId) {
      throw new AgentOrgIntegrityError(
        `agent-org: sub-agent ${subAgent.subAgentId} department mismatch ${subAgent.departmentId}:${parent.departmentId}`
      );
    }
    if (parent.reportsToExecutiveId !== subAgent.reportsToExecutiveId) {
      throw new AgentOrgIntegrityError(
        `agent-org: sub-agent ${subAgent.subAgentId} executive mismatch ${subAgent.reportsToExecutiveId}:${parent.reportsToExecutiveId}`
      );
    }
  }
}

function validateResponsibilityOwnership(
  registry: AgentOrgRegistry,
  responsibilityOwner: Record<ResponsibilityKey, LeadAgentDefinition["leadAgentId"] | null>
) {
  const leadIds = new Set(registry.leadAgents.map((agent) => agent.leadAgentId));
  for (const key of RESPONSIBILITY_KEYS) {
    const owner = responsibilityOwner[key];
    if (owner !== null && !leadIds.has(owner)) {
      throw new AgentOrgIntegrityError(`agent-org: responsibility ${key} resolves to unknown lead ${owner}`);
    }
  }
}

function validateCodeSentinelCoverage(
  registry: AgentOrgRegistry,
  signalOwners: Record<OperationalSignalType, SubAgentDefinition["subAgentId"]>
) {
  const subAgents = new Map(registry.subAgents.map((agent) => [agent.subAgentId, agent]));
  const seenOwners = new Set<string>();

  for (const signalType of OPERATIONAL_SIGNAL_TYPES) {
    const ownerId = signalOwners[signalType];
    const subAgent = subAgents.get(ownerId);
    if (!subAgent) {
      throw new AgentOrgIntegrityError(`agent-org: signal ${signalType} resolves to unknown sub-agent ${ownerId}`);
    }
    if (subAgent.parentLeadAgentId !== "code-sentinel") {
      throw new AgentOrgIntegrityError(`agent-org: signal ${signalType} escapes Code Sentinel via ${ownerId}`);
    }
    if (subAgent.reportsToExecutiveId !== "cto") {
      throw new AgentOrgIntegrityError(`agent-org: signal ${signalType} is outside CTO lane via ${ownerId}`);
    }
    if (seenOwners.has(ownerId)) {
      throw new AgentOrgIntegrityError(`agent-org: duplicate Code Sentinel signal owner ${ownerId}`);
    }
    seenOwners.add(ownerId);
  }
}

function validateRoutingCoherence(
  registry: AgentOrgRegistry,
  responsibilityOwner: Record<ResponsibilityKey, LeadAgentDefinition["leadAgentId"] | null>,
  signalOwners: Record<OperationalSignalType, SubAgentDefinition["subAgentId"]>,
  routeResponsibility: Record<RoutingTaskCategory, ResponsibilityKey | null>,
  routeSignals: Partial<Record<RoutingTaskCategory, OperationalSignalType>>,
  jingleModeResponsibility: Record<(typeof JINGLE_ROUTING_MODES)[number], ResponsibilityKey>
) {
  const leadAgents = new Map(registry.leadAgents.map((agent) => [agent.leadAgentId, agent]));

  for (const category of ROUTING_TASK_CATEGORIES) {
    if (category === "jingle_music") {
      for (const mode of JINGLE_ROUTING_MODES) {
        const responsibilityKey = jingleModeResponsibility[mode];
        const owner = responsibilityOwner[responsibilityKey];
        if (!owner || !leadAgents.has(owner)) {
          throw new AgentOrgIntegrityError(`agent-org: jingle route ${mode} has no valid owner`);
        }
      }
      if (jingleModeResponsibility.composition === jingleModeResponsibility.packaging) {
        throw new AgentOrgIntegrityError("agent-org: jingle routing is ambiguous");
      }
      continue;
    }

    const responsibilityKey = routeResponsibility[category];
    if (!responsibilityKey) {
      throw new AgentOrgIntegrityError(`agent-org: unsupported routed category ${category}`);
    }

    const owner = responsibilityOwner[responsibilityKey];
    if (!owner || !leadAgents.has(owner)) {
      throw new AgentOrgIntegrityError(`agent-org: route ${category} has no valid owner`);
    }

    const signalType = routeSignals[category];
    if (signalType) {
      if (owner !== "code-sentinel") {
        throw new AgentOrgIntegrityError(`agent-org: Code Sentinel route ${category} resolves outside code-sentinel`);
      }
      const subAgentId = signalOwners[signalType];
      if (!subAgentId) {
        throw new AgentOrgIntegrityError(`agent-org: route ${category} has no signal owner for ${signalType}`);
      }
    }
  }
}
