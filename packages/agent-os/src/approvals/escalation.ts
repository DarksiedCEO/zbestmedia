import type { AgentId } from "../agents/registry.js";
import type { ApprovalRequestRecord } from "../persistence/contracts.js";
import type { AgentOsRepository } from "../persistence/repository.js";

export class ApprovalEscalationService {
  constructor(private readonly repository: AgentOsRepository) {}

  async escalateStaleRequests(args: {
    tenantId: string;
    olderThanIso: string;
    agentId?: AgentId;
    limit?: number;
  }): Promise<ApprovalRequestRecord[]> {
    const stale = await this.repository.listStaleApprovalRequests(args);
    const escalated: ApprovalRequestRecord[] = [];

    for (const request of stale) {
      escalated.push(
        await this.repository.markApprovalEscalated({
          tenantId: args.tenantId,
          approvalRequestId: request.approvalRequestId
        })
      );
    }

    return escalated;
  }
}
