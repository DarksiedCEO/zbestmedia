import { AGENT_DEFINITIONS, type AgentId } from "../agents/registry.js";
import { AGENT_EVAL_PROFILES } from "../evals/specs.js";
import { AGENT_LIFECYCLE_PROFILES } from "../lifecycle/config.js";
import { AGENT_MEMORY_PARTITIONS } from "../memory/partitions.js";
import { AGENT_POLICY_PROFILES } from "../policy/profiles.js";
import type {
  AgentOsFoundationBundle,
  AgentPolicyProfileRecord,
  AgentMemoryPartitionRecord,
  AgentRecord,
  AgentVersionRecord
} from "./contracts.js";

export type BuildFoundationBundleArgs = {
  tenantId: string;
  createdBy: string;
  versionLabel: string;
  createdAt?: string;
};

function buildVersionId(agentId: AgentId, versionLabel: string): string {
  return `${agentId}:${versionLabel}`;
}

export function buildAgentOsFoundationBundle(args: BuildFoundationBundleArgs): AgentOsFoundationBundle {
  const createdAt = args.createdAt ?? new Date().toISOString();
  const agentIds = Object.keys(AGENT_DEFINITIONS) as AgentId[];

  const agents: AgentRecord[] = [];
  const versions: AgentVersionRecord[] = [];
  const policyProfiles: AgentPolicyProfileRecord[] = [];
  const memoryPartitions: AgentMemoryPartitionRecord[] = [];

  for (const agentId of agentIds) {
    const definition = AGENT_DEFINITIONS[agentId];
    const policy = AGENT_POLICY_PROFILES[agentId];
    const memory = AGENT_MEMORY_PARTITIONS[agentId];
    const lifecycle = AGENT_LIFECYCLE_PROFILES[agentId];
    const evalProfile = AGENT_EVAL_PROFILES[agentId];
    const agentVersionId = buildVersionId(agentId, args.versionLabel);

    agents.push({
      tenantId: args.tenantId,
      agentId,
      displayName: definition.displayName,
      taskDomain: definition.taskDomain,
      workflowRole: definition.workflowRole,
      policyProfileId: definition.policyProfileId,
      memoryPartitionId: definition.memoryPartitionId,
      lifecycleProfileId: definition.lifecycleProfileId,
      evalProfileId: definition.evalProfileId,
      currentVersionId: agentVersionId,
      currentStatus: "draft",
      prohibitedDomains: definition.prohibitedDomains,
      createdAt,
      updatedAt: createdAt,
      retiredAt: null
    });

    versions.push({
      tenantId: args.tenantId,
      agentVersionId,
      agentId,
      versionLabel: args.versionLabel,
      definitionSnapshot: {
        definition,
        policy,
        memory,
        lifecycle,
        evalProfile
      },
      createdBy: args.createdBy,
      createdAt,
      replacedByVersionId: null
    });

    policyProfiles.push({
      tenantId: args.tenantId,
      policyProfileId: policy.profileId,
      agentId,
      allowedCapabilities: [...policy.allowed],
      deniedCapabilities: [...policy.denied],
      profileSnapshot: {
        profileId: policy.profileId,
        allowed: policy.allowed,
        denied: policy.denied
      },
      createdAt
    });

    memoryPartitions.push({
      tenantId: args.tenantId,
      partitionId: memory.partitionId,
      agentId,
      namespace: memory.namespace,
      ownedCollections: [...memory.ownedCollections],
      sharedAccess: [...memory.sharedAccess],
      partitionSnapshot: {
        partitionId: memory.partitionId,
        namespace: memory.namespace,
        ownedCollections: memory.ownedCollections,
        sharedAccess: memory.sharedAccess
      },
      createdAt
    });
  }

  return { agents, versions, policyProfiles, memoryPartitions };
}
