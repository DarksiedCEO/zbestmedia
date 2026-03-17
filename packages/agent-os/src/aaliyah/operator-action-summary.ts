import type { OperatorActionExecutionStatus } from './operator-action-types.js';

export function buildOperatorActionSummary(args: {
  executionStatus: OperatorActionExecutionStatus;
  actionPath: string;
  queueItemTitle: string;
  suppressedCount?: number;
  failureReason?: string | null;
}) {
  if (args.executionStatus === 'success') {
    const collapsed = args.suppressedCount && args.suppressedCount > 0
      ? ` Suppressed ${args.suppressedCount} weaker sibling queue items.`
      : '';
    return `Executed ${args.actionPath} from operator queue item "${args.queueItemTitle}".${collapsed}`;
  }
  if (args.executionStatus === 'already_executed') {
    return `Skipped operator queue execution because "${args.queueItemTitle}" was already executed.`;
  }
  if (args.executionStatus === 'superseded') {
    return `Blocked operator queue execution because a stronger item now supersedes "${args.queueItemTitle}".`;
  }
  if (args.executionStatus === 'invalidated') {
    return `Invalidated operator queue execution because the source truth for "${args.queueItemTitle}" no longer supports action.`;
  }
  if (args.executionStatus === 'not_actionable') {
    return `Blocked operator queue execution because "${args.queueItemTitle}" is no longer actionable.`;
  }
  return `Operator queue execution failed for "${args.queueItemTitle}": ${args.failureReason ?? 'unknown failure'}.`;
}
