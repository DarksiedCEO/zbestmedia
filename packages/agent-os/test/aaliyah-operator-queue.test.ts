import { describe, expect, it, vi } from 'vitest';

import { AaliyahOperatorQueueService } from '../src/aaliyah/operator-queue-service.js';

const tenantId = '11111111-1111-4111-8111-111111111111';
const actorId = 'actor-1';

function createRepository() {
  const created: any[] = [];
  return {
    listEscalations: vi.fn(async () => [
      {
        id: 'escalation:1',
        tenantId,
        escalationType: 'stale_critical_escalation',
        status: 'active',
        title: 'Critical issue crossed the escalation line',
        summary: 'Critical stale work has stayed open too long.',
        reason: 'Critical notification remained unresolved.',
        escalationLevel: 'critical',
        idempotencyKey: 'esc:1',
        sourceRecordIds: ['notification:1', 'recommendation:1'],
        sourceRecordTypes: ['notification', 'recommendation'],
        relatedClusterId: 'coalesced-signal:1',
        auditEventId: 'diag:esc:1',
        metadata: {},
        createdAtIso: '2026-03-17T12:00:00.000Z',
        evaluatedAtIso: '2026-03-17T12:00:00.000Z',
        acknowledgedAtIso: null,
        dismissedAtIso: null,
        resolvedAtIso: null
      }
    ]),
    listCoalescedSignals: vi.fn(async () => [
      {
        id: 'coalesced-signal:1',
        tenantId,
        signalType: 'attention_cluster',
        status: 'active',
        title: 'Attention cluster',
        summary: 'Multiple alerts point at one fire.',
        reason: 'Signals overlap.',
        idempotencyKey: 'coal:1',
        sourceRecordIds: ['notification:1', 'recommendation:1'],
        sourceRecordTypes: ['notification', 'recommendation'],
        dominantSourceType: 'notification',
        suppressedRecordIds: ['notification:1', 'recommendation:1'],
        auditEventId: 'diag:coal:1',
        metadata: { clusterKey: 'task:1' },
        createdAtIso: '2026-03-17T11:00:00.000Z',
        evaluatedAtIso: '2026-03-17T11:00:00.000Z',
        acknowledgedAtIso: null,
        dismissedAtIso: null
      }
    ]),
    listStrategicInsights: vi.fn(async () => [
      {
        id: 'strategic-insight:1',
        tenantId,
        insightType: 'blocked_pattern',
        status: 'active',
        title: 'Blocked pattern',
        summary: 'Repeated blocking is clustering.',
        reason: 'Same workstream keeps stalling.',
        idempotencyKey: 'si:1',
        relatedEntityIds: ['task:1'],
        relatedRecordIds: ['notification:1'],
        auditEventId: 'diag:si:1',
        metadata: {},
        createdAtIso: '2026-03-17T10:00:00.000Z',
        evaluatedAtIso: '2026-03-17T10:00:00.000Z',
        acknowledgedAtIso: null,
        dismissedAtIso: null
      }
    ]),
    listNotifications: vi.fn(async () => [
      {
        id: 'notification:1',
        tenantId,
        source: { sourceType: 'task', sourceId: 'task:1' },
        notificationType: 'stale_critical_work',
        severity: 'critical',
        status: 'active',
        title: 'Critical stale work',
        summary: 'Critical stale work still needs resolution.',
        reason: 'Task remains stale and unacknowledged.',
        idempotencyKey: 'notif:1',
        relatedRecommendationId: null,
        relatedTaskId: 'task:1',
        auditEventId: 'diag:notif:1',
        metadata: {},
        createdAtIso: '2026-03-17T09:00:00.000Z',
        evaluatedAtIso: '2026-03-17T09:00:00.000Z',
        acknowledgedAtIso: null,
        dismissedAtIso: null
      }
    ]),
    listRecommendations: vi.fn(async () => [
      {
        id: 'recommendation:1',
        tenantId,
        source: { sourceType: 'task', sourceId: 'task:1' },
        recommendationType: 'escalate_now',
        status: 'active',
        reason: 'Task should escalate.',
        summary: 'Escalate now.',
        idempotencyKey: 'rec:1',
        relatedCommandId: null,
        relatedTaskId: 'task:1',
        metadata: {},
        auditEventId: 'diag:rec:1',
        createdAtIso: '2026-03-17T08:30:00.000Z',
        evaluatedAtIso: '2026-03-17T08:30:00.000Z'
      },
      {
        id: 'recommendation:2',
        tenantId,
        source: { sourceType: 'contact', sourceId: 'contact:2' },
        recommendationType: 'follow_up_now',
        status: 'active',
        reason: 'Contact thread is still open.',
        summary: 'Follow up now.',
        idempotencyKey: 'rec:2',
        relatedCommandId: null,
        relatedTaskId: null,
        metadata: {},
        auditEventId: 'diag:rec:2',
        createdAtIso: '2026-03-17T08:00:00.000Z',
        evaluatedAtIso: '2026-03-17T08:00:00.000Z'
      }
    ]),
    listOpportunities: vi.fn(async () => [
      {
        id: 'opportunity:1',
        tenantId,
        source: { sourceType: 'contact', sourceId: 'contact:9' },
        opportunityType: 'dormant_contact',
        status: 'active',
        reason: 'High-value contact has gone quiet.',
        summary: 'Dormant contact opportunity.',
        idempotencyKey: 'opp:1',
        relatedTaskId: null,
        relatedRecommendationId: null,
        auditEventId: 'diag:opp:1',
        metadata: {},
        createdAtIso: '2026-03-17T07:00:00.000Z',
        evaluatedAtIso: '2026-03-17T07:00:00.000Z',
        acknowledgedAtIso: null,
        dismissedAtIso: null
      }
    ]),
    getOperatorQueueRecordByIdempotencyKey: vi.fn(async () => null),
    createOperatorQueueRecord: vi.fn(async (args: any) => {
      const record = {
        id: args.queueItemId,
        tenantId: args.tenantId,
        sourceType: args.sourceType,
        sourceId: args.sourceId,
        queueItemType: args.queueItemType,
        priorityScore: args.priorityScore,
        priorityBand: args.priorityBand,
        title: args.title,
        summary: args.summary,
        reason: args.reason,
        idempotencyKey: args.idempotencyKey,
        relatedRecordIds: args.relatedRecordIds,
        relatedRecordTypes: args.relatedRecordTypes,
        actionableCommandType: args.actionableCommandType,
        actionableTargetType: args.actionableTargetType,
        actionableTargetId: args.actionableTargetId,
        auditEventId: args.auditEventId,
        metadata: args.metadata ?? {},
        createdAtIso: args.createdAt,
        evaluatedAtIso: args.evaluatedAt
      };
      created.push(record);
      return record;
    }),
    getOperatorQueueRecordById: vi.fn(async ({ queueItemId }: { queueItemId: string }) => created.find((item) => item.id === queueItemId) ?? null),
    listOperatorQueueRecords: vi.fn(async () => created)
  } as any;
}

