import type { EscalationDraft, EscalationLevel, EscalationType } from './escalation-engine-types.js';

function titleFor(type: EscalationType) {
  switch (type) {
    case 'stale_critical_escalation':
      return 'Critical issue crossed the escalation line';
    case 'blocked_pattern_escalation':
      return 'Blocked pattern is now a founder-level issue';
    case 'cluster_pressure_escalation':
      return 'Cluster pressure is building';
    case 'missed_follow_up_escalation':
      return 'Missed follow-up is now escalated';
    case 'attention_overload_escalation':
      return 'Founder attention load is overloaded';
    default:
      return 'Escalation recorded';
  }
}

function summaryFor(type: EscalationType, level: EscalationLevel) {
  switch (type) {
    case 'stale_critical_escalation':
      return `${level === 'critical' ? 'Critical' : 'Important'} unresolved signals remained active past the founder threshold.`;
    case 'blocked_pattern_escalation':
      return 'Repeated blocked patterns are still unresolved and now require founder-level intervention.';
    case 'cluster_pressure_escalation':
      return 'A related signal cluster grew beyond the configured pressure threshold.';
    case 'missed_follow_up_escalation':
      return 'A missed follow-up gap stayed unresolved long enough to be promoted.';
    case 'attention_overload_escalation':
      return 'Too many active attention-heavy items are competing for founder capacity at once.';
    default:
      return 'Escalation was recorded.';
  }
}

export function buildEscalationDraft(args: {
  escalationType: EscalationType;
  escalationLevel: EscalationLevel;
  reason: string;
  summary?: string;
  idempotencyKey: string;
  sourceRecordIds: string[];
  sourceRecordTypes: EscalationDraft['sourceRecordTypes'];
  relatedClusterId?: string | null;
  metadata?: Record<string, unknown>;
  evaluatedAtIso: string;
}): EscalationDraft {
  return {
    escalationType: args.escalationType,
    status: 'active',
    title: titleFor(args.escalationType),
    summary: args.summary ?? summaryFor(args.escalationType, args.escalationLevel),
    reason: args.reason,
    escalationLevel: args.escalationLevel,
    idempotencyKey: args.idempotencyKey,
    sourceRecordIds: args.sourceRecordIds,
    sourceRecordTypes: args.sourceRecordTypes,
    relatedClusterId: args.relatedClusterId ?? null,
    metadata: args.metadata ?? {},
    evaluatedAtIso: args.evaluatedAtIso
  };
}

export function buildEscalationMessage(count: number, replayedCount: number) {
  if (count === 0) return 'No escalation crossed a threshold.';
  if (replayedCount > 0) return `Escalations evaluated with ${replayedCount} replayed result${replayedCount === 1 ? '' : 's'}.`;
  return count === 1 ? 'Escalation created successfully.' : 'Escalations created successfully.';
}
