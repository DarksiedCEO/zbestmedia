import { createHash } from 'node:crypto';

import type {
  FounderBriefDeltaType,
  FounderBriefKind,
  FounderBriefSection,
  FounderBriefSourceBundle
} from './founder-brief-types.js';
import type { FounderPreferencesRecord } from './founder-preferences-types.js';

export const FOUNDER_BRIEF_SECTION_ORDER: FounderBriefSection[] = [
  'immediate_founder_actions',
  'newly_resolved',
  'reopened_or_persisting',
  'high_value_opportunities',
  'strategic_watchlist',
  'execution_outcome_summary'
];

export function buildFounderBriefWindow(args: { generatedAtIso: string; briefKind: FounderBriefKind }) {
  const end = new Date(args.generatedAtIso);
  const start = new Date(end);
  if (args.briefKind === 'daily') {
    start.setUTCDate(start.getUTCDate() - 1);
  }
  const briefDate = end.toISOString().slice(0, 10);
  return {
    briefDate,
    windowStartAtIso: start.toISOString(),
    windowEndAtIso: end.toISOString()
  };
}

export function buildFounderBriefVersionSeed(args: { sourceVersion: string; previousBriefId: string | null; itemKeys: string[] }) {
  return createHash('sha256')
    .update([args.sourceVersion, args.previousBriefId ?? 'none', ...args.itemKeys.sort()].join('|'))
    .digest('hex')
    .slice(0, 16);
}

export function buildFounderBriefIdempotencyKey(args: {
  briefKind: FounderBriefKind;
  briefDate: string;
  versionSeed: string;
}) {
  return `founder-brief:${args.briefKind}:${args.briefDate}:${args.versionSeed}`;
}

export function shouldIncludeImmediateAction(args: {
  queueItem: FounderBriefSourceBundle['queueItems'][number];
}) {
  return args.queueItem.status === 'active'
    && args.queueItem.queueItemType === 'immediate_action'
    && args.queueItem.actionableCommandType !== null
    && args.queueItem.priorityBand !== 'normal'
    && args.queueItem.issueState !== 'resolved'
    && args.queueItem.issueState !== 'dismissed';
}

export function shouldIncludeOpportunity(args: {
  queueItem: FounderBriefSourceBundle['queueItems'][number];
}) {
  return args.queueItem.status === 'active'
    && args.queueItem.sourceType === 'opportunity'
    && args.queueItem.issueState !== 'resolved'
    && args.queueItem.queueItemType !== 'immediate_action';
}

export function shouldIncludeWatchlist(args: {
  queueItem: FounderBriefSourceBundle['queueItems'][number];
  preferences?: FounderPreferencesRecord;
}) {
  if (args.queueItem.status !== 'active') return false;
  if (args.queueItem.issueState === 'resolved' || args.queueItem.issueState === 'dismissed') return false;
  if (args.queueItem.queueItemType === 'summary_item') return true;
  if (args.queueItem.queueItemType === 'watch_item' || args.queueItem.queueItemType === 'review_required') return true;
  if (args.queueItem.sourceType === 'notification') {
    const min = args.preferences?.notification.minimumConsoleSeverity ?? 'warning';
    const rank = { info: 0, warning: 1, critical: 2 } as const;
    const severity = ((args.queueItem.metadata?.severity as 'info' | 'warning' | 'critical' | undefined) ?? 'warning');
    return rank[severity] >= rank[min];
  }
  return false;
}

export function classifyPersistingIssue(args: {
  issueState: FounderBriefSourceBundle['issueStates'][number];
  queueItem?: FounderBriefSourceBundle['queueItems'][number] | undefined;
}) {
  if (args.issueState.currentState === 'reopened') return 'reopened';
  if (args.issueState.currentState === 'unresolved') return 'persisting';
  if (args.issueState.currentState === 'open' && args.issueState.reopenCount > 0) return 'persisting';
  if (args.queueItem?.priorityBand === 'critical' && args.issueState.currentState !== 'resolved') return 'persisting';
  return null;
}

export function deriveDeltaType(args: {
  previousItem: { section: FounderBriefSection; priorityScore: number; payload: Record<string, unknown> } | null;
  currentSection: FounderBriefSection;
  currentPriorityScore: number;
  issueState?: string | null;
  outcomeType?: string | null;
}): FounderBriefDeltaType {
  if (args.outcomeType === 'issue_reopened' || args.issueState === 'reopened') return 'reopened';
  if (!args.previousItem) return 'new';
  if (args.currentSection === 'immediate_founder_actions' && args.previousItem.section !== 'immediate_founder_actions') return 'worsened';
  if (args.currentSection === 'strategic_watchlist' && args.previousItem.section === 'immediate_founder_actions') return 'improved';
  if (args.currentPriorityScore > args.previousItem.priorityScore) return 'worsened';
  if (args.currentPriorityScore < args.previousItem.priorityScore) return 'improved';
  return 'unchanged';
}

export function buildFounderBriefListMessage(count: number) {
  return count === 1 ? 'Loaded 1 founder brief.' : `Loaded ${count} founder briefs.`;
}
