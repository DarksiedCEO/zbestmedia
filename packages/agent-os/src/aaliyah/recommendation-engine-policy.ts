import { createHash } from 'node:crypto';

import type { RecommendationRecord, RecommendationSourceRef } from './recommendation-engine-types.js';

export const RECOMMENDATION_POLICY_ORDER = [
  'REC-002-blocked-founder-intent',
  'REC-001-stale-high-priority-work',
  'REC-003-approved-draft-still-open',
  'REC-005-event-recap-gap',
  'REC-004-dormant-contact-prior-value',
  'REC-006-no-action'
] as const;

export type RecommendationPolicyKey = (typeof RECOMMENDATION_POLICY_ORDER)[number];

function hash(parts: Array<string | null | undefined>) {
  return createHash('sha256').update(parts.map((part) => part ?? '').join('|')).digest('hex').slice(0, 16);
}

export function buildRecommendationIdempotencyKey(args: {
  recommendationType: RecommendationRecord['recommendationType'];
  source: RecommendationSourceRef;
  sourceVersion: string;
}): string {
  return `rec:${args.recommendationType}:${args.source.sourceType}:${args.source.sourceId}:${hash([args.sourceVersion])}`;
}

export function isDormant(lastTouchedAt: string | null, thresholdDays = 14): boolean {
  if (!lastTouchedAt) {
    return false;
  }
  return Date.now() - Date.parse(lastTouchedAt) > thresholdDays * 24 * 60 * 60 * 1000;
}
