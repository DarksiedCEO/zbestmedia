import { AGENT_MEMORY_PARTITIONS } from "./partitions.js";
import type { AgentId } from "../agents/registry.js";
import type { AgentOsRepository } from "../persistence/repository.js";
import type { MemoryEntryRecord } from "../persistence/contracts.js";

export class AgentMemoryAccessError extends Error {
  constructor(message: string) {
    super(message);
  }
}

function getPartition(agentId: AgentId) {
  return AGENT_MEMORY_PARTITIONS[agentId];
}

export class MemoryPartitionService {
  constructor(private readonly repository: AgentOsRepository) {}

  async writeOwnedEntry(args: {
    tenantId: string;
    agentId: AgentId;
    collection: string;
    entryKey: string;
    entryValue: Record<string, unknown>;
    createdBy: string;
    createdAt?: string;
  }): Promise<MemoryEntryRecord> {
    const partition = getPartition(args.agentId);
    if (!partition.ownedCollections.includes(args.collection)) {
      throw new AgentMemoryAccessError(`collection_not_owned:${args.agentId}:${args.collection}`);
    }

    return this.repository.storeMemoryEntry({
      tenantId: args.tenantId,
      partitionId: partition.partitionId,
      agentId: args.agentId,
      collection: args.collection,
      entryKey: args.entryKey,
      entryValue: args.entryValue,
      classification: "owned",
      createdBy: args.createdBy,
      createdAt: args.createdAt
    });
  }

  async writeSharedPolicyEntry(args: {
    tenantId: string;
    agentId: AgentId;
    entryKey: string;
    entryValue: Record<string, unknown>;
    createdBy: string;
    createdAt?: string;
  }): Promise<MemoryEntryRecord> {
    const partition = getPartition(args.agentId);
    return this.repository.storeMemoryEntry({
      tenantId: args.tenantId,
      partitionId: partition.partitionId,
      agentId: args.agentId,
      collection: "company_policy",
      entryKey: args.entryKey,
      entryValue: args.entryValue,
      classification: "shared_policy",
      createdBy: args.createdBy,
      createdAt: args.createdAt
    });
  }

  async readPartition(args: {
    tenantId: string;
    agentId: AgentId;
    collection?: string;
  }): Promise<MemoryEntryRecord[]> {
    const partition = getPartition(args.agentId);
    if (args.collection && args.collection !== "company_policy" && !partition.ownedCollections.includes(args.collection)) {
      throw new AgentMemoryAccessError(`collection_not_owned:${args.agentId}:${args.collection}`);
    }
    return this.repository.listMemoryEntries({
      tenantId: args.tenantId,
      partitionId: partition.partitionId,
      collection: args.collection
    });
  }
}
