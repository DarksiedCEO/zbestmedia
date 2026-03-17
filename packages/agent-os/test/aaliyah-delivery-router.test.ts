import { describe, expect, it, vi } from 'vitest';

import { AaliyahDeliveryRouterService } from '../src/aaliyah/delivery-router-service.js';

const tenantId = '11111111-1111-4111-8111-111111111111';
const actorId = 'actor-1';

function createNotification(overrides: Partial<any> = {}) {
  return {
    id: 'notification:1',
    tenantId,
    source: { sourceType: 'follow_through_record' as const, sourceId: 'ft:1' },
    notificationType: 'stale_critical_work' as const,
    severity: 'critical' as const,
    status: 'active' as const,
    title: 'Critical task has gone stale',
    summary: 'A critical stale task needs founder attention.',
    reason: 'The task is overdue and unresolved.',
    idempotencyKey: 'notif:key',
    relatedRecommendationId: null,
    relatedTaskId: 'task:1',
    auditEventId: 'diag:notif:1',
    metadata: {},
    createdAtIso: '2026-03-17T08:00:00.000Z',
    evaluatedAtIso: '2026-03-17T08:00:00.000Z',
    acknowledgedAtIso: null,
    dismissedAtIso: null,
    ...overrides
  };
}

function createRepository() {
  const deliveries = new Map<string, any>();
  const byId = new Map<string, any>();
  const notification = createNotification();

  return {
    getNotificationById: vi.fn(async ({ notificationId }: { notificationId: string }) =>
      notificationId === notification.id ? notification : null
    ),
    getDeliveryByIdempotencyKey: vi.fn(async ({ idempotencyKey }: { idempotencyKey: string }) => deliveries.get(idempotencyKey) ?? null),
    getDeliveryById: vi.fn(async ({ deliveryId }: { deliveryId: string }) => byId.get(deliveryId) ?? null),
    createDelivery: vi.fn(async (args: any) => {
      const record = {
        id: args.deliveryId,
        tenantId: args.tenantId,
        channel: args.channel,
        sourceType: args.sourceType,
        sourceId: args.sourceId,
        deliveryStatus: args.deliveryStatus,
        attemptCount: args.attemptCount,
        lastError: args.lastError,
        idempotencyKey: args.idempotencyKey,
        metadata: args.metadata ?? {},
        createdAtIso: args.createdAt,
        sentAtIso: args.sentAt ?? null
      };
      deliveries.set(args.idempotencyKey, record);
      byId.set(args.deliveryId, record);
      return record;
    }),
    updateDelivery: vi.fn(async (args: any) => {
      const existing = byId.get(args.deliveryId);
      const record = {
        ...existing,
        deliveryStatus: args.deliveryStatus,
        attemptCount: args.attemptCount,
        lastError: args.lastError,
        metadata: args.metadata ?? existing.metadata,
        sentAtIso: args.sentAt ?? existing.sentAtIso
      };
      byId.set(args.deliveryId, record);
      deliveries.set(record.idempotencyKey, record);
      return record;
    }),
    listDeliveries: vi.fn(async () => [...byId.values()])
  } as any;
}

function createDiagnostics() {
  return {
    recordEvent: vi.fn(async () => ({ eventId: 'diag:delivery:1' }))
  } as any;
}

describe('Aaliyah delivery router service', () => {
  it('sends console delivery for notifications', async () => {
    const repository = createRepository();
    const emailService = { sendSystemEmail: vi.fn() } as any;
    const service = new AaliyahDeliveryRouterService(repository, emailService, createDiagnostics());

    const result = await service.send({
      tenantId,
      actorId,
      principalContext: 'founder',
      mode: 'founder',
      sourceType: 'notification',
      sourceId: 'notification:1',
      channel: 'console',
      generatedAt: '2026-03-17T09:00:00.000Z'
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.delivery.channel).toBe('console');
      expect(result.delivery.deliveryStatus).toBe('sent');
    }
    expect(emailService.sendSystemEmail).not.toHaveBeenCalled();
  });

  it('sends critical notifications to email', async () => {
    const repository = createRepository();
    const emailService = {
      sendSystemEmail: vi.fn(async () => ({
        providerMessageId: 'gmail:message:1',
        providerThreadId: 'gmail:thread:1',
        sentAt: '2026-03-17T09:00:00.000Z'
      }))
    } as any;
    const service = new AaliyahDeliveryRouterService(repository, emailService, createDiagnostics());

    const result = await service.send({
      tenantId,
      actorId,
      principalContext: 'founder',
      mode: 'founder',
      sourceType: 'notification',
      sourceId: 'notification:1',
      channel: 'email',
      generatedAt: '2026-03-17T09:00:00.000Z'
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.delivery.channel).toBe('email');
      expect(result.delivery.deliveryStatus).toBe('sent');
    }
    expect(emailService.sendSystemEmail).toHaveBeenCalledOnce();
  });

  it('replays an already-sent delivery', async () => {
    const repository = createRepository();
    repository.getDeliveryByIdempotencyKey.mockResolvedValueOnce({
      id: 'delivery:1',
      tenantId,
      channel: 'console',
      sourceType: 'notification',
      sourceId: 'notification:1',
      deliveryStatus: 'sent',
      attemptCount: 1,
      lastError: null,
      idempotencyKey: 'delivery:console:notification:notification:1',
      metadata: {},
      createdAtIso: '2026-03-17T09:00:00.000Z',
      sentAtIso: '2026-03-17T09:00:00.000Z'
    });
    const emailService = { sendSystemEmail: vi.fn() } as any;
    const service = new AaliyahDeliveryRouterService(repository, emailService, createDiagnostics());

    const result = await service.send({
      tenantId,
      actorId,
      principalContext: 'founder',
      mode: 'founder',
      sourceType: 'notification',
      sourceId: 'notification:1',
      channel: 'console',
      generatedAt: '2026-03-17T09:00:00.000Z'
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.replayed).toBe(true);
    }
  });

  it('retries a failed delivery', async () => {
    const repository = createRepository();
    await repository.createDelivery({
      tenantId,
      deliveryId: 'delivery:failed',
      channel: 'email',
      sourceType: 'notification',
      sourceId: 'notification:1',
      deliveryStatus: 'failed',
      attemptCount: 1,
      lastError: 'smtp_down',
      idempotencyKey: 'delivery:email:notification:notification:1',
      metadata: {},
      createdAt: '2026-03-17T09:00:00.000Z',
      sentAt: null
    });
    const emailService = {
      sendSystemEmail: vi.fn(async () => ({
        providerMessageId: 'gmail:message:2',
        providerThreadId: 'gmail:thread:2',
        sentAt: '2026-03-17T09:05:00.000Z'
      }))
    } as any;
    const service = new AaliyahDeliveryRouterService(repository, emailService, createDiagnostics());

    const result = await service.retryDelivery({
      tenantId,
      actorId,
      principalContext: 'founder',
      mode: 'founder',
      deliveryId: 'delivery:failed',
      generatedAt: '2026-03-17T09:05:00.000Z'
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.delivery.deliveryStatus).toBe('sent');
      expect(result.delivery.attemptCount).toBe(2);
    }
  });
});
