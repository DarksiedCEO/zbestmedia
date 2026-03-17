import { createHash } from 'node:crypto';

import type {
  StrategicInsightDraft,
  StrategicInsightRecord,
  StrategicInsightType
} from './strategic-intelligence-types.js';

export const STRATEGIC_INSIGHT_PRIORITY: StrategicInsightType[] = [
  'attention_priority',
  'blocked_pattern',
  'execution_bottleneck',
  'follow_through_gap',
  'opportunity_cluster',
  'daily_brief',
  'weekly_brief',
  'noop'
];

export function buildStrategicInsightIdempotencyKey(args: {
  insightType: StrategicInsightType;
  scopeKey: string;
  versionHash: string;
}) {
  const digest = createHash('sha1').update(args.versionHash).digest('hex').slice(0, 12);
  return `si:${args.insightType}:${args.scopeKey}:${digest}`;
}

export function countActive(records: Array<{ status: string }>) {
  return records.filter((item) => item.status === 'active').length;
}

export function isOverdue(nowIso: string, dueAtIso: string | null) {
  if (!dueAtIso) return false;
  return new Date(dueAtIso).getTime() < new Date(nowIso).getTime();
}

export function topEntityCluster(
  keys: Array<{ entityId: string | null; recordId: string }>
): { entityId: string; recordIds: string[] } | null {
  const map = new Map<string, string[]>();
  for (const item of keys) {
    if (!item.entityId) continue;
    const current = map.get(item.entityId) ?? [];
    current.push(item.recordId);
    map.set(item.entityId, current);
  }
  const top = [...map.entries()].sort((a, b) => b[1].length - a[1].length)[0];
  if (!top) return null;
  return { entityId: top[0], recordIds: top[1] };
}

export function sortInsightDrafts(drafts: StrategicInsightDraft[]) {
  const rank = new Map(STRATEGIC_INSIGHT_PRIORITY.map((type, index) => [type, index]));
  return [...drafts].sort((a, b) => {
    const aRank = rank.get(a.insightType) ?? 99;
    const bRank = rank.get(b.insightType) ?? 99;
    return aRank - bRank || a.title.localeCompare(b.title);
  });
}

export function buildListMessage(count: number) {
  if (count === 0) {
    return 'No strategic intelligence records are active right now.';
  }
  if (count === 1) {
    return 'Loaded 1 strategic intelligence record.';
  }
  return `Loaded ${count} strategic intelligence records.`;
}

export function latestActiveInsight(records: StrategicInsightRecord[], insightType: StrategicInsightType) {
  return records.find((record) => record.status === 'active' && record.insightType === insightType) ?? null;
}
