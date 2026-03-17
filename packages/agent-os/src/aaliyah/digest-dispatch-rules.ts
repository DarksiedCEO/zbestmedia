import { buildDigestIdempotencyKey, buildDigestVersionSeed, buildDigestWindowKey, shouldSendDigest } from './digest-composer-policy.js';
import { buildDigestDraft } from './digest-composer-summary.js';
import type { DigestType, DigestSourceBundle } from './digest-composer-types.js';

export function composeDigestDraft(args: {
  digestType: DigestType;
  bundle: DigestSourceBundle;
}) {
  const windowKey = buildDigestWindowKey(args.digestType, args.bundle.generatedAtIso);
  const versionSeed = buildDigestVersionSeed(args.bundle);
  const idempotencyKey = buildDigestIdempotencyKey({ digestType: args.digestType, windowKey, versionSeed });
  const digestStatus = shouldSendDigest({ digestType: args.digestType, bundle: args.bundle }) ? 'composed' : 'skipped';
  return buildDigestDraft({
    digestType: args.digestType,
    bundle: args.bundle,
    idempotencyKey,
    windowKey,
    digestStatus
  });
}
