import {
  OutcomeFeedbackConflictError,
  OutcomeFeedbackNotFoundError,
  OutcomeFeedbackValidationError
} from './outcome-feedback-errors.js';
import { isResolutionOutcome, requiresExecutedActionLog } from './outcome-feedback-policy.js';
import type { OutcomeFeedbackLineage, RecordOutcomeFeedbackRequest } from './outcome-feedback-types.js';

export class AaliyahOutcomeFeedbackValidator {
  validate(args: {
    lineage: OutcomeFeedbackLineage | null;
    request: RecordOutcomeFeedbackRequest;
  }) {
    if (!args.lineage) {
      throw new OutcomeFeedbackNotFoundError('Operator queue item was not found for outcome feedback.');
    }

    const { lineage, request } = args;
    if (!lineage.queueItem.canonicalIssueKey) {
      throw new OutcomeFeedbackConflictError('Queue item is missing canonical issue lineage.');
    }

    if (request.operatorActionLogId && (!lineage.operatorActionLog || lineage.operatorActionLog.id !== request.operatorActionLogId)) {
      throw new OutcomeFeedbackConflictError('Operator action log does not match the queue item lineage.');
    }

    if (lineage.operatorActionLog && lineage.operatorActionLog.queueItemId !== lineage.queueItem.id) {
      throw new OutcomeFeedbackConflictError('Operator action log queue lineage does not match.');
    }

    if (requiresExecutedActionLog(request.outcomeType)) {
      if (!lineage.operatorActionLog) {
        throw new OutcomeFeedbackValidationError('Outcome type requires an operator action log.');
      }
      if (lineage.operatorActionLog.executionStatus !== 'success') {
        throw new OutcomeFeedbackValidationError('Only successfully executed operator actions can receive this outcome type.');
      }
    }

    if (isResolutionOutcome(request.outcomeType) && !lineage.operatorActionLog?.commandId) {
      throw new OutcomeFeedbackValidationError('Resolution feedback requires a successful founder command lineage.');
    }

    if (request.outcomeType === 'recommendation_rejected' && lineage.queueItem.sourceType !== 'recommendation') {
      throw new OutcomeFeedbackValidationError('Recommendation rejection feedback requires a recommendation-backed queue item.');
    }

    return {
      canonicalIssueKey: lineage.queueItem.canonicalIssueKey,
      sourceType: lineage.queueItem.sourceType,
      sourceId: lineage.queueItem.sourceId,
      commandId: lineage.operatorActionLog?.commandId ?? null
    };
  }
}
