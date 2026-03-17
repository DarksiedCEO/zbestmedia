import type { RecommendationRecord } from './recommendation-engine-types.js';

export function buildRecommendationSummary(args: {
  recommendationType: RecommendationRecord['recommendationType'];
  sourceType: string;
}): string {
  switch (args.recommendationType) {
    case 'escalate_now':
      return 'Escalate the stale high-priority work now.';
    case 'review_blocked':
      return 'Review the blocked recommendation path before momentum dies.';
    case 'send_now':
      return 'Approved outreach still looks open and ready for founder action.';
    case 'follow_up_now':
      return 'A follow-up step is due now based on the current state.';
    case 'revive_contact':
      return 'This relationship has gone quiet long enough to justify revival.';
    case 'schedule_next':
      return 'A schedule-linked next step is missing and should be set now.';
    case 'noop':
      return 'No founder recommendation is active for this source.';
  }
}

export function buildRecommendationReason(reason: string): string {
  return reason.trim();
}

export function buildRecommendationListMessage(count: number): string {
  return count === 1 ? 'Recommendation loaded successfully.' : 'Recommendations loaded successfully.';
}
