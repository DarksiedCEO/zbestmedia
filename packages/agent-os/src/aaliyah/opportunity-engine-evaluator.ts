import { buildOpportunityIdempotencyKey, isDormantFrom, isPastDue } from './opportunity-engine-policy.js';
import { buildOpportunityReason, buildOpportunitySummary } from './opportunity-engine-summary.js';
import type { OpportunityDraft, OpportunitySourceBundle } from './opportunity-engine-types.js';

function buildDraft(args: {
  bundle: OpportunitySourceBundle;
  opportunityType: OpportunityDraft['opportunityType'];
  status: OpportunityDraft['status'];
  reason: string;
  metadata: Record<string, unknown>;
  evaluatedAtIso: string;
}): OpportunityDraft {
  return {
    source: args.bundle.source,
    opportunityType: args.opportunityType,
    status: args.status,
    reason: buildOpportunityReason(args.reason),
    summary: buildOpportunitySummary({
      opportunityType: args.opportunityType,
      sourceType: args.bundle.source.sourceType
    }),
    idempotencyKey: buildOpportunityIdempotencyKey({
      opportunityType: args.opportunityType,
      source: args.bundle.source,
      sourceVersion: args.bundle.sourceVersion
    }),
    relatedTaskId: args.bundle.task?.id ?? args.bundle.recommendation?.relatedTaskId ?? null,
    relatedRecommendationId: args.bundle.recommendation?.id ?? args.bundle.activeRecommendations[0]?.id ?? null,
    metadata: args.metadata,
    evaluatedAtIso: args.evaluatedAtIso
  };
}

export function evaluateOpportunity(args: {
  bundle: OpportunitySourceBundle;
  evaluatedAtIso: string;
}): OpportunityDraft {
  const { bundle, evaluatedAtIso } = args;

  const blockedSignals = bundle.diagnosticsHints.filter((event) =>
    ['founder_command_rejected', 'follow_through_engine_blocked', 'notification_engine_created'].includes(event.eventType)
  );
  const blockedRecommendations = bundle.activeRecommendations.filter((item) => item.type === 'review_blocked' && item.status === 'active');
  if (
    (bundle.followThroughRecord?.status === 'blocked' || bundle.recommendation?.recommendationType === 'review_blocked')
    && (blockedSignals.length >= 2 || blockedRecommendations.length >= 1)
  ) {
    return buildDraft({
      bundle,
      opportunityType: 'recurring_block_pattern',
      status: 'active',
      reason: 'The same blocked pattern is recurring around this entity without a clean resolution.',
      metadata: {
        targetType: bundle.task ? 'task' : bundle.contact ? 'contact' : bundle.account ? 'account' : null,
        targetId: bundle.task?.id ?? bundle.contact?.id ?? bundle.account?.id ?? null,
        blockedSignalCount: blockedSignals.length,
        recommendationIds: blockedRecommendations.map((item) => item.id)
      },
      evaluatedAtIso
    });
  }

  if (
    bundle.task
    && ['open', 'in_progress'].includes(bundle.task.status)
    && isPastDue(evaluatedAtIso, bundle.task.dueAt)
    && (bundle.task.relatedCalendarEventId || bundle.task.relatedEmailDraftId || bundle.followThroughRecord?.policyKey === 'FT-004-event-linked-recap')
  ) {
    return buildDraft({
      bundle,
      opportunityType: 'missed_follow_up_window',
      status: 'active',
      reason: 'A meeting or outreach thread passed its expected follow-up window without a next step.',
      metadata: {
        targetType: bundle.task.relatedCalendarEventId ? 'calendar_event' : bundle.contact ? 'contact' : 'task',
        targetId: bundle.task.relatedCalendarEventId ?? bundle.contact?.id ?? bundle.task.id,
        channel: bundle.task.relatedCalendarEventId ? 'meeting' : 'email'
      },
      evaluatedAtIso
    });
  }

  const hasOpenFollowUp = bundle.openTasksForContact.some((item) => ['open', 'in_progress', 'blocked'].includes(item.status));
  if (
    bundle.contact
    && !hasOpenFollowUp
    && ['qualified', 'proposal', 'client', 'follow_up', 'dormant'].includes(bundle.contact.relationshipStage)
    && isDormantFrom(evaluatedAtIso, bundle.contact.lastTouchedAt)
  ) {
    return buildDraft({
      bundle,
      opportunityType: 'dormant_contact',
      status: 'active',
      reason: 'This relationship has prior value but has gone quiet with no active follow-up.',
      metadata: {
        targetType: 'contact',
        targetId: bundle.contact.id,
        accountId: bundle.contact.accountId
      },
      evaluatedAtIso
    });
  }

  if (
    bundle.task
    && ['open', 'in_progress'].includes(bundle.task.status)
    && ['crm_follow_up', 'email_follow_up', 'calendar_follow_up'].includes(bundle.task.source)
    && isPastDue(evaluatedAtIso, bundle.task.dueAt)
    && bundle.activeRecommendations.every((item) => item.type !== 'escalate_now')
  ) {
    return buildDraft({
      bundle,
      opportunityType: 'stalled_pipeline',
      status: 'active',
      reason: 'A live relationship thread has stalled without closure or a fresh escalation path.',
      metadata: {
        targetType: bundle.task.id ? 'task' : null,
        targetId: bundle.task.id,
        accountId: bundle.account?.id ?? null
      },
      evaluatedAtIso
    });
  }

  return buildDraft({
    bundle,
    opportunityType: 'noop',
    status: 'noop',
    reason: 'No opportunity is active for this source.',
    metadata: {},
    evaluatedAtIso
  });
}
