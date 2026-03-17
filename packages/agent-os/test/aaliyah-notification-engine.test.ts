import { describe, expect, it, vi } from 'vitest';

import { AaliyahNotificationEngineService } from '../src/aaliyah/notification-engine-service.js';

const tenantId = '11111111-1111-4111-8111-111111111111';
const actorId = 'actor-1';

function createRepository() {
  const staleTask = {
    id: 'task:1',
    tenantId,
    principalId: actorId,
    title: 'Critical follow-up',
    description: null,
    status: 'open' as const,
    priority: 'critical' as const,
    source: 'crm_follow_up' as const,
    contactId: null,
    accountId: null,
    relatedEmailDraftId: null,
    relatedCalendarEventId: null,
    dueAt: '2026-03-14T12:00:00.000Z',
    remindAt: null,
    blockedReason: null,
    completionNote: null,
    nextStepSummary: null,
    createdAt: '2026-03-13T12:00:00.000Z',
    updatedAt: '2026-03-16T12:00:00.000Z',
    completedAt: null
  };
  const followThroughRecord = {
    id: 'follow-through-engine:1',
    tenantId,
    source: { sourceType: 'task' as const, sourceId: staleTask.id },
    policyKey: 'FT-003-overdue-task-stale' as const,
    decisionType: 'flag_stale' as const,
    status: 'stale' as const,
    reason: 'Task due date passed without a resolution.',
    summary: 'Flagged task as stale because due date passed.',
    idempotencyKey: 'ft:key',
    createdArtifactIds: [],
    auditEventId: 'diag:ft:1',
    metadata: { linkedTaskId: staleTask.id },
    createdAt: '2026-03-16T18:00:00.000Z',
    evaluatedAtIso: '2026-03-16T18:00:00.000Z'
  };
  const recommendation = {
    id: 'recommendation:1',
    tenantId,
    source: { sourceType: 'follow_through_record' as const, sourceId: followThroughRecord.id },
    recommendationType: 'review_blocked' as const,
    status: 'active' as const,
    reason: 'Blocked recommendation requires review.',
    summary: 'Review the blocked recommendation path before momentum dies.',
    idempotencyKey: 'rec:key',
    relatedCommandId: null,
    relatedTaskId: staleTask.id,
    metadata: {},
    auditEventId: 'diag:rec:1',
    createdAtIso: '2026-03-16T18:05:00.000Z',
    evaluatedAtIso: '2026-03-16T18:05:00.000Z'
  };

  return {
    getFollowThroughEngineRecordById: vi.fn(async ({ recordId }: { recordId: string }) => recordId === followThroughRecord.id ? followThroughRecord : null),
    getRecommendationById: vi.fn(async ({ recommendationId }: { recommendationId: string }) => recommendationId === recommendation.id ? recommendation : null),
    getAaliyahTaskById: vi.fn(async ({ taskId }: { taskId: string }) => taskId === staleTask.id ? staleTask : null),
    getNotificationByIdempotencyKey: vi.fn(async () => null),
    createNotification: vi.fn(async (args: any) => ({
      id: args.notificationId,
      tenantId: args.tenantId,
      source: { sourceType: args.sourceType, sourceId: args.sourceId },
      notificationType: args.notificationType,
      severity: args.severity,
      status: args.notificationStatus,
      title: args.title,
      summary: args.summary,
      reason: args.reason,
      idempotencyKey: args.idempotencyKey,
      relatedRecommendationId: args.relatedRecommendationId,
      relatedTaskId: args.relatedTaskId,
      auditEventId: args.auditEventId,
      metadata: args.metadata ?? {},
      createdAtIso: args.createdAt,
      evaluatedAtIso: args.evaluatedAt,
      acknowledgedAtIso: null,
      dismissedAtIso: null
    })),
    getNotificationById: vi.fn(async ({ notificationId }: { notificationId: string }) => notificationId === 'notification:1' ? {
      id: 'notification:1',
      tenantId,
      source: { sourceType: 'follow_through_record' as const, sourceId: followThroughRecord.id },
      notificationType: 'stale_critical_work' as const,
      severity: 'critical' as const,
      status: 'active' as const,
      title: 'Critical task has gone stale',
      summary: 'A stale high-priority item needs founder attention now.',
      reason: 'Stale high-priority work still needs founder attention.',
      idempotencyKey: 'notif:key',
      relatedRecommendationId: null,
      relatedTaskId: staleTask.id,
      auditEventId: 'diag:notif:1',
      metadata: {},
      createdAtIso: '2026-03-16T18:20:00.000Z',
      evaluatedAtIso: '2026-03-16T18:20:00.000Z',
      acknowledgedAtIso: null,
      dismissedAtIso: null
    } : null),
    listNotifications: vi.fn(async () => []),
    updateNotificationStatus: vi.fn(async ({ status }: { status: 'acknowledged' | 'dismissed' }) => ({
      id: 'notification:1',
      tenantId,
      source: { sourceType: 'follow_through_record' as const, sourceId: followThroughRecord.id },
      notificationType: 'stale_critical_work' as const,
      severity: 'critical' as const,
      status,
      title: 'Critical task has gone stale',
      summary: 'A stale high-priority item needs founder attention now.',
      reason: 'Stale high-priority work still needs founder attention.',
      idempotencyKey: 'notif:key',
      relatedRecommendationId: null,
      relatedTaskId: staleTask.id,
      auditEventId: 'diag:notif:1',
      metadata: {},
      createdAtIso: '2026-03-16T18:20:00.000Z',
      evaluatedAtIso: '2026-03-16T18:20:00.000Z',
      acknowledgedAtIso: status === 'acknowledged' ? '2026-03-16T18:21:00.000Z' : null,
      dismissedAtIso: status === 'dismissed' ? '2026-03-16T18:21:00.000Z' : null
    }))
  } as any;
}

