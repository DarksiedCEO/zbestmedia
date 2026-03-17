import { buildDigestIdempotencyKey, buildDigestVersionSeed, buildDigestWindowKey, shouldSendDigest } from './digest-composer-policy.js';
import { buildDigestDraft } from './digest-composer-summary.js';
import type { DigestType, DigestSourceBundle } from './digest-composer-types.js';
import type { FounderPreferencesRecord } from './founder-preferences-types.js';

export function composeDigestDraft(args: {
  digestType: DigestType;
  bundle: DigestSourceBundle;
  preferences?: FounderPreferencesRecord;
}) {
  const windowKey = buildDigestWindowKey(args.digestType, args.bundle.generatedAtIso);
  const versionSeed = buildDigestVersionSeed(args.bundle);
  const idempotencyKey = buildDigestIdempotencyKey({ digestType: args.digestType, windowKey, versionSeed });
  const enabled =
    (args.digestType === 'daily_founder_digest' && (args.preferences?.digest.dailyDigestEnabled ?? true))
    || (args.digestType === 'weekly_founder_brief' && (args.preferences?.digest.weeklyBriefEnabled ?? true))
    || (args.digestType === 'critical_digest' && (args.preferences?.digest.criticalDigestEnabled ?? true));
  const shouldSend = enabled && shouldSendDigest({ digestType: args.digestType, bundle: args.bundle });
  const hasContent = args.bundle.notifications.length > 0
    || args.bundle.opportunities.length > 0
    || args.bundle.strategicInsights.length > 0
    || args.bundle.recommendations.length > 0
    || args.bundle.followThroughRecords.length > 0;
  const digestStatus = shouldSend && (hasContent || (args.preferences?.digest.sendEmptyDigests ?? false)) ? 'composed' : 'skipped';
  return buildDigestDraft({
    digestType: args.digestType,
    bundle: args.bundle,
    idempotencyKey,
    windowKey,
    digestStatus
  });
}
