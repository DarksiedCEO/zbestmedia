import {
  buildTimelineIdempotencyKey,
  classifyTimelineDecision,
  classifyTimelineSeverity
} from './timeline-policy.js';
import { buildTimelineSummary, buildTimelineTitle } from './timeline-summary.js';
import type { TimelineEventDraft, TimelineSourceBundle, TimelineEventType } from './timeline-types.js';

export function composeTimelineEvents(bundle: TimelineSourceBundle): TimelineEventDraft[] {
  const drafts: TimelineEventDraft[] = [];
  const seen = new Set<string>();
  const actionLogById = new Map(bundle.actionLogs.map((item) => [item.id, item]));

  const push = (draft: TimelineEventDraft) => {
    if (seen.has(draft.idempotencyKey)) return;
    seen.add(draft.idempotencyKey);
    drafts.push(draft);
  };

  for (const queueItem of bundle.queueItems) {
    push({
      eventType: 'queue_item_created',
      eventAtIso: queueItem.createdAtIso,
      canonicalIssueKey: queueItem.canonicalIssueKey,
      queueItemId: queueItem.id,
      operatorActionLogId: null,
      outcomeFeedbackId: null,
      briefId: null,
      sourceType: 'operator_queue',
      sourceId: queueItem.id,
      decisionClass: classifyTimelineDecision('queue_item_created'),
      severity: classifyTimelineSeverity({ eventType: 'queue_item_created', priorityBand: queueItem.priorityBand, queueStatus: queueItem.status }),
      title: buildTimelineTitle({ eventType: 'queue_item_created', queueTitle: queueItem.title }),
      summary: buildTimelineSummary({ eventType: 'queue_item_created', summary: queueItem.summary }),
      payload: {
        sourceType: queueItem.sourceType,
        sourceId: queueItem.sourceId,
        priorityScore: queueItem.priorityScore,
        priorityBand: queueItem.priorityBand,
        queueItemType: queueItem.queueItemType,
        status: queueItem.status
      },
      idempotencyKey: buildTimelineIdempotencyKey({
        eventType: 'queue_item_created',
        sourceType: 'operator_queue',
        sourceId: queueItem.id,
        eventAtIso: queueItem.createdAtIso,
        canonicalIssueKey: queueItem.canonicalIssueKey
      })
    });

    if (queueItem.lastRefreshedAtIso) {
      push({
        eventType: 'queue_item_refreshed',
        eventAtIso: queueItem.lastRefreshedAtIso,
        canonicalIssueKey: queueItem.canonicalIssueKey,
        queueItemId: queueItem.id,
        operatorActionLogId: null,
        outcomeFeedbackId: null,
        briefId: null,
        sourceType: 'operator_queue',
        sourceId: queueItem.id,
        decisionClass: classifyTimelineDecision('queue_item_refreshed'),
        severity: classifyTimelineSeverity({ eventType: 'queue_item_refreshed', priorityBand: queueItem.priorityBand }),
        title: buildTimelineTitle({ eventType: 'queue_item_refreshed', queueTitle: queueItem.title }),
        summary: buildTimelineSummary({ eventType: 'queue_item_refreshed', summary: queueItem.summary }),
        payload: {
          status: queueItem.status,
          rankingVersion: queueItem.metadata?.rankingVersion ?? null,
          priorityScore: queueItem.priorityScore
        },
        idempotencyKey: buildTimelineIdempotencyKey({
          eventType: 'queue_item_refreshed',
          sourceType: 'operator_queue',
          sourceId: queueItem.id,
          eventAtIso: queueItem.lastRefreshedAtIso,
          canonicalIssueKey: queueItem.canonicalIssueKey
        })
      });
    }

    if (queueItem.status === 'suppressed' || queueItem.status === 'superseded' || queueItem.status === 'invalidated') {
      const eventAtIso = queueItem.lastRefreshedAtIso ?? queueItem.evaluatedAtIso;
      push({
        eventType: 'queue_item_suppressed',
        eventAtIso,
        canonicalIssueKey: queueItem.canonicalIssueKey,
        queueItemId: queueItem.id,
        operatorActionLogId: null,
        outcomeFeedbackId: null,
        briefId: null,
        sourceType: 'operator_queue',
        sourceId: queueItem.id,
        decisionClass: classifyTimelineDecision('queue_item_suppressed'),
        severity: classifyTimelineSeverity({ eventType: 'queue_item_suppressed', queueStatus: queueItem.status }),
        title: buildTimelineTitle({ eventType: 'queue_item_suppressed', queueTitle: queueItem.title }),
        summary: buildTimelineSummary({ eventType: 'queue_item_suppressed', summary: queueItem.summary }),
        payload: {
          status: queueItem.status,
          supersededByQueueItemId: queueItem.supersededByQueueItemId
        },
        idempotencyKey: buildTimelineIdempotencyKey({
          eventType: 'queue_item_suppressed',
          sourceType: 'operator_queue',
          sourceId: queueItem.id,
          eventAtIso,
          canonicalIssueKey: queueItem.canonicalIssueKey,
          detailSeed: queueItem.status
        })
      });
    }

    if (queueItem.lastExecutedAtIso || queueItem.status === 'executed') {
      const executedAtIso = queueItem.lastExecutedAtIso ?? queueItem.evaluatedAtIso;
      push({
        eventType: 'queue_item_executed',
        eventAtIso: executedAtIso,
        canonicalIssueKey: queueItem.canonicalIssueKey,
        queueItemId: queueItem.id,
        operatorActionLogId: null,
        outcomeFeedbackId: null,
        briefId: null,
        sourceType: 'operator_queue',
        sourceId: queueItem.id,
        decisionClass: classifyTimelineDecision('queue_item_executed'),
        severity: classifyTimelineSeverity({ eventType: 'queue_item_executed', priorityBand: queueItem.priorityBand, queueStatus: queueItem.status }),
        title: buildTimelineTitle({ eventType: 'queue_item_executed', queueTitle: queueItem.title }),
        summary: buildTimelineSummary({ eventType: 'queue_item_executed', summary: queueItem.summary }),
        payload: {
          actionableCommandType: queueItem.actionableCommandType,
          actionableTargetType: queueItem.actionableTargetType,
          actionableTargetId: queueItem.actionableTargetId
        },
        idempotencyKey: buildTimelineIdempotencyKey({
          eventType: 'queue_item_executed',
          sourceType: 'operator_queue',
          sourceId: queueItem.id,
          eventAtIso: executedAtIso,
          canonicalIssueKey: queueItem.canonicalIssueKey
        })
      });
    }
  }

  for (const actionLog of bundle.actionLogs) {
    if (actionLog.executionStatus === 'success') continue;
    push({
      eventType: 'operator_action_failed',
      eventAtIso: actionLog.executedAtIso,
      canonicalIssueKey: actionLog.canonicalIssueKey,
      queueItemId: actionLog.queueItemId,
      operatorActionLogId: actionLog.id,
      outcomeFeedbackId: null,
      briefId: null,
      sourceType: 'operator_action',
      sourceId: actionLog.id,
      decisionClass: classifyTimelineDecision('operator_action_failed'),
      severity: classifyTimelineSeverity({ eventType: 'operator_action_failed' }),
      title: buildTimelineTitle({ eventType: 'operator_action_failed' }),
      summary: buildTimelineSummary({ eventType: 'operator_action_failed', summary: actionLog.failureReason ?? undefined }),
      payload: {
        executionStatus: actionLog.executionStatus,
        failureCode: actionLog.failureCode,
        failureReason: actionLog.failureReason,
        commandId: actionLog.commandId
      },
      idempotencyKey: buildTimelineIdempotencyKey({
        eventType: 'operator_action_failed',
        sourceType: 'operator_action',
        sourceId: actionLog.id,
        eventAtIso: actionLog.executedAtIso,
        canonicalIssueKey: actionLog.canonicalIssueKey,
        detailSeed: actionLog.executionStatus
      })
    });
  }

  for (const outcome of bundle.outcomes) {
    const eventType = mapOutcomeEventType(outcome.outcomeType);
    push({
      eventType,
      eventAtIso: outcome.reportedAtIso,
      canonicalIssueKey: outcome.canonicalIssueKey,
      queueItemId: outcome.queueItemId,
      operatorActionLogId: outcome.operatorActionLogId,
      outcomeFeedbackId: outcome.id,
      briefId: null,
      sourceType: 'outcome_feedback',
      sourceId: outcome.id,
      decisionClass: classifyTimelineDecision(eventType),
      severity: classifyTimelineSeverity({ eventType, outcomeStatus: outcome.outcomeStatus }),
      title: buildTimelineTitle({ eventType }),
      summary: buildTimelineSummary({ eventType, notes: outcome.notes }),
      payload: {
        sourceType: outcome.sourceType,
        sourceId: outcome.sourceId,
        outcomeType: outcome.outcomeType,
        outcomeStatus: outcome.outcomeStatus,
        reasonCode: outcome.reasonCode,
        commandId: outcome.commandId,
        actionFailure: outcome.operatorActionLogId ? (actionLogById.get(outcome.operatorActionLogId)?.failureCode ?? null) : null
      },
      idempotencyKey: buildTimelineIdempotencyKey({
        eventType,
        sourceType: 'outcome_feedback',
        sourceId: outcome.id,
        eventAtIso: outcome.reportedAtIso,
        canonicalIssueKey: outcome.canonicalIssueKey,
        detailSeed: outcome.outcomeType
      })
    });
  }

  for (const brief of bundle.briefs) {
    if (brief.items.length === 0) {
      push({
        eventType: 'brief_generated',
        eventAtIso: brief.generatedAtIso,
        canonicalIssueKey: null,
        queueItemId: null,
        operatorActionLogId: null,
        outcomeFeedbackId: null,
        briefId: brief.id,
        sourceType: 'founder_brief',
        sourceId: brief.id,
        decisionClass: classifyTimelineDecision('brief_generated'),
        severity: 'info',
        title: buildTimelineTitle({ eventType: 'brief_generated', headline: brief.headline }),
        summary: buildTimelineSummary({ eventType: 'brief_generated', headline: brief.headline }),
        payload: {
          briefDate: brief.briefDate,
          briefKind: brief.briefKind,
          itemCount: 0
        },
        idempotencyKey: buildTimelineIdempotencyKey({
          eventType: 'brief_generated',
          sourceType: 'founder_brief',
          sourceId: brief.id,
          eventAtIso: brief.generatedAtIso
        })
      });
      continue;
    }

    for (const item of brief.items) {
      push({
        eventType: 'brief_generated',
        eventAtIso: brief.generatedAtIso,
        canonicalIssueKey: item.canonicalIssueKey,
        queueItemId: item.queueItemId,
        operatorActionLogId: item.operatorActionLogId,
        outcomeFeedbackId: item.outcomeFeedbackId,
        briefId: brief.id,
        sourceType: 'founder_brief',
        sourceId: brief.id,
        decisionClass: classifyTimelineDecision('brief_generated'),
        severity: item.section === 'immediate_founder_actions' ? 'high' : 'info',
        title: buildTimelineTitle({ eventType: 'brief_generated', headline: brief.headline }),
        summary: buildTimelineSummary({ eventType: 'brief_generated', headline: brief.headline }),
        payload: {
          briefDate: brief.briefDate,
          briefKind: brief.briefKind,
          briefItemId: item.id,
          section: item.section,
          deltaType: item.deltaType,
          priorityScore: item.priorityScore,
          payload: item.payload
        },
        idempotencyKey: buildTimelineIdempotencyKey({
          eventType: 'brief_generated',
          sourceType: 'founder_brief',
          sourceId: brief.id,
          eventAtIso: brief.generatedAtIso,
          canonicalIssueKey: item.canonicalIssueKey,
          detailSeed: item.id
        })
      });
    }
  }

  drafts.sort((left, right) => {
    if (left.eventAtIso === right.eventAtIso) {
      return left.idempotencyKey.localeCompare(right.idempotencyKey);
    }
    return right.eventAtIso.localeCompare(left.eventAtIso);
  });

  return drafts;
}

function mapOutcomeEventType(outcomeType: string): TimelineEventType {
  switch (outcomeType) {
    case 'issue_resolved':
      return 'issue_resolved';
    case 'issue_reopened':
      return 'issue_reopened';
    case 'recommendation_rejected':
      return 'recommendation_rejected';
    case 'opportunity_converted':
      return 'opportunity_converted';
    case 'escalation_persisting':
      return 'escalation_persisting';
    default:
      return 'outcome_recorded';
  }
}
