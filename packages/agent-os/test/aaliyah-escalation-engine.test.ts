import { describe, expect, it, vi } from 'vitest';

import { AaliyahEscalationEngineService } from '../src/aaliyah/escalation-engine-service.js';

const tenantId = '11111111-1111-4111-8111-111111111111';
const actorId = 'actor-1';

function createRepository() {
  const created: any[] = [];
  const founderPreferenceControls = {
    id: 'founder-preference-controls:1',
    tenantId,
    actorUserId: actorId,
    notification: {
      minimumConsoleSeverity: 'warning',
      minimumEmailSeverity: 'critical',
      autoDismissInfoAfterHours: null
    },
    digest: {
      dailyDigestEnabled: true,
      weeklyBriefEnabled: true,
      criticalDigestEnabled: true,
      sendEmptyDigests: false
    },
    opportunity: {
      dormantContactDays: 14,
      missedFollowUpWindowHours: 48,
      recurringBlockThreshold: 3,
      engagementSpikeMinimumEvents: 3
    },
    recommendation: {
      escalateHighPriorityOnly: true,
      reviveContactRequiresPriorValue: true
    },
    scheduler: {
      allowAutomaticRuns: true,
      defaultDailyRunHourUtc: 16
    },
    delivery: {
      emailEnabled: true,
      consoleEnabled: true
    },
    escalation: {
      criticalEscalationHours: 24,
      blockedPatternEscalationCount: 3,
      clusterPressureThreshold: 4,
      missedFollowUpEscalationHours: 72,
      attentionOverloadThreshold: 4
    },
    createdAtIso: '2026-03-16T08:00:00.000Z',
    updatedAtIso: '2026-03-16T08:00:00.000Z'
  };
  const criticalNotification = {
    id: 'notification:1',
    tenantId,
    source: { sourceType: 'task' as const, sourceId: 'task:1' },
    notificationType: 'stale_critical_work' as const,
    severity: 'critical' as const,
    status: 'active' as const,
    title: 'Critical stale work',
    summary: 'Critical stale work still needs resolution.',
    reason: 'Task remains stale and unacknowledged.',
    idempotencyKey: 'notif:1',
    relatedRecommendationId: null,
    relatedTaskId: 'task:1',
    auditEventId: 'diag:notif:1',
    metadata: { targetId: 'task:1' },
    createdAtIso: '2026-03-16T08:00:00.000Z',
    evaluatedAtIso: '2026-03-16T08:00:00.000Z',
    acknowledgedAtIso: null,
    dismissedAtIso: null
  };
  const missedOpportunity = {
    id: 'opportunity:1',
    tenantId,
    source: { sourceType: 'contact' as const, sourceId: 'contact:1' },
    opportunityType: 'missed_follow_up_window' as const,
    status: 'active' as const,
    reason: 'Meeting follow-up never happened.',
    summary: 'Missed follow-up window remains unresolved.',
    idempotencyKey: 'opp:1',
    relatedTaskId: 'task:2',
    relatedRecommendationId: null,
    auditEventId: 'diag:opp:1',
    metadata: { contactId: 'contact:1' },
    createdAtIso: '2026-03-13T08:00:00.000Z',
    evaluatedAtIso: '2026-03-13T08:00:00.000Z',
    acknowledgedAtIso: null,
    dismissedAtIso: null
  };
  const blockedCluster = {
    id: 'coalesced-signal:1',
    tenantId,
    signalType: 'blocked_execution_cluster' as const,
    status: 'active' as const,
    title: 'Blocked execution cluster',
    summary: 'Multiple blocked records are accumulating around the same task.',
    reason: 'Blocked records overlap.',
    idempotencyKey: 'coal:1',
    sourceRecordIds: ['notification:1', 'recommendation:1', 'follow-through:1'],
    sourceRecordTypes: ['notification', 'recommendation', 'follow_through_record'],
    dominantSourceType: 'notification' as const,
    suppressedRecordIds: ['recommendation:1', 'follow-through:1'],
    auditEventId: 'diag:coal:1',
    metadata: { clusterKey: 'task:1', contributingCount: 3 },
    createdAtIso: '2026-03-16T09:00:00.000Z',
    evaluatedAtIso: '2026-03-16T09:00:00.000Z',
    acknowledgedAtIso: null,
    dismissedAtIso: null
  };
  const attentionCluster = {
    ...blockedCluster,
    id: 'coalesced-signal:2',
    signalType: 'attention_cluster' as const,
    summary: 'Attention load is stacking up around the same founder queue.',
    sourceRecordIds: ['notification:1', 'notification:2', 'recommendation:2', 'strategic-insight:1'],
    sourceRecordTypes: ['notification', 'notification', 'recommendation', 'strategic_insight'],
    metadata: { clusterKey: 'global', contributingCount: 4 }
  };
  const insight = {
    id: 'strategic-insight:1',
    tenantId,
    insightType: 'attention_priority' as const,
    status: 'active' as const,
    title: 'Founder attention is needed',
    summary: 'Attention pressure is accumulating.',
    reason: 'Signals are clustering faster than acknowledgement.',
    idempotencyKey: 'si:1',
    relatedEntityIds: ['task:1'],
    relatedRecordIds: ['notification:1'],
    auditEventId: 'diag:si:1',
    metadata: {},
    createdAtIso: '2026-03-16T09:30:00.000Z',
    evaluatedAtIso: '2026-03-16T09:30:00.000Z',
    acknowledgedAtIso: null,
    dismissedAtIso: null
  };
  const recommendation = {
    id: 'recommendation:2',
    tenantId,
    source: { sourceType: 'task' as const, sourceId: 'task:1' },
    recommendationType: 'escalate_now' as const,
    status: 'active' as const,
    reason: 'Task should escalate.',
    summary: 'Escalate now.',
    idempotencyKey: 'rec:2',
    relatedCommandId: null,
    relatedTaskId: 'task:1',
    metadata: { targetId: 'task:1' },
    auditEventId: 'diag:rec:2',
    createdAtIso: '2026-03-16T10:00:00.000Z',
    evaluatedAtIso: '2026-03-16T10:00:00.000Z'
  };

  return {
    getFounderPreferenceControls: vi.fn(async () => founderPreferenceControls),
    listNotifications: vi.fn(async () => [
      criticalNotification,
      { ...criticalNotification, id: 'notification:2', relatedTaskId: 'task:3', summary: 'Another critical queue item.' }
    ]),
    listRecommendations: vi.fn(async () => [recommendation]),
    listOpportunities: vi.fn(async () => [missedOpportunity]),
    listStrategicInsights: vi.fn(async () => [insight]),
    listCoalescedSignals: vi.fn(async () => [blockedCluster, attentionCluster]),
    listFollowThroughEngineRecords: vi.fn(async () => []),
    getEscalationByIdempotencyKey: vi.fn(async () => null),
    createEscalation: vi.fn(async (args: any) => {
      const record = {
        id: args.escalationId,
        tenantId: args.tenantId,
        escalationType: args.escalationType,
        status: args.escalationStatus,
        title: args.title,
        summary: args.summary,
        reason: args.reason,
        escalationLevel: args.escalationLevel,
        idempotencyKey: args.idempotencyKey,
        sourceRecordIds: args.sourceRecordIds,
        sourceRecordTypes: args.sourceRecordTypes,
        relatedClusterId: args.relatedClusterId,
        auditEventId: args.auditEventId,
        metadata: args.metadata ?? {},
        createdAtIso: args.createdAt,
        evaluatedAtIso: args.evaluatedAt,
        acknowledgedAtIso: null,
        dismissedAtIso: null,
        resolvedAtIso: null
      };
      created.push(record);
      return record;
    }),
    getEscalationById: vi.fn(async ({ escalationId }: { escalationId: string }) => created.find((item) => item.id === escalationId) ?? null),
    listEscalations: vi.fn(async () => created),
    updateEscalationStatus: vi.fn(async ({ escalationId, status, changedAt }: any) => {
      const current = created.find((item) => item.id === escalationId);
      return {
        ...current,
        status,
        acknowledgedAtIso: status === 'acknowledged' ? changedAt : current?.acknowledgedAtIso ?? null,
        dismissedAtIso: status === 'dismissed' ? changedAt : current?.dismissedAtIso ?? null,
        resolvedAtIso: status === 'resolved' ? changedAt : current?.resolvedAtIso ?? null
      };
    })
  } as any;
}

