import type { OutcomeFeedbackRecord, OutcomeFeedbackStatus, OutcomeFeedbackType } from './outcome-feedback-types.js';

export function buildOutcomeFeedbackMessage(args: {
  outcomeType: OutcomeFeedbackType;
  outcomeStatus: OutcomeFeedbackStatus;
  replayed: boolean;
}) {
  if (args.replayed) {
    return 'Replayed prior outcome feedback record.';
  }
  return `${humanizeOutcomeType(args.outcomeType)} recorded as ${args.outcomeStatus.replace(/_/g, ' ')}.`;
}

export function buildOutcomeFeedbackDetailMessage(outcome: OutcomeFeedbackRecord) {
  return `${humanizeOutcomeType(outcome.outcomeType)} recorded for ${outcome.canonicalIssueKey}.`;
}

function humanizeOutcomeType(outcomeType: OutcomeFeedbackType) {
  return outcomeType.replace(/_/g, ' ');
}
