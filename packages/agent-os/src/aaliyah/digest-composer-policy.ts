import { createHash } from 'node:crypto';

import type { DigestCompositionDraft, DigestSourceBundle, DigestType } from './digest-composer-types.js';

export const DIGEST_PRIORITY_LIMIT = 3;

export function buildDigestWindowKey(digestType: DigestType, generatedAtIso: string) {
  const date = new Date(generatedAtIso);
  if (digestType === 'daily_founder_digest' || digestType === 'critical_digest') {
    return generatedAtIso.slice(0, 10);
  }
  const firstDayOfYear = Date.UTC(date.getUTCFullYear(), 0, 1);
  const dayOfYear = Math.floor((date.getTime() - firstDayOfYear) / 86_400_000) + 1;
  const week = Math.ceil(dayOfYear / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export function buildDigestIdempotencyKey(args: {
  digestType: DigestType;
  windowKey: string;
  versionSeed: string;
}) {
  const digest = createHash('sha256').update(args.versionSeed).digest('hex').slice(0, 16);
  return `digest:${args.digestType}:${args.windowKey}:${digest}`;
}

export function shouldSendDigest(args: {
  digestType: DigestType;
  bundle: DigestSourceBundle;
}) {
  const criticalNotifications = args.bundle.notifications.filter((notification) => notification.severity === 'critical');
  const activeInsights = args.bundle.strategicInsights.filter((insight) => insight.status === 'active');
  const activeOpportunities = args.bundle.opportunities.filter((opportunity) => opportunity.status === 'active');
  const activeRecommendations = args.bundle.recommendations.filter((recommendation) => recommendation.status === 'active');
  const meaningfulFollowThrough = args.bundle.followThroughRecords.filter((record) => record.status !== 'noop');

  switch (args.digestType) {
    case 'critical_digest':
      return criticalNotifications.length > 0 || activeInsights.some((insight) => insight.insightType === 'attention_priority');
    case 'weekly_founder_brief':
      return activeInsights.length > 0 || activeOpportunities.length + activeRecommendations.length + meaningfulFollowThrough.length >= 4;
    case 'daily_founder_digest':
    default:
      return criticalNotifications.length > 0 || activeInsights.length > 0 || activeOpportunities.length > 0 || activeRecommendations.length > 0 || meaningfulFollowThrough.length > 0;
  }
}

export function buildDigestVersionSeed(bundle: DigestSourceBundle) {
  return [
    bundle.strategicInsights.map((item) => `${item.id}:${item.status}`).join(','),
    bundle.notifications.map((item) => `${item.id}:${item.severity}:${item.status}`).join(','),
    bundle.opportunities.map((item) => `${item.id}:${item.status}`).join(','),
    bundle.recommendations.map((item) => `${item.id}:${item.status}`).join(','),
    bundle.followThroughRecords.map((item) => `${item.id}:${item.status}`).join(',')
  ].join('|');
}

export function buildDigestMessage(args: { digestType: DigestType; digestStatus: DigestCompositionDraft['digestStatus']; replayed?: boolean }) {
  if (args.replayed) {
    return `${humanizeDigestType(args.digestType)} replayed without composing a duplicate.`;
  }
  if (args.digestStatus === 'skipped') {
    return `${humanizeDigestType(args.digestType)} was skipped because nothing qualified for delivery.`;
  }
  return `${humanizeDigestType(args.digestType)} composed successfully.`;
}

export function buildDigestListMessage(count: number) {
  return count === 1 ? 'Loaded 1 digest.' : `Loaded ${count} digests.`;
}

export function humanizeDigestType(digestType: DigestType) {
  switch (digestType) {
    case 'daily_founder_digest':
      return 'Daily founder digest';
    case 'weekly_founder_brief':
      return 'Weekly founder brief';
    case 'critical_digest':
      return 'Critical digest';
  }
}
