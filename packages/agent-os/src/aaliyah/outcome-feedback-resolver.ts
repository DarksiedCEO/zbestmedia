import { resolveIssueState } from './outcome-feedback-policy.js';
import type { IssueStateRecord, OutcomeFeedbackRecord, OutcomeFeedbackResolution } from './outcome-feedback-types.js';

export class AaliyahOutcomeFeedbackResolver {
  resolve(args: {
    priorState: IssueStateRecord | null;
    outcome: Pick<
      OutcomeFeedbackRecord,
      'outcomeType' | 'outcomeStatus' | 'reportedAtIso' | 'reasonCode'
    >;
  }): OutcomeFeedbackResolution {
    return resolveIssueState({
      priorState: args.priorState,
      outcome: args.outcome
    });
  }
}
