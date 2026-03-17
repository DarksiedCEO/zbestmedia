import type {
  CanonicalIssueState,
  OutcomeFeedbackRecord,
  OutcomeFeedbackResolution,
  OutcomeFeedbackStatus,
  OutcomeFeedbackType,
  OutcomeFeedbackSignals,
  IssueStateRecord
} from './outcome-feedback-types.js';

const RESOLVING_OUTCOMES: OutcomeFeedbackType[] = [
  'issue_resolved',
  'opportunity_converted',
  'escalation_cleared',
  'recommendation_accepted'
];

const UNRESOLVED_OUTCOMES: OutcomeFeedbackType[] = [
  'issue_unresolved',
  'opportunity_lost',
  'escalation_persisting',
  'action_failed_downstream'
];

export function resolveIssueState(args: {
  priorState: IssueStateRecord | null;
  outcome: Pick<OutcomeFeedbackRecord, 'outcomeType' | 'outcomeStatus' | 'reportedAtIso' | 'reasonCode'>;
}): OutcomeFeedbackResolution {
  const prior = args.priorState;
  const nextState = mapOutcomeToIssueState(prior?.currentState ?? 'open', args.outcome.outcomeType);
  const reopenCount = prior?.reopenCount ?? 0;
  const resolutionCount = prior?.resolutionCount ?? 0;
  const nextReopenCount = args.outcome.outcomeType === 'issue_reopened' ? reopenCount + 1 : reopenCount;
  const nextResolutionCount = RESOLVING_OUTCOMES.includes(args.outcome.outcomeType) ? resolutionCount + 1 : resolutionCount;
  return {
    currentState: nextState,
    reopenCount: nextReopenCount,
    resolutionCount: nextResolutionCount,
    signals: buildOutcomeSignals({
      priorState: prior,
      outcomeType: args.outcome.outcomeType,
      outcomeStatus: args.outcome.outcomeStatus,
      reportedAtIso: args.outcome.reportedAtIso,
      reopenCount: nextReopenCount,
      resolutionCount: nextResolutionCount
    })
  };
}

export function mapOutcomeToIssueState(currentState: CanonicalIssueState, outcomeType: OutcomeFeedbackType): CanonicalIssueState {
  if (outcomeType === 'recommendation_rejected') {
    return currentState === 'resolved' ? 'resolved' : 'dismissed';
  }
  if (outcomeType === 'action_deferred') {
    return 'in_progress';
  }
  if (outcomeType === 'issue_reopened') {
    return 'reopened';
  }
  if (RESOLVING_OUTCOMES.includes(outcomeType)) {
    return 'resolved';
  }
  if (UNRESOLVED_OUTCOMES.includes(outcomeType)) {
    return 'unresolved';
  }
  return 'open';
}

export function isResolutionOutcome(outcomeType: OutcomeFeedbackType) {
  return RESOLVING_OUTCOMES.includes(outcomeType);
}

export function requiresExecutedActionLog(outcomeType: OutcomeFeedbackType) {
  return outcomeType !== 'recommendation_rejected' && outcomeType !== 'action_deferred';
}

export function buildOutcomeSignals(args: {
  priorState: IssueStateRecord | null;
  outcomeType: OutcomeFeedbackType;
  outcomeStatus: OutcomeFeedbackStatus;
  reportedAtIso: string;
  reopenCount: number;
  resolutionCount: number;
}): OutcomeFeedbackSignals {
  const wasRecentlyRejected = args.outcomeType === 'recommendation_rejected' || args.outcomeStatus === 'rejected';
  const wasRecentlyResolved = isResolutionOutcome(args.outcomeType);
  const repeatedFailures = (args.priorState?.metadata.hasRepeatedFailure ?? false)
    || args.outcomeType === 'action_failed_downstream'
    || (args.outcomeType === 'issue_unresolved' && args.reopenCount > 0);
  return {
    lastOutcomeAtIso: args.reportedAtIso,
    lastOutcomeType: args.outcomeType,
    lastOutcomeStatus: args.outcomeStatus,
    reopenCount: args.reopenCount,
    resolutionCount: args.resolutionCount,
    wasRecentlyRejected,
    wasRecentlyResolved,
    hasRepeatedFailure: repeatedFailures
  };
}

export function buildOutcomeListMessage(count: number) {
  return count === 1 ? 'Loaded 1 outcome feedback record.' : `Loaded ${count} outcome feedback records.`;
}