function createDiagnostics() {
  return {
    recordEvent: vi.fn(async () => ({ eventId: 'aaliyah-diagnostics:event-4' }))
  } as any;
}

describe('Aaliyah notification engine service', () => {
  it('creates a critical notification for stale critical work', async () => {
    const service = new AaliyahNotificationEngineService(createRepository(), createDiagnostics());
    const result = await service.evaluateSource({
      tenantId,
      actorId,
      principalContext: 'founder',
      mode: 'founder',
      source: { sourceType: 'follow_through_record', sourceId: 'follow-through-engine:1' },
      generatedAt: '2026-03-16T18:20:00.000Z'
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.notification.notificationType).toBe('stale_critical_work');
      expect(result.notification.severity).toBe('critical');
    }
  });

  it('creates a blocked recommendation notification', async () => {
    const service = new AaliyahNotificationEngineService(createRepository(), createDiagnostics());
    const result = await service.evaluateSource({
      tenantId,
      actorId,
      principalContext: 'founder',
      mode: 'founder',
      source: { sourceType: 'recommendation', sourceId: 'recommendation:1' },
      generatedAt: '2026-03-16T18:20:00.000Z'
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.notification.notificationType).toBe('blocked_recommendation');
      expect(result.notification.severity).toBe('warning');
    }
  });

  it('replays a duplicate notification', async () => {
    const repository = createRepository();
    repository.getNotificationByIdempotencyKey.mockResolvedValueOnce({
      id: 'notification:existing',
      tenantId,
      source: { sourceType: 'follow_through_record', sourceId: 'follow-through-engine:1' },
      notificationType: 'stale_critical_work',
      severity: 'critical',
      status: 'active',
      title: 'Critical task has gone stale',
      summary: 'A stale high-priority item needs founder attention now.',
      reason: 'Stale high-priority work still needs founder attention.',
      idempotencyKey: 'notif:key',
      relatedRecommendationId: null,
      relatedTaskId: 'task:1',
      auditEventId: 'diag:notif:existing',
      metadata: {},
      createdAtIso: '2026-03-16T18:20:00.000Z',
      evaluatedAtIso: '2026-03-16T18:20:00.000Z',
      acknowledgedAtIso: null,
      dismissedAtIso: null
    });
    const service = new AaliyahNotificationEngineService(repository, createDiagnostics());
    const result = await service.evaluateSource({
      tenantId,
      actorId,
      principalContext: 'founder',
      mode: 'founder',
      source: { sourceType: 'follow_through_record', sourceId: 'follow-through-engine:1' },
      generatedAt: '2026-03-16T18:20:00.000Z'
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.replayed).toBe(true);
    }
    expect(repository.createNotification).not.toHaveBeenCalled();
  });

  it('acknowledges a notification', async () => {
    const service = new AaliyahNotificationEngineService(createRepository(), createDiagnostics());
    const result = await service.acknowledgeNotification({
      tenantId,
      actorId,
      principalContext: 'founder',
      mode: 'founder',
      notificationId: 'notification:1'
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.notification.status).toBe('acknowledged');
    }
  });

  it('dismisses a notification', async () => {
    const service = new AaliyahNotificationEngineService(createRepository(), createDiagnostics());
    const result = await service.dismissNotification({
      tenantId,
      actorId,
      principalContext: 'founder',
      mode: 'founder',
      notificationId: 'notification:1'
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.notification.status).toBe('dismissed');
    }
  });

  it('denies non-founder access', async () => {
    const service = new AaliyahNotificationEngineService(createRepository(), createDiagnostics());
    const result = await service.listNotifications({
      tenantId,
      actorId,
      principalContext: 'operator',
      mode: 'founder'
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.denialCode).toBe('ACCESS_DENIED');
    }
  });
});
