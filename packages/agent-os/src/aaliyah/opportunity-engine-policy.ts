import { createHash } from 'node:crypto';

import type { OpportunityRecord, OpportunitySourceRef } from './opportunity-engine-types.js';

export const OPPORTUNITY_POLICY_ORDER = [
  'OPP-005-recurring-block-pattern',
  'OPP-003-missed-follow-up-window',
  'OPP-001-dormant-high-value-contact',
  'OPP-002-stalled-pipeline',
  'OPP-004-engagement-spike',
  'OPP-006-no-action'
] as const;

export type OpportunityPolicyKey = (typeof OPPORTUNITY_POLICY_ORDER)[number];

function hash(parts: Array<string | null | undefined>) {
  return createHash('sha256').update(parts.map((part) => part ?? '').join('|')).digest('hex').slice(0, 16);
}

export function buildOpportunityIdempotencyKey(args: {
  opportunityType: OpportunityRecord['opportunityType'];
  source: OpportunitySourceRef;
  sourceVersion: string;
}): string {
  return `opp:${args.opportunityType}:${args.source.sourceType}:${args.source.sourceId}:${hash([args.sourceVersion])}`;
}

export function isDormantFrom(referenceIso: string, lastTouchedAt: string | null, thresholdDays = 21): boolean {
  if (!lastTouchedAt) {
    return false;
  }
  const lastTouched = Date.parse(lastTouchedAt);
  const reference = Date.parse(referenceIso);
  if (Number.isNaN(lastTouched) || Number.isNaN(reference)) {
    return false;
  }
  return reference - lastTouched > thresholdDays * 24 * 60 * 60 * 1000;
}

export function isPastDue(referenceIso: string, dueAt: string | null): boolean {
  if (!dueAt) {
    return false;
  }
  const due = Date.parse(dueAt);
  const reference = Date.parse(referenceIso);
  if (Number.isNaN(due) || Number.isNaN(reference)) {
    return false;
  }
  return due < reference;
}
