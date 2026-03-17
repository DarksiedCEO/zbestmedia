import { DIGEST_PRIORITY_LIMIT, humanizeDigestType } from './digest-composer-policy.js';
import type { DigestCompositionDraft, DigestSourceBundle, DigestType } from './digest-composer-types.js';

function formatBulletItems(items: string[]) {
  return items.length > 0 ? items.map((item) => `- ${item}`).join('\n') : '- None';
}

export function buildDigestDraft(args: {
  digestType: DigestType;
  bundle: DigestSourceBundle;
  idempotencyKey: string;
  windowKey: string;
  digestStatus: DigestCompositionDraft['digestStatus'];
}) {
  const topInsights = args.bundle.strategicInsights.slice(0, DIGEST_PRIORITY_LIMIT);
  const criticalNotifications = args.bundle.notifications.filter((notification) => notification.severity === 'critical').slice(0, DIGEST_PRIORITY_LIMIT);
  const topOpportunities = args.bundle.opportunities.slice(0, DIGEST_PRIORITY_LIMIT);
  const topRecommendations = args.bundle.recommendations.slice(0, DIGEST_PRIORITY_LIMIT);
  const recentFollowThrough = args.bundle.followThroughRecords.slice(0, DIGEST_PRIORITY_LIMIT);

  const title = `${humanizeDigestType(args.digestType)} — ${args.windowKey}`;
  const summary = args.digestStatus === 'skipped'
    ? 'No founder-grade digest items qualified for this window.'
    : [
        topInsights[0]?.summary,
        criticalNotifications[0]?.summary,
        topOpportunities[0]?.summary,
        topRecommendations[0]?.summary
      ].filter(Boolean).slice(0, 2).join(' ') || 'Founder attention is needed on the latest priorities and opportunities.';

  const bodyText = [
    title,
    '',
    'Top priorities',
    formatBulletItems(topInsights.map((item) => `${item.title}: ${item.summary}`)),
    '',
    'Critical issues',
    formatBulletItems(criticalNotifications.map((item) => `${item.title}: ${item.reason}`)),
    '',
    'Key opportunities',
    formatBulletItems(topOpportunities.map((item) => `${item.opportunityType.replace(/_/g, ' ')}: ${item.summary}`)),
    '',
    'Recommended founder actions',
    formatBulletItems(topRecommendations.map((item) => `${item.recommendationType.replace(/_/g, ' ')}: ${item.summary}`)),
    '',
    'Operational note',
    formatBulletItems(recentFollowThrough.map((item) => `${item.status}: ${item.summary}`))
  ].join('\n');

  return {
    digestType: args.digestType,
    digestStatus: args.digestStatus,
    title,
    summary,
    bodyText,
    idempotencyKey: args.idempotencyKey,
    windowKey: args.windowKey,
    relatedNotificationIds: args.bundle.notifications.map((item) => item.id),
    relatedOpportunityIds: args.bundle.opportunities.map((item) => item.id),
    relatedInsightIds: args.bundle.strategicInsights.map((item) => item.id),
    relatedRecommendationIds: args.bundle.recommendations.map((item) => item.id),
    relatedFollowThroughIds: args.bundle.followThroughRecords.map((item) => item.id),
    metadata: {
      windowKey: args.windowKey,
      digestType: args.digestType,
      counts: {
        insights: args.bundle.strategicInsights.length,
        notifications: args.bundle.notifications.length,
        opportunities: args.bundle.opportunities.length,
        recommendations: args.bundle.recommendations.length,
        followThrough: args.bundle.followThroughRecords.length
      }
    },
    composedAtIso: args.bundle.generatedAtIso
  };
}

export function buildDigestSendMessage(digestType: DigestType, replayed: boolean) {
  return replayed
    ? `${humanizeDigestType(digestType)} send replayed without creating a duplicate delivery.`
    : `${humanizeDigestType(digestType)} sent through the delivery router.`;
}