function createDiagnostics() {
  return {
    recordEvent: vi.fn(async () => ({ eventId: 'aaliyah-diagnostics:event-1' }))
  } as any;
}

describe('Aaliyah operator queue service', () => {
  it('ranks critical escalations ahead of lower-value records and suppresses covered raw items', async () => {
    const service = new AaliyahOperatorQueueService(createRepository(), createDiagnostics());
    const result = await service.evaluate({
      tenantId,
      actorId,
      principalContext: 'founder',
      mode: 'founder',
      generatedAt: '2026-03-17T12:30:00.000Z'
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.queueItems[0]?.sourceType).toBe('escalation');
    expect(result.queueItems.some((item) => item.sourceType === 'notification')).toBe(false);
    expect(result.queueItems.some((item) => item.sourceId === 'recommendation:1')).toBe(false);
    expect(result.suppressedCount).toBeGreaterThan(0);
  });

  it('resolves truthful founder commands for actionable recommendation and opportunity items', async () => {
    const service = new AaliyahOperatorQueueService(createRepository(), createDiagnostics());
    const result = await service.evaluate({
      tenantId,
      actorId,
      principalContext: 'founder',
      mode: 'founder',
      generatedAt: '2026-03-17T12:30:00.000Z'
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const followUpRecommendation = result.queueItems.find((item) => item.sourceId === 'recommendation:2');
    expect(followUpRecommendation?.actionableCommandType).toBe('create_follow_up');
    expect(followUpRecommendation?.actionableTargetType).toBe('contact');
    expect(followUpRecommendation?.actionableTargetId).toBe('contact:2');

    const opportunity = result.queueItems.find((item) => item.sourceId === 'opportunity:1');
    expect(opportunity?.actionableCommandType).toBe('create_follow_up');
    expect(opportunity?.actionableTargetType).toBe('contact');
  });

  it('replays an existing queue item deterministically', async () => {
    const repository = createRepository();
    repository.getOperatorQueueRecordByIdempotencyKey = vi.fn(async () => ({
      id: 'operator-queue:existing',
      tenantId,
      sourceType: 'escalation',
      sourceId: 'escalation:1',
      queueItemType: 'immediate_action',
      priorityScore: 100,
      priorityBand: 'critical',
      title: 'Critical issue crossed the escalation line',
      summary: 'Critical stale work has stayed open too long.',
      reason: 'Critical notification remained unresolved.',
      idempotencyKey: 'oq:existing',
      relatedRecordIds: ['notification:1'],
      relatedRecordTypes: ['notification'],
      actionableCommandType: null,
      actionableTargetType: null,
      actionableTargetId: null,
      auditEventId: 'diag:oq:1',
      metadata: {},
      createdAtIso: '2026-03-17T12:30:00.000Z',
      evaluatedAtIso: '2026-03-17T12:30:00.000Z'
    }));

    const service = new AaliyahOperatorQueueService(repository, createDiagnostics());
    const result = await service.evaluate({
      tenantId,
      actorId,
      principalContext: 'founder',
      mode: 'founder',
      generatedAt: '2026-03-17T12:30:00.000Z'
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.replayedCount).toBeGreaterThan(0);
    expect(repository.createOperatorQueueRecord).not.toHaveBeenCalled();
  });

  it('returns top queue items with immediate actions first', async () => {
    const repository = createRepository();
    const service = new AaliyahOperatorQueueService(repository, createDiagnostics());
    await service.evaluate({
      tenantId,
      actorId,
      principalContext: 'founder',
      mode: 'founder',
      generatedAt: '2026-03-17T12:30:00.000Z'
    });

    const result = await service.top({
      tenantId,
      actorId,
      principalContext: 'founder',
      mode: 'founder',
      immediateLimit: 2,
      overallLimit: 3
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.immediateActions.length).toBeLessThanOrEqual(2);
    expect(result.topQueueItems.length).toBeLessThanOrEqual(3);
  });

  it('denies non-founder callers', async () => {
    const service = new AaliyahOperatorQueueService(createRepository(), createDiagnostics());
    const result = await service.evaluate({
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
