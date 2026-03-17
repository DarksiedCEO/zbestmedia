import { createHash } from 'node:crypto';

import type { EscalationDraft, EscalationRecord, EscalationType } from './escalation-engine-types.js';

export const ESCALATION_PRIORITY: EscalationType[] = [
  'attention_overload_escalation',
  'stale_critical_escalation',
  'cluster_pressure_escalation',
  'blocked_pattern_escalation',
  'missed_follow_up_escalation'
];

function hash(parts: Array<string | null | undefined>) {
  return createHash('sha256').update(parts.map((part) => part ?? '').join('|')).digest('hex').slice(0, 16);
}

export function buildEscalationIdempotencyKey(args: {
  escalationType: EscalationType;
  scopeKey: string;
  sourceVersion: string;
}) {
  return `esc:${args.escalationType}:${args.scopeKey}:${hash([args.sourceVersion])}`;
}

export function buildEscalationListMessage(count: number) {
  return count === 1 ? 'Escalation loaded successfully.' : 'Escalations loaded successfully.';
}

export function sortEscalations<T extends Pick<EscalationDraft | EscalationRecord, 'escalationType' | 'evaluatedAtIso'>>(records: T[]): T[] {
  const priority = new Map(ESCALATION_PRIORITY.map((item, index) => [item, index]));
  return [...records].sort((left, right) => {
    const priorityDelta = (priority.get(left.escalationType) ?? 999) - (priority.get(right.escalationType) ?? 999);
    if (priorityDelta !== 0) return priorityDelta;
    return right.evaluatedAtIso.localeCompare(left.evaluatedAtIso);
  });
}
