import { describe, expect, it, vi } from 'vitest';

import { AaliyahSignalCoalescingService } from '../src/aaliyah/signal-coalescing-service.js';

const tenantId = '11111111-1111-4111-8111-111111111111';
const actorId = 'actor-1';

function createRepository() {
  const created: any[] = [];
  const notification = {
    id: 'notification:1',
    tenantId,
    source: { sourceType: 'task' as const, sourceId: 'task:1' },
    notificationType: 'blocked_recommendation' as const,
    severity: 'warning' as const,
    status: 'active' as const,
    title: 'Blocked recommendation',
    summary: 'Blocked recommendation is waiting on review.',
    reason: 'A blocked recommendation is still active.',
    idempotencyKey: 'notif:1',
    relatedRecommendationId: 'recommendation:1',
    relatedTaskId: 'task:1',
    auditEventId: 'diag:notif:1',
    metadata: { targetId: 'task:1' },
    createdAtIso: '2026-03-17T12:00:00.000Z',
    evaluatedAtIso: '2026-03-17T12:00:00.000Z',
    acknowledgedAtIso: null,
    dismissedAtIso: null
  };
  const recommendation = {
    id: 'recommendation:1',
    tenantId,
    source: { sourceType: 'task' as const, sourceId: 'task:1' },
    recommendationType: 'review_blocked' as const,
    status: 'active' as const,
    reason: 'Blocked review is still unresolved.',
    summary: 'Review blocked path before it stalls further.',
    idempotencyKey: 'rec:1',
    relatedCommandId: null,
    relatedTaskId: 'task:1',
    metadata: { targetId: 'task:1' },
    auditEventId: 'diag:rec:1',
    createdAtIso: '2026-03-17T12:05:00.000Z',
    evaluatedAtIso: '2026-03-17T12:05:00.000Z'
  };
  const opportunityA = {
    id: 'opportunity:1',
    tenantId,
    source: { sourceType: 'contact' as const, sourceId: 'contact:1' },
    opportunityType: 'missed_follow_up_window' as const,
    status: 'active' as const,
    reason: 'Missed follow-up window is open.',
    summary: 'Follow-up window passed without a next step.',
    idempotencyKey: 'opp:1',
    relatedTaskId: 'task:2',
    relatedRecommendationId: null,
    auditEventId: 'diag:opp:1',
    metadata: { linkedTaskId: 'task:1' },
    createdAtIso: '2026-03-17T12:10:00.000Z',
    evaluatedAtIso: '2026-03-17T12:10:00.000Z',
    acknowledgedAtIso: null,
    dismissedAtIso: null
  };
  const opportunityB = {
    ...opportunityA,
    id: 'opportunity:2',
    opportunityType: 'dormant_contact' as const,
    idempotencyKey: 'opp:2',
    summary: 'Dormant contact deserves outreach.'
  };
  const opportunityC = {
    ...opportunityA,
    id: 'opportunity:3',
    opportunityType: 'engagement_spike' as const,
    idempotencyKey: 'opp:3',
    summary: 'Engagement is spiking without founder action.'
  };
  const strategicInsight = {
    id: 'insight:1',
    tenantId,
    insightType: 'attention_priority' as const,
    status: 'active' as const,
    title: 'Attention needed',
    summary: 'Founder attention is stacking up around task:9.',
    reason: 'Multiple important signals are overlapping.',
    idempotencyKey: 'si:1',
    relatedEntityIds: ['task:9'],
    relatedRecordIds: ['notification:2'],
    auditEventId: 'diag:si:1',
    metadata: { targetId: 'task:9' },
    createdAtIso: '2026-03-17T12:20:00.000Z',
    evaluatedAtIso: '2026-03-17T12:20:00.000Z',
    acknowledgedAtIso: null,
    dismissedAtIso: null
  };
  const attentionNotification = {
    ...notification,
    id: 'notification:2',
    notificationType: 'founder_review_required' as const,
    severity: 'critical' as const,
    summary: 'Founder review is required for the same task cluster.',
    reason: 'Review is still required.',
    relatedRecommendationId: null,
    relatedTaskId: 'task:9',
    metadata: { targetId: 'task:9' },
    createdAtIso: '2026-03-17T12:21:00.000Z'
  };
  const followThrough = {
    id: 'follow-through:1',
    tenantId,
    source: { sourceType: 'task' as const, sourceId: 'task:1' },
    policyKey: 'FT-005-rejected-intent-context' as const,
    decisionType: 'record_blocked' as const,
    status: 'blocked' as const,
    reason: 'Founder intent is still blocked.',
    summary: 'Blocked context recorded for the same task.',
    idempotencyKey: 'ft:1',
    createdArtifactIds: [],
    auditEventId: 'diag:ft:1',
    metadata: { linkedTaskId: 'task:1' },
    createdAt: '2026-03-17T12:03:00.000Z',
    evaluatedAtIso: '2026-03-17T12:03:00.000Z'
  };
  const staleFollowThrough = {
    ...followThrough,
    id: 'follow-through:2',
    policyKey: 'FT-003-overdue-task-stale' as const,
    decisionType: 'flag_stale' as const,
    status: 'stale' as const,
    reason: 'The same task is now stale and missing a next step.',
    summary: 'Stale follow-through is accumulating for the same task.',
    idempotencyKey: 'ft:2'
  };

  return {
    listNotifications: vi.fn(async () => [notification, attentionNotification]),
    listRecommendations: vi.fn(async () => [recommendation]),
    listOpportunities: vi.fn(async () => [opportunityA, opportunityB, opportunityC]),
    listStrategicInsights: vi.fn(async () => [strategicInsight]),
    listFollowThroughEngineRecords: vi.fn(async () => [followThrough, staleFollowThrough]),
    getCoalescedSignalByIdempotencyKey: vi.fn(async () => null),
    createCoalescedSignal: vi.fn(async (args: any) => {
      const record = {
        id: args.signalId,
        tenantId: args.tenantId,
        signalType: args.signalType,
        status: args.signalStatus,
        title: args.title,
        summary: args.summary,
        reason: args.reason,
        idempotencyKey: args.idempotencyKey,
        sourceRecordIds: args.sourceRecordIds,
        sourceRecordTypes: args.sourceRecordTypes,
        dominantSourceType: args.dominantSourceType,
        suppressedRecordIds: args.suppressedRecordIds,
        auditEventId: args.auditEventId,
        metadata: args.metadata ?? {},
        createdAtIso: args.createdAt,
        evaluatedAtIso: args.evaluatedAt,
        acknowledgedAtIso: null,
        dismissedAtIso: null
      };
      created.push(record);
      return record;
    }),
    getCoalescedSignalById: vi.fn(async ({ signalId }: { signalId: string }) => created.find((item) => item.id === signalId) ?? null),
    listCoalescedSignals: vi.fn(async () => created),
    updateCoalescedSignalStatus: vi.fn(async ({ signalId, status, changedAt }: any) => {
      const current = created.find((item) => item.id === signalId);
      return {
        ...current,
        status,
        acknowledgedAtIso: status === 'acknowledged' ? changedAt : current?.acknowledgedAtIso ?? null,
        dismissedAtIso: status === 'dismissed' ? changedAt : current?.dismissedAtIso ?? null
      };
    })
  } as any;
}

