import { describe, expect, it, vi } from 'vitest';

import { AaliyahDigestComposerService } from '../src/aaliyah/digest-composer-service.js';

const tenantId = '11111111-1111-4111-8111-111111111111';
const actorId = 'actor-1';

function createRepository() {
  const digests = new Map<string, any>();
  const byId = new Map<string, any>();
  return {
    listStrategicInsights: vi.fn(async () => [{ id: 'strategic-insight:1', insightType: 'attention_priority', title: 'Attention priority', summary: 'Three items need attention.', reason: 'Critical work and opportunities are clustering.', status: 'active' }]),
    listNotifications: vi.fn(async () => [{ id: 'notification:1', notificationType: 'stale_critical_work', severity: 'critical', title: 'Critical task has gone stale', summary: 'A critical task needs founder attention.', reason: 'The task is overdue.', status: 'active' }]),
    listOpportunities: vi.fn(async () => [{ id: 'opportunity:1', opportunityType: 'dormant_contact', summary: 'A dormant contact is worth reviving.', reason: 'Prior engagement exists with no active follow-up.', status: 'active' }]),
    listRecommendations: vi.fn(async () => [{ id: 'recommendation:1', recommendationType: 'follow_up_now', summary: 'Follow up now with the account.', reason: 'The account is warm and unresolved.', status: 'active' }]),
    listFollowThroughEngineRecords: vi.fn(async () => [{ id: 'follow-through:1', decisionType: 'create_task', status: 'eligible', summary: 'Created a next-step task.', reason: 'Approved draft needs follow-through.' }]),
    getDigestByIdempotencyKey: vi.fn(async ({ idempotencyKey }: any) => digests.get(idempotencyKey) ?? null),
    createDigest: vi.fn(async (args: any) => {
      const digest = {
        id: args.digestId,
        tenantId: args.tenantId,
        digestType: args.digestType,
        digestStatus: args.digestStatus,
        title: args.title,
        summary: args.summary,
        bodyText: args.bodyText,
        idempotencyKey: args.idempotencyKey,
        relatedNotificationIds: args.relatedNotificationIds,
        relatedOpportunityIds: args.relatedOpportunityIds,
        relatedInsightIds: args.relatedInsightIds,
        relatedRecommendationIds: args.relatedRecommendationIds,
        relatedFollowThroughIds: args.relatedFollowThroughIds,
        deliveryRecordIds: args.deliveryRecordIds,
        auditEventId: args.auditEventId,
        metadata: args.metadata ?? {},
        createdAtIso: args.createdAt,
        composedAtIso: args.composedAt,
        sentAtIso: args.sentAt ?? null
      };
      digests.set(args.idempotencyKey, digest);
      byId.set(args.digestId, digest);
      return digest;
    }),
    getDigestById: vi.fn(async ({ digestId }: any) => byId.get(digestId) ?? null),
    updateDigestAfterSend: vi.fn(async (args: any) => {
      const existing = byId.get(args.digestId);
      const digest = {
        ...existing,
        digestStatus: args.digestStatus,
        deliveryRecordIds: args.deliveryRecordIds,
        auditEventId: args.auditEventId,
        sentAtIso: args.sentAt ?? existing.sentAtIso
      };
      byId.set(args.digestId, digest);
      digests.set(digest.idempotencyKey, digest);
      return digest;
    }),
    listDigests: vi.fn(async () => [...byId.values()])
  } as any;
}

function createDiagnostics() {
  return {
    recordEvent: vi.fn(async () => ({ eventId: 'diag:digest:1' }))
  } as any;
}

describe('Aaliyah digest composer service', () => {
  it('composes a founder digest from current ledgers', async () => {
    const repository = createRepository();
    const deliveryRouter = { send: vi.fn() } as any;
    const service = new AaliyahDigestComposerService(repository, deliveryRouter, createDiagnostics());

    const result = await service.compose({
      tenantId,
      actorId,
      principalContext: 'founder',
      mode: 'founder',
      digestType: 'daily_founder_digest',
      generatedAt: '2026-03-17T09:00:00.000Z'
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.digest.digestType).toBe('daily_founder_digest');
      expect(result.digest.digestStatus).toBe('composed');
      expect(result.digest.bodyText).toContain('Top priorities');
    }
  });

  it('replays an existing digest composition window', async () => {
    const repository = createRepository();
    const deliveryRouter = { send: vi.fn() } as any;
    const service = new AaliyahDigestComposerService(repository, deliveryRouter, createDiagnostics());

    const first = await service.compose({
      tenantId,
      actorId,
      principalContext: 'founder',
      mode: 'founder',
      digestType: 'daily_founder_digest',
      generatedAt: '2026-03-17T09:00:00.000Z'
    });
    expect(first.ok).toBe(true);

    const second = await service.compose({
      tenantId,
      actorId,
      principalContext: 'founder',
      mode: 'founder',
      digestType: 'daily_founder_digest',
      generatedAt: '2026-03-17T09:00:00.000Z'
    });

    expect(second.ok).toBe(true);
    if (second.ok) {
      expect(second.replayed).toBe(true);
    }
  });

  it('sends a composed digest through the delivery router', async () => {
    const repository = createRepository();
    const deliveryRouter = {
      send: vi.fn(async () => ({
        ok: true,
        delivery: {
          id: 'delivery:1',
          tenantId,
          channel: 'email',
          sourceType: 'digest',
          sourceId: 'digest:1',
          deliveryStatus: 'sent',
          attemptCount: 1,
          lastError: null,
          idempotencyKey: 'delivery:email:digest:digest:1',
          metadata: {},
          createdAtIso: '2026-03-17T09:05:00.000Z',
          sentAtIso: '2026-03-17T09:05:00.000Z'
        },
        replayed: false,
        message: 'Sent delivery.'
      }))
    } as any;
    const service = new AaliyahDigestComposerService(repository, deliveryRouter, createDiagnostics());
    const composed = await service.compose({
      tenantId,
      actorId,
      principalContext: 'founder',
      mode: 'founder',
      digestType: 'daily_founder_digest',
      generatedAt: '2026-03-17T09:00:00.000Z'
    });
    expect(composed.ok).toBe(true);
    if (!composed.ok) return;

    const sent = await service.send({
      tenantId,
      actorId,
      principalContext: 'founder',
      mode: 'founder',
      digestId: composed.digest.id,
      generatedAt: '2026-03-17T09:05:00.000Z'
    });

    expect(sent.ok).toBe(true);
    if (sent.ok) {
      expect(sent.digest.digestStatus).toBe('sent');
      expect(sent.digest.deliveryRecordIds).toEqual(['delivery:1']);
    }
  });

  it('skips digest composition when nothing qualifies', async () => {
    const repository = createRepository();
    repository.listStrategicInsights.mockResolvedValueOnce([]);
    repository.listNotifications.mockResolvedValueOnce([]);
    repository.listOpportunities.mockResolvedValueOnce([]);
    repository.listRecommendations.mockResolvedValueOnce([]);
    repository.listFollowThroughEngineRecords.mockResolvedValueOnce([]);
    const deliveryRouter = { send: vi.fn() } as any;
    const service = new AaliyahDigestComposerService(repository, deliveryRouter, createDiagnostics());

    const result = await service.compose({
      tenantId,
      actorId,
      principalContext: 'founder',
      mode: 'founder',
      digestType: 'daily_founder_digest',
      generatedAt: '2026-03-17T09:00:00.000Z'
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.digest.digestStatus).toBe('skipped');
    }
  });
});
