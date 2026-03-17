import type { OpportunityRecord } from './opportunity-engine-types.js';

export function buildOpportunitySummary(args: {
  opportunityType: OpportunityRecord['opportunityType'];
  sourceType: string;
}): string {
  switch (args.opportunityType) {
    case 'dormant_contact':
      return 'A previously active relationship has gone quiet long enough to justify outreach.';
    case 'stalled_pipeline':
      return 'Progress appears stalled around a live relationship or workflow with no clean close-out.';
    case 'missed_follow_up_window':
      return 'A follow-up window appears to have passed without a next step.';
    case 'engagement_spike':
      return 'Recent activity suggests a relationship may be warming without matching founder action.';
    case 'recurring_block_pattern':
      return 'The same blocked pattern is repeating and is likely costing momentum.';
    case 'noop':
      return 'No opportunity is active for this source right now.';
  }
}

export function buildOpportunityReason(reason: string): string {
  return reason.trim();
}

export function buildOpportunityListMessage(count: number): string {
  return count === 1 ? 'Opportunity loaded successfully.' : 'Opportunities loaded successfully.';
}

export function buildOpportunityTitle(type: OpportunityRecord['opportunityType']): string {
  switch (type) {
    case 'dormant_contact':
      return 'Dormant contact opportunity';
    case 'stalled_pipeline':
      return 'Stalled pipeline opportunity';
    case 'missed_follow_up_window':
      return 'Missed follow-up window';
    case 'engagement_spike':
      return 'Engagement spike opportunity';
    case 'recurring_block_pattern':
      return 'Recurring block pattern';
    case 'noop':
      return 'No opportunity';
  }
}