function createDiagnostics() {
  return {
    recordEvent: vi.fn(async () => ({ eventId: 'aaliyah-diagnostics:event-1' }))
  } as any;
}

describe('Aaliyah signal coalescing service', () => {
  it('creates blocked, follow-up, opportunity, and attention clusters conservatively', async () => {
    const service = new AaliyahSignalCoalescingService(createRepository(), createDiagnostics());
    const result = await service.evaluate({
      tenantId,
      actorId,
      principalContext: 'founder',
      mode: 'founder',
      generatedAt: '2026-03-17T12:30:00.000Z'
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.signals.some((item) => item.signalType === 'blocked_execution_cluster')).toBe(true);
      expect(result.signals.some((item) => item.signalType === 'follow_up_gap_cluster')).toBe(true);
      expect(result.signals.some((item) => item.signalType === 'opportunity_cluster')).toBe(true);
      expect(result.signals.some((item) => item.signalType === 'attention_cluster')).toBe(true);
    }
  });

  it('replays an existing cluster deterministically', async () => {
    const repository = createRepository();
    repository.getCoalescedSignalByIdempotencyKey = vi.fn(async () => ({
      id: 'coalesced-signal:existing',
      tenantId,
      signalType: 'blocked_execution_cluster',
      status: 'active',
      title: 'Blocked execution cluster',
      summary: '2 related blocked records point to the same execution problem.',
      reason: 'Blocked records are overlapping.',
      idempotencyKey: 'coal:blocked',
      sourceRecordIds: ['notification:1', 'recommendation:1'],
      sourceRecordTypes: ['notification', 'recommendation'],
      dominantSourceType: 'notification',
      suppressedRecordIds: ['recommendation:1'],
      auditEventId: 'diag:existing',
      metadata: {},
      createdAtIso: '2026-03-17T12:30:00.000Z',
      evaluatedAtIso: '2026-03-17T12:30:00.000Z',
      acknowledgedAtIso: null,
      dismissedAtIso: null
    }));
    const service = new AaliyahSignalCoalescingService(repository, createDiagnostics());
    const result = await service.evaluate({
      tenantId,
      actorId,
      principalContext: 'founder',
      mode: 'founder',
      generatedAt: '2026-03-17T12:31:00.000Z'
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.replayedCount).toBeGreaterThan(0);
    }
  });

  it('supports acknowledgement lifecycle updates', async () => {
    const repository = createRepository();
    const service = new AaliyahSignalCoalescingService(repository, createDiagnostics());
    const created = await service.evaluate({
      tenantId,
      actorId,
      principalContext: 'founder',
      mode: 'founder',
      generatedAt: '2026-03-17T12:30:00.000Z'
    });
    expect(created.ok).toBe(true);
    if (!created.ok || created.signals.length === 0) return;

    const ack = await service.acknowledge({
      tenantId,
      actorId,
      principalContext: 'founder',
      mode: 'founder',
      signalId: created.signals[0]!.id,
      generatedAt: '2026-03-17T12:32:00.000Z'
    });

    expect(ack.ok).toBe(true);
    if (ack.ok) {
      expect(ack.signal.status).toBe('acknowledged');
    }
  });
});
