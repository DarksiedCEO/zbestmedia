import type { OperatorQueuePriorityBand, OperatorQueueRecord, OperatorQueueSourceType, OperatorQueueStatus } from './operator-queue-types.js';

export function computeOperatorQueueStaleAfter(args: {
  evaluatedAtIso: string;
  sourceType: OperatorQueueSourceType;
  priorityBand: OperatorQueuePriorityBand;
}) {
  const evaluatedAt = Date.parse(args.evaluatedAtIso);
  const minutes = args.sourceType === 'escalation'
    ? 10
    : args.priorityBand === 'critical'
      ? 15
      : args.priorityBand === 'high'
        ? 30
        : args.sourceType === 'strategic_insight' || args.sourceType === 'opportunity'
          ? 240
          : 60;
  return new Date(evaluatedAt + minutes * 60 * 1000).toISOString();
}

export function isOperatorQueueStale(queueItem: Pick<OperatorQueueRecord, 'staleAfterAtIso'>, nowIso: string) {
  return nowIso >= queueItem.staleAfterAtIso;
}

export function canExecuteOperatorQueueStatus(status: OperatorQueueStatus) {
  return status === 'active';
}

export function compareOperatorQueuePriority(left: Pick<OperatorQueueRecord, 'priorityBand' | 'priorityScore' | 'createdAtIso' | 'queueItemType'>, right: Pick<OperatorQueueRecord, 'priorityBand' | 'priorityScore' | 'createdAtIso' | 'queueItemType'>) {
  const bandOrder: Record<OperatorQueuePriorityBand, number> = { critical: 0, high: 1, normal: 2 };
  const bandDelta = bandOrder[left.priorityBand] - bandOrder[right.priorityBand];
  if (bandDelta !== 0) return bandDelta;
  if (right.priorityScore !== left.priorityScore) return right.priorityScore - left.priorityScore;
  if (left.queueItemType !== right.queueItemType) {
    return left.queueItemType === 'immediate_action' ? -1 : right.queueItemType === 'immediate_action' ? 1 : 0;
  }
  return right.createdAtIso.localeCompare(left.createdAtIso);
}