function createDiagnostics() {
  return {
    recordEvent: vi.fn(async () => ({ eventId: 'aaliyah-diagnostics:event-1' }))
  } as any;
}

describe('Aaliyah escalation engine service', () => {
  it('creates escalation records when unresolved pressure crosses thresholds', async () => {
    const service = new AaliyahEscalationEngineService(createRepository(), createDiagnostics());
    const result = await service.evaluate({
      tenantId,
      actorId,
      principalContext: 'founder',
      mode: 'founder',
      generatedAt: '2026-03-17T12:00:00.000Z'
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.escalations.some((item) => item.escalationType === 'stale_critical_escalation')).toBe(true);
    expect(result.escalations.some((item) => item.escalationType === 'blocked_pattern_escalation')).toBe(true);
    expect(result.escalations.some((item) => item.escalationType === 'cluster_pressure_escalation')).toBe(true);
    expect(result.escalations.some((item) => item.escalationType === 'missed_follow_up_escalation')).toBe(true);
    expect(result.escalations.some((item) => item.escalationType === 'attention_overload_escalation')).toBe(true);
  });

  it('replays an existing escalation deterministically', async () => {
    const repository = createRepository();
    repository.getEscalationByIdempotencyKey = vi.fn(async () => ({
      id: 'escalation:existing',
      tenantId,
      escalationType: 'stale_critical_escalation',
      status: 'active',
      title: 'Critical issue crossed the escalation threshold',
      summary: 'Critical stale work has stayed open too long.',
      reason: 'Critical notification remained unresolved.',
      escalationLevel: 'critical',
      idempotencyKey: 'esc:1',
      sourceRecordIds: ['notification:1'],
      sourceRecordTypes: ['notification'],
      relatedClusterId: null,
      auditEventId: 'diag:esc:1',
      metadata: {},
      createdAtIso: '2026-03-17T12:00:00.000Z',
      evaluatedAtIso: '2026-03-17T12:00:00.000Z',
      acknowledgedAtIso: null,
      dismissedAtIso: null,
      resolvedAtIso: null
    }));
    const service = new AaliyahEscalationEngineService(repository, createDiagnostics());
    const result = await service.evaluate({
      tenantId,
      actorId,
      principalContext: 'founder',
      mode: 'founder',
      generatedAt: '2026-03-17T12:00:00.000Z'
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.replayedCount).toBeGreaterThan(0);
  });

  it('supports acknowledgement, dismissal, and resolution lifecycle updates', async () => {
    const repository = createRepository();
    const service = new AaliyahEscalationEngineService(repository, createDiagnostics());
    const created = await service.evaluate({
      tenantId,
      actorId,
      principalContext: 'founder',
      mode: 'founder',
      generatedAt: '2026-03-17T12:00:00.000Z'
    });
    expect(created.ok).toBe(true);
    if (!created.ok || created.escalations.length === 0) return;

    const target = created.escalations[0]!;
    const ack = await service.acknowledge({
      tenantId,
      actorId,
      principalContext: 'founder',
      mode: 'founder',
      escalationId: target.id,
      generatedAt: '2026-03-17T12:05:00.000Z'
    });
    expect(ack.ok).toBe(true);
    if (!ack.ok) return;
    expect(ack.escalation.status).toBe('acknowledged');

    const dismiss = await service.dismiss({
      tenantId,
      actorId,
      principalContext: 'founder',
      mode: 'founder',
      escalationId: created.escalations[1]!.id,
      generatedAt: '2026-03-17T12:06:00.000Z'
    });
    expect(dismiss.ok).toBe(true);
    if (!dismiss.ok) return;
    expect(dismiss.escalation.status).toBe('dismissed');

    const resolve = await service.resolve({
      tenantId,
      actorId,
      principalContext: 'founder',
      mode: 'founder',
      escalationId: target.id,
      generatedAt: '2026-03-17T12:07:00.000Z'
    });
    expect(resolve.ok).toBe(true);
    if (!resolve.ok) return;
    expect(resolve.escalation.status).toBe('resolved');
  });

  it('denies non-founder access', async () => {
    const service = new AaliyahEscalationEngineService(createRepository(), createDiagnostics());
    const result = await service.list({
      tenantId,
      actorId,
      principalContext: 'operator',
      mode: 'founder'
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.denialCode).toBe('ACCESS_DENIED');
  });
});
