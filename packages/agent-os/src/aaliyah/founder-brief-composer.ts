import {
  buildFounderBriefIdempotencyKey,
  buildFounderBriefVersionSeed,
  classifyPersistingIssue,
  deriveDeltaType,
  FOUNDER_BRIEF_SECTION_ORDER,
  shouldIncludeImmediateAction,
  shouldIncludeOpportunity,
  shouldIncludeWatchlist
} from './founder-brief-policy.js';
import { buildFounderBriefHeadline } from './founder-brief-summary.js';
import type {
  FounderBriefDraft,
  FounderBriefItemRecord,
  FounderBriefSection,
  FounderBriefSourceBundle
} from './founder-brief-types.js';
import type { FounderPreferencesRecord } from './founder-preferences-types.js';

function buildPreviousIndex(items: FounderBriefItemRecord[]) {
  const index = new Map<string, FounderBriefItemRecord>();
  for (const item of items) {
    const key = item.canonicalIssueKey ?? item.queueItemId ?? `${item.section}:${item.id}`;
    if (!index.has(key)) {
      index.set(key, item);
    }
  }
  return index;
}

function addItem(args: {
  items: FounderBriefDraft['items'];
  section: FounderBriefSection;
  key: string;
  seen: Set<string>;
  queueItemId?: string | null;
  canonicalIssueKey?: string | null;
  operatorActionLogId?: string | null;
  outcomeFeedbackId?: string | null;
  priorityScore: number;
  deltaType: FounderBriefDraft['items'][number]['deltaType'];
  payload: Record<string, unknown>;
}) {
  const dedupeKey = `${args.section}:${args.key}`;
  if (args.seen.has(dedupeKey)) return;
  args.seen.add(dedupeKey);
  args.items.push({
    section: args.section,
    queueItemId: args.queueItemId ?? null,
    canonicalIssueKey: args.canonicalIssueKey ?? null,
    operatorActionLogId: args.operatorActionLogId ?? null,
    outcomeFeedbackId: args.outcomeFeedbackId ?? null,
    priorityScore: args.priorityScore,
    deltaType: args.deltaType,
    payload: args.payload
  });
}

