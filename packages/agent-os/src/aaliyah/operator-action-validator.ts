import { canExecuteOperatorQueueStatus, compareOperatorQueuePriority } from './operator-action-policy.js';
import { canonicalIssueKeyForQueueItem } from './operator-queue-canonicalization.js';
import type { AgentOsRepository } from '../persistence/repository.js';
import type { OperatorActionValidationResult } from './operator-action-types.js';
import type { OperatorQueueRecord } from './operator-queue-types.js';

export class AaliyahOperatorActionValidator {
  constructor(private readonly repository: AgentOsRepository) {}

  async validate(args: {
    tenantId: string;
    queueItem: OperatorQueueRecord;
  }): Promise<OperatorActionValidationResult> {
    const queueItem = args.queueItem;
    const canonicalIssueKey = canonicalIssueKeyForQueueItem(queueItem);

    if (!canExecuteOperatorQueueStatus(queueItem.status)) {
      if (queueItem.status === 'executed') {
        return { isExecutable: false, failureCode: 'QUEUE_ITEM_ALREADY_EXECUTED', canonicalIssueKey, queueItem };
      }
      if (queueItem.status === 'invalidated') {
        return { isExecutable: false, failureCode: 'QUEUE_ITEM_INVALIDATED', canonicalIssueKey, queueItem };
      }
      return { isExecutable: false, failureCode: 'QUEUE_ITEM_SUPERSEDED', canonicalIssueKey, queueItem };
    }

    if (!queueItem.actionableCommandType || !queueItem.actionableTargetType || !queueItem.actionableTargetId) {
      return { isExecutable: false, failureCode: 'ACTION_PATH_UNRESOLVABLE', canonicalIssueKey, queueItem };
    }

    const priorExecution = await this.repository.getOperatorActionLogByQueueItemId({
      tenantId: args.tenantId,
      queueItemId: queueItem.id
    });
    if (priorExecution && priorExecution.executionStatus === 'success') {
      return { isExecutable: false, failureCode: 'QUEUE_ITEM_ALREADY_EXECUTED', canonicalIssueKey, queueItem };
    }

    if (canonicalIssueKey) {
      const siblings = await this.repository.listOperatorQueueRecords({
        tenantId: args.tenantId,
        canonicalIssueKey,
        statuses: ['active', 'executed', 'suppressed', 'superseded']
      });
      const strongerSibling = siblings.find((sibling) => sibling.id !== queueItem.id && sibling.status === 'active' && compareOperatorQueuePriority(sibling, queueItem) < 0);
      if (strongerSibling) {
        return { isExecutable: false, failureCode: 'QUEUE_ITEM_SUPERSEDED', canonicalIssueKey, queueItem };
      }
    }

    return {
      isExecutable: true,
      resolvedActionPath: `${queueItem.actionableCommandType}:${queueItem.actionableTargetType}:${queueItem.actionableTargetId}`,
      canonicalIssueKey,
      queueItem
    };
  }
}
