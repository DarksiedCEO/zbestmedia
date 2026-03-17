import type { AgentOsRepository } from '../persistence/repository.js';
import type { OutcomeFeedbackLineage } from './outcome-feedback-types.js';

export class AaliyahOutcomeFeedbackSources {
  constructor(private readonly repository: AgentOsRepository) {}

  async loadLineage(args: {
    tenantId: string;
    queueItemId: string;
    operatorActionLogId: string | null;
  }): Promise<OutcomeFeedbackLineage | null> {
    const queueItem = await this.repository.getOperatorQueueRecordById({
      tenantId: args.tenantId,
      queueItemId: args.queueItemId
    });
    if (!queueItem) {
      return null;
    }

    const operatorActionLog = args.operatorActionLogId
      ? await this.repository.getOperatorActionLogById({
          tenantId: args.tenantId,
          actionLogId: args.operatorActionLogId
        })
      : null;

    const command = operatorActionLog?.commandId
      ? await this.repository.getFounderCommandById({
          tenantId: args.tenantId,
          commandId: operatorActionLog.commandId
        })
      : null;

    const issueState = queueItem.canonicalIssueKey
      ? await this.repository.getIssueStateByCanonicalIssueKey({
          tenantId: args.tenantId,
          canonicalIssueKey: queueItem.canonicalIssueKey
        })
      : null;

    return {
      queueItem: {
        id: queueItem.id,
        tenantId: queueItem.tenantId,
        canonicalIssueKey: queueItem.canonicalIssueKey,
        sourceType: queueItem.sourceType,
        sourceId: queueItem.sourceId,
        status: queueItem.status,
        actionableCommandType: queueItem.actionableCommandType
      },
      operatorActionLog: operatorActionLog
        ? {
            id: operatorActionLog.id,
            queueItemId: operatorActionLog.queueItemId,
            commandId: operatorActionLog.commandId,
            executionStatus: operatorActionLog.executionStatus,
            canonicalIssueKey: operatorActionLog.canonicalIssueKey
          }
        : null,
      command: command
        ? {
            id: command.id,
            commandType: command.commandType,
            targetType: command.targetType,
            targetId: command.targetId,
            executionStatus: command.executionStatus
          }
        : null,
      issueState
    };
  }
}
