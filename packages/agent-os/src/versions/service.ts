import type { AgentId } from "../agents/registry.js";
import type { AgentOsRepository } from "../persistence/repository.js";

export class AgentVersionService {
  constructor(private readonly repository: AgentOsRepository) {}

  async createVersion(args: {
    tenantId: string;
    agentId: AgentId;
    versionLabel: string;
    definitionSnapshot: Record<string, unknown>;
    createdBy: string;
    createdAt?: string;
  }) {
    return this.repository.createAgentVersion(args);
  }

  async promoteVersion(args: {
    tenantId: string;
    agentId: AgentId;
    agentVersionId: string;
    promotedBy: string;
    reason: string;
    createdAt?: string;
  }) {
    return this.repository.promoteAgentVersion(args);
  }
}
