import { isDormant } from './recommendation-engine-policy.js';
import { buildRecommendationIdempotencyKey } from './recommendation-engine-policy.js';
import { buildRecommendationReason, buildRecommendationSummary } from './recommendation-engine-summary.js';
import type { FounderPreferencesRecord } from './founder-preferences-types.js';
import type { RecommendationDraft, RecommendationSourceBundle } from './recommendation-engine-types.js';

export function evaluateRecommendation(args: {
  bundle: RecommendationSourceBundle;
  evaluatedAtIso: string;
  preferences?: FounderPreferencesRecord;
}): RecommendationDraft {
  const { bundle } = args;
  const escalateHighPriorityOnly = args.preferences?.recommendation.escalateHighPriorityOnly ?? true;
  const reviveContactRequiresPriorValue = args.preferences?.recommendation.reviveContactRequiresPriorValue ?? true;

  if (bundle.followThroughRecord?.status === 'blocked') {
    return buildDraft({
      bundle,
      recommendationType: 'review_blocked',
      status: 'active',
      reason: 'Blocked follow-through context still needs founder attention.',
      metadata: {
        targetType: bundle.founderCommand?.targetType ?? null,
        targetId: bundle.founderCommand?.targetId ?? bundle.task?.id ?? bundle.contact?.id ?? null
      },
      evaluatedAtIso: args.evaluatedAtIso
    });
  }

  if (
    bundle.followThroughRecord?.status === 'stale'
    && (
      !escalateHighPriorityOnly
      || ['high', 'critical'].includes(bundle.task?.priority ?? '')
    )
  ) {
    return buildDraft({
      bundle,
      recommendationType: 'escalate_now',
      status: 'active',
      reason: 'Stale high-priority work should be escalated now.',
      metadata: {
        targetType: bundle.task ? 'task' : null,
        targetId: bundle.task?.id ?? null,
        escalationReason: 'urgent'
      },
      evaluatedAtIso: args.evaluatedAtIso
    });
  }

  if (
    bundle.founderCommand
    && bundle.founderCommand.commandType === 'approve_draft'
    && bundle.founderCommand.executionStatus === 'executed'
    && !bundle.followThroughRecord
  ) {
    return buildDraft({
      bundle,
      recommendationType: 'send_now',
      status: 'active',
      reason: 'Approved draft still has no close-out signal.',
      metadata: {
        targetType: bundle.founderCommand.targetType,
        targetId: bundle.founderCommand.targetId,
        draftId: typeof bundle.founderCommand.metadata.draftId === 'string' ? bundle.founderCommand.metadata.draftId : null
      },
      evaluatedAtIso: args.evaluatedAtIso
    });
  }

  if (bundle.contact && bundle.openTasksForContact.length === 0) {
    const dormant = isDormant(bundle.contact.lastTouchedAt, 14, args.evaluatedAtIso);
    const hasPriorValue = ['qualified', 'proposal', 'client', 'follow_up', 'dormant'].includes(bundle.contact.relationshipStage);
    if (dormant && (!reviveContactRequiresPriorValue || hasPriorValue)) {
      return buildDraft({
        bundle,
        recommendationType: 'revive_contact',
        status: 'active',
        reason: 'Previously active relationship is dormant with no open follow-up.',
        metadata: {
          targetType: 'contact',
          targetId: bundle.contact.id,
          accountId: bundle.contact.accountId
        },
        evaluatedAtIso: args.evaluatedAtIso
      });
    }
  }

  if ((bundle.followThroughRecord?.policyKey === 'FT-004-event-linked-recap' || bundle.task?.relatedCalendarEventId) && !bundle.followThroughRecord?.createdArtifactIds?.length) {
    return buildDraft({
      bundle,
      recommendationType: 'schedule_next',
      status: 'active',
      reason: 'Calendar-linked work still needs a concrete next scheduled step.',
      metadata: {
        targetType: bundle.task?.relatedCalendarEventId ? 'calendar_event' : null,
        targetId: bundle.task?.relatedCalendarEventId ?? null
      },
      evaluatedAtIso: args.evaluatedAtIso
    });
  }

  return buildDraft({
    bundle,
    recommendationType: 'noop',
    status: 'noop',
    reason: 'No founder recommendation is active for this source.',
    metadata: {},
    evaluatedAtIso: args.evaluatedAtIso
  });
}

function buildDraft(args: {
  bundle: RecommendationSourceBundle;
  recommendationType: RecommendationDraft['recommendationType'];
  status: RecommendationDraft['status'];
  reason: string;
  metadata: Record<string, unknown>;
  evaluatedAtIso: string;
}): RecommendationDraft {
  return {
    source: args.bundle.source,
    recommendationType: args.recommendationType,
    status: args.status,
    reason: buildRecommendationReason(args.reason),
    summary: buildRecommendationSummary({ recommendationType: args.recommendationType, sourceType: args.bundle.source.sourceType }),
    idempotencyKey: buildRecommendationIdempotencyKey({
      recommendationType: args.recommendationType,
      source: args.bundle.source,
      sourceVersion: args.bundle.sourceVersion
    }),
    relatedCommandId: args.bundle.founderCommand?.id ?? null,
    relatedTaskId: args.bundle.task?.id ?? null,
    metadata: args.metadata,
    evaluatedAtIso: args.evaluatedAtIso
  };
}