export function composeFounderBrief(args: {
  bundle: FounderBriefSourceBundle;
  preferences?: FounderPreferencesRecord;
}): FounderBriefDraft {
  const items: FounderBriefDraft['items'] = [];
  const seen = new Set<string>();
  const previousIndex = buildPreviousIndex(args.bundle.previousBrief?.items ?? []);
  const recentOutcomes = args.bundle.outcomes.filter((item) => item.reportedAtIso >= args.bundle.windowStartAtIso);

  for (const queueItem of args.bundle.queueItems) {
    const key = queueItem.canonicalIssueKey ?? queueItem.id;
    const previous = previousIndex.get(key);
    if (shouldIncludeImmediateAction({ queueItem })) {
      addItem({
        items,
        seen,
        section: 'immediate_founder_actions',
        key,
        queueItemId: queueItem.id,
        canonicalIssueKey: queueItem.canonicalIssueKey,
        priorityScore: queueItem.priorityScore,
        deltaType: deriveDeltaType({
          previousItem: previous
            ? { section: previous.section, priorityScore: previous.priorityScore, payload: previous.payload }
            : null,
          currentSection: 'immediate_founder_actions',
          currentPriorityScore: queueItem.priorityScore,
          issueState: queueItem.issueState,
          outcomeType: queueItem.lastOutcomeType
        }),
        payload: {
          sourceType: queueItem.sourceType,
          sourceId: queueItem.sourceId,
          title: queueItem.title,
          summary: queueItem.summary,
          reason: queueItem.reason,
          actionableCommandType: queueItem.actionableCommandType,
          actionableTargetType: queueItem.actionableTargetType,
          actionableTargetId: queueItem.actionableTargetId,
          issueState: queueItem.issueState
        }
      });
      continue;
    }

    if (shouldIncludeOpportunity({ queueItem })) {
      addItem({
        items,
        seen,
        section: 'high_value_opportunities',
        key,
        queueItemId: queueItem.id,
        canonicalIssueKey: queueItem.canonicalIssueKey,
        priorityScore: queueItem.priorityScore,
        deltaType: deriveDeltaType({
          previousItem: previous
            ? { section: previous.section, priorityScore: previous.priorityScore, payload: previous.payload }
            : null,
          currentSection: 'high_value_opportunities',
          currentPriorityScore: queueItem.priorityScore,
          issueState: queueItem.issueState,
          outcomeType: queueItem.lastOutcomeType
        }),
        payload: {
          sourceType: queueItem.sourceType,
          sourceId: queueItem.sourceId,
          title: queueItem.title,
          summary: queueItem.summary,
          reason: queueItem.reason,
          issueState: queueItem.issueState
        }
      });
      continue;
    }

    if (shouldIncludeWatchlist({ queueItem, preferences: args.preferences })) {
      addItem({
        items,
        seen,
        section: 'strategic_watchlist',
        key,
        queueItemId: queueItem.id,
        canonicalIssueKey: queueItem.canonicalIssueKey,
        priorityScore: queueItem.priorityScore,
        deltaType: deriveDeltaType({
          previousItem: previous
            ? { section: previous.section, priorityScore: previous.priorityScore, payload: previous.payload }
            : null,
          currentSection: 'strategic_watchlist',
          currentPriorityScore: queueItem.priorityScore,
          issueState: queueItem.issueState,
          outcomeType: queueItem.lastOutcomeType
        }),
        payload: {
          sourceType: queueItem.sourceType,
          sourceId: queueItem.sourceId,
          title: queueItem.title,
          summary: queueItem.summary,
          reason: queueItem.reason,
          issueState: queueItem.issueState
        }
      });
    }
  }

  for (const outcome of recentOutcomes) {
    if (!['issue_resolved', 'opportunity_converted', 'escalation_cleared'].includes(outcome.outcomeType)) continue;
    const key = outcome.canonicalIssueKey;
    addItem({
      items,
      seen,
      section: 'newly_resolved',
      key,
      canonicalIssueKey: outcome.canonicalIssueKey,
      queueItemId: outcome.queueItemId,
      outcomeFeedbackId: outcome.id,
      priorityScore: 70,
      deltaType: 'resolved',
      payload: {
        sourceType: outcome.sourceType,
        sourceId: outcome.sourceId,
        outcomeType: outcome.outcomeType,
        outcomeStatus: outcome.outcomeStatus,
        reportedAtIso: outcome.reportedAtIso,
        notes: outcome.notes
      }
    });
  }

  for (const issueState of args.bundle.issueStates) {
    const persisting = classifyPersistingIssue({
      issueState,
      queueItem: args.bundle.queueItems.find((item) => item.canonicalIssueKey === issueState.canonicalIssueKey)
    });
    if (!persisting) continue;
    const key = issueState.canonicalIssueKey;
    const previous = previousIndex.get(key);
    const queueItem = args.bundle.queueItems.find((item) => item.canonicalIssueKey === issueState.canonicalIssueKey);
    addItem({
      items,
      seen,
      section: 'reopened_or_persisting',
      key,
      canonicalIssueKey: issueState.canonicalIssueKey,
      queueItemId: queueItem?.id ?? null,
      priorityScore: queueItem?.priorityScore ?? 65,
      deltaType: issueState.currentState === 'reopened'
        ? 'reopened'
        : deriveDeltaType({
            previousItem: previous
              ? { section: previous.section, priorityScore: previous.priorityScore, payload: previous.payload }
              : null,
            currentSection: 'reopened_or_persisting',
            currentPriorityScore: queueItem?.priorityScore ?? 65,
            issueState: issueState.currentState,
            outcomeType: issueState.lastOutcomeType
          }),
      payload: {
        currentState: issueState.currentState,
        lastOutcomeType: issueState.lastOutcomeType,
        lastOutcomeStatus: issueState.lastOutcomeStatus,
        lastOutcomeAtIso: issueState.lastOutcomeAtIso,
        reopenCount: issueState.reopenCount,
        resolutionCount: issueState.resolutionCount,
        hasRepeatedFailure: issueState.metadata.hasRepeatedFailure
      }
    });
  }

  for (const insight of args.bundle.strategicInsights.slice(0, 5)) {
    const key = `insight:${insight.id}`;
    addItem({
      items,
      seen,
      section: 'strategic_watchlist',
      key,
      priorityScore: 55,
      deltaType: previousIndex.has(key) ? 'unchanged' : 'new',
      payload: {
        insightId: insight.id,
        insightType: insight.insightType,
        title: insight.title,
        summary: insight.summary,
        reason: insight.reason
      }
    });
  }

  const outcomeSummary = {
    executed: args.bundle.actionLogs.filter((item) => item.executionStatus === 'success' && item.executedAtIso >= args.bundle.windowStartAtIso).length,
    resolved: recentOutcomes.filter((item) => ['issue_resolved', 'opportunity_converted', 'escalation_cleared'].includes(item.outcomeType)).length,
    unresolved: recentOutcomes.filter((item) => ['issue_unresolved', 'action_failed_downstream', 'escalation_persisting'].includes(item.outcomeType)).length,
    reopened: recentOutcomes.filter((item) => item.outcomeType === 'issue_reopened').length,
    dismissed: args.bundle.issueStates.filter((item) => item.currentState === 'dismissed').length
  };
  addItem({
    items,
    seen,
    section: 'execution_outcome_summary',
    key: 'execution-summary',
    priorityScore: 10,
    deltaType: 'unchanged',
    payload: outcomeSummary
  });

  const orderedItems = items.sort((left, right) => {
    const sectionOrder = FOUNDER_BRIEF_SECTION_ORDER.indexOf(left.section) - FOUNDER_BRIEF_SECTION_ORDER.indexOf(right.section);
    if (sectionOrder !== 0) return sectionOrder;
    return right.priorityScore - left.priorityScore;
  });
  const counts = {
    immediateActions: orderedItems.filter((item) => item.section === 'immediate_founder_actions').length,
    resolved: orderedItems.filter((item) => item.section === 'newly_resolved').length,
    reopenedOrPersisting: orderedItems.filter((item) => item.section === 'reopened_or_persisting').length,
    opportunities: orderedItems.filter((item) => item.section === 'high_value_opportunities').length,
    watchlist: orderedItems.filter((item) => item.section === 'strategic_watchlist').length
  };
  const headline = buildFounderBriefHeadline(counts);
  const versionSeed = buildFounderBriefVersionSeed({
    sourceVersion: args.bundle.sourceVersion,
    previousBriefId: args.bundle.previousBrief?.brief.id ?? null,
    itemKeys: orderedItems.map((item) => `${item.section}:${item.canonicalIssueKey ?? item.queueItemId ?? JSON.stringify(item.payload)}`)
  });

  return {
    briefKind: 'daily',
    briefDate: args.bundle.briefDate,
    windowStartAtIso: args.bundle.windowStartAtIso,
    windowEndAtIso: args.bundle.windowEndAtIso,
    headline,
    summary: {
      headline,
      generatedAtIso: args.bundle.generatedAtIso,
      previousBriefId: args.bundle.previousBrief?.brief.id ?? null,
      counts,
      sectionOrder: FOUNDER_BRIEF_SECTION_ORDER,
      notes: counts.immediateActions === 0 ? ['No immediate founder actions crossed the current threshold.'] : []
    },
    idempotencyKey: buildFounderBriefIdempotencyKey({
      briefKind: 'daily',
      briefDate: args.bundle.briefDate,
      versionSeed
    }),
    previousBriefId: args.bundle.previousBrief?.brief.id ?? null,
    metadata: {
      sourceVersion: args.bundle.sourceVersion,
      previousBriefCompared: args.bundle.previousBrief?.brief.id ?? null
    },
    items: orderedItems
  };
}
