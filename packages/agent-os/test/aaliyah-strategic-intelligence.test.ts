import { describe, expect, it, vi } from 'vitest';

import { AaliyahStrategicIntelligenceService } from '../src/aaliyah/strategic-intelligence-service.js';

const tenantId = '11111111-1111-4111-8111-111111111111';
const actorId = 'actor-1';

function createRepository() {
  const notification = {
    id: 'notification:1',
    tenantId,
    source: { sourceType: 'task' as const, sourceId: 'task:1' },
    notificationType: 'stale_critical_work' as const,
    severity: 'critical' as const,
    status: 'active' as const,
    title: 'Critical task has gone stale',
    summary: 'A critical item is stale and still waiting on founder attention.',
    reason: 'The due date passed without closure.',
    idempotencyKey: 'notif:1',
    relatedRecommendationId: 'recommendation:1',
    relatedTaskId: 'task:1',
    auditEventId: 'diag:notif:1',
    metadata: {},
    createdAtIso: '2026-03-16T18:20:00.000Z',
    evaluatedAtIso: '2026-03-16T18:20:00.000Z',
    acknowledgedAtIso: null,
    dismissedAtIso: null
  };
  const recommendation = {
    id: 'recommendation:1',
    tenantId,
    source: { sourceType: 'task' as const, sourceId: 'task:1' },
    recommendationType: 'review_blocked' as const,
    status: 'active' as const,
    reason: 'Blocked recommendation requires review.',
    summary: 'Review the blocked recommendation path before momentum dies.',
    idempotencyKey: 'rec:1',
    relatedCommandId: null,
    relatedTaskId: 'task:1',
    metadata: { targetType: 'task', targetId: 'task:1' },
    auditEventId: 'diag:rec:1',
    createdAtIso: '2026-03-16T18:21:00.000Z',
    evaluatedAtIso: '2026-03-16T18:21:00.000Z'
  };
  const opportunityA = {
    id: 'opportunity:1',
    tenantId,
    source: { sourceType: 'contact' as const, sourceId: 'crm-contact:1' },
    opportunityType: 'missed_follow_up_window' as const,
    status: 'active' as const,
    reason: 'Follow-up window passed without a next step.',
    summary: 'A missed follow-up window is live for this contact.',
    idempotencyKey: 'opp:1',
    relatedTaskId: 'task:1',
    relatedRecommendationId: null,
    auditEventId: 'diag:opp:1',
    metadata: { accountId: 'crm-account:1', targetId: 'crm-contact:1' },
    createdAtIso: '2026-03-16T18:22:00.000Z',
    evaluatedAtIso: '2026-03-16T18:22:00.000Z',
    acknowledgedAtIso: null,
    dismissedAtIso: null
  };
  const opportunityB = {
    ...opportunityA,
    id: 'opportunity:2',
    opportunityType: 'recurring_block_pattern' as const,
    idempotencyKey: 'opp:2'
  };
  const followThroughBlocked = {
    id: 'follow-through-engine:1',
    tenantId,
    source: { sourceType: 'task' as const, sourceId: 'task:1' },
    policyKey: 'FT-005-rejected-intent-context' as const,
    decisionType: 'record_blocked' as const,
    status: 'blocked' as const,
    reason: 'Founder intent was rejected and still needs review.',
    summary: 'Recorded blocked context because founder intent was rejected.',
    idempotencyKey: 'ft:1',
    createdArtifactIds: [],
    auditEventId: 'diag:ft:1',
    metadata: { linkedTaskId: 'task:1' },
    createdAt: '2026-03-16T18:18:00.000Z',
    evaluatedAtIso: '2026-03-16T18:18:00.000Z'
  };
  const followThroughStale = {
    ...followThroughBlocked,
    id: 'follow-through-engine:2',
    policyKey: 'FT-003-overdue-task-stale' as const,
    decisionType: 'flag_stale' as const,
    status: 'stale' as const,
    reason: 'Task is stale.',
    summary: 'Task was flagged stale.'
  };
  const taskA = {
    id: 'task:1',
    tenantId,
    principalId: actorId,
    title: 'Follow up with ACME',
    description: null,
    status: 'open' as const,
    priority: 'critical' as const,
    source: 'crm_follow_up' as const,
    contactId: 'crm-contact:1',
    accountId: 'crm-account:1',
    relatedEmailDraftId: null,
    relatedCalendarEventId: null,
    dueAt: '2026-03-14T10:00:00.000Z',
    remindAt: null,
    blockedReason: null,
    completionNote: null,
    nextStepSummary: null,
    createdAt: '2026-03-13T10:00:00.000Z',
    updatedAt: '2026-03-14T10:00:00.000Z',
    completedAt: null
  };
  const taskB = { ...taskA, id: 'task:2', dueAt: '2026-03-13T10:00:00.000Z' };
  const created: any[] = [];

  return {
    listNotifications: vi.fn(async () => [notification]),
    listRecommendations: vi.fn(async () => [recommendation]),
    listOpportunities: vi.fn(async () => [opportunityA, opportunityB]),
    listFollowThroughEngineRecords: vi.fn(async () => [followThroughBlocked, followThroughStale]),
    listFounderCommands: vi.fn(async () => []),
    listAaliyahOpenTasks: vi.fn(async () => [taskA, taskB]),
    listAaliyahDiagnosticsEvents: vi.fn(async () => []),
    getStrategicInsightByIdempotencyKey: vi.fn(async () => null),
    createStrategicInsight: vi.fn(async (args: any) => {
      const record = {
        id: args.insightId,
        tenantId: args.tenantId,
        insightType: args.insightType,
        status: args.insightStatus,
        title: args.title,
        summary: args.summary,
        reason: args.reason,
        idempotencyKey: args.idempotencyKey,
        relatedEntityIds: args.relatedEntityIds,
        relatedRecordIds: args.relatedRecordIds,
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
    getStrategicInsightById: vi.fn(async ({ insightId }: { insightId: string }) => created.find((item) => item.id === insightId) ?? null),
    listStrategicInsights: vi.fn(async () => created),
    updateStrategicInsightStatus: vi.fn(async ({ insightId, status, changedAt }: any) => {
      const current = created.find((item) => item.id === insightId);
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
    recordEvent: vi.fn(async () => ({ eventId: 'aaliyah-diagnostics:event-7' }))
  } as any;
}

describe('Aaliyah strategic intelligence service', () => {
  it('creates attention, blocked, follow-through, and opportunity insights', async () => {
    const service = new AaliyahStrategicIntelligenceService(createRepository(), createDiagnostics());
    const result = await service.evaluate({
      tenantId,
      actorId,
      principalContext: 'founder',
      mode: 'founder',
      scope: 'daily',
      generatedAt: '2026-03-16T18:30:00.000Z'
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.insights.some((item) => item.insightType === 'attention_priority')).toBe(true);
      expect(result.insights.some((item) => item.insightType === 'blocked_pattern')).toBe(true);
      expect(result.insights.some((item) => item.insightType === 'follow_through_gap')).toBe(true);
      expect(result.insights.some((item) => item.insightType === 'opportunity_cluster')).toBe(true);
      expect(result.insights.some((item) => item.insightType === 'daily_brief')).toBe(true);
    }
  });

  it('replays an existing insight deterministically', async () => {
    const repository = createRepository();
    repository.getStrategicInsightByIdempotencyKey = vi.fn(async () => ({
      id: 'strategic-insight:existing',
      tenantId,
      insightType: 'attention_priority',
      status: 'active',
      title: 'Founder attention is needed now',
      summary: 'Critical signal is accumulating and needs founder attention before momentum slips.',
      reason: 'Critical notifications and active recommendation pressure are stacking up faster than founder acknowledgement.',
      idempotencyKey: 'si:attention_priority:founder:abc',
      relatedEntityIds: ['crm-account:1'],
      relatedRecordIds: ['notification:1'],
      auditEventId: 'diag:existing',
      metadata: {},
      createdAtIso: '2026-03-16T18:25:00.000Z',
      evaluatedAtIso: '2026-03-16T18:25:00.000Z',
      acknowledgedAtIso: null,
      dismissedAtIso: null
    }));
    const service = new AaliyahStrategicIntelligenceService(repository, createDiagnostics());
    const result = await service.evaluate({
      tenantId,
      actorId,
      principalContext: 'founder',
      mode: 'founder',
      scope: 'current',
      generatedAt: '2026-03-16T18:30:00.000Z'
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.replayedCount).toBeGreaterThan(0);
    }
  });

  it('allows acknowledgement lifecycle updates', async () => {
    const repository = createRepository();
    const service = new AaliyahStrategicIntelligenceService(repository, createDiagnostics());
    const created = await service.evaluate({
      tenantId,
      actorId,
      principalContext: 'founder',
      mode: 'founder',
      scope: 'current',
      generatedAt: '2026-03-16T18:30:00.000Z'
    });
    expect(created.ok).toBe(true);
    if (!created.ok || created.insights.length === 0) return;

    const ack = await service.acknowledge({
      tenantId,
      actorId,
      principalContext: 'founder',
      mode: 'founder',
      insightId: created.insights[0]!.id,
      generatedAt: '2026-03-16T18:31:00.000Z'
    });

    expect(ack.ok).toBe(true);
    if (ack.ok) {
      expect(ack.insight.status).toBe('acknowledged');
    }
  });
});
