import { describe, expect, it, vi } from 'vitest';

import { AaliyahOperatorActionService } from '../src/aaliyah/operator-action-service.js';

const tenantId = '11111111-1111-4111-8111-111111111111';
const actorId = 'actor-1';

function createQueueItem(overrides: Record<string, unknown> = {}) {
  return {
    id: 'operator-queue:1',
    tenantId,
    sourceType: 'recommendation',
    sourceId: 'recommendation:1',
    queueItemType: 'immediate_action',
    priorityScore: 80,
    priorityBand: 'high',
    status: 'active',
    rankingVersion: 1,
    staleAfterAtIso: '2026-03-17T12:10:00.000Z',
    canonicalIssueKey: 'task:1|issue:follow_up_now|command:create_follow_up',
    supersededByQueueItemId: null,
    title: 'Follow up now',
    summary: 'The thread is still open.',
    reason: 'Contact needs a follow-up.',
    idempotencyKey: 'oq:recommendation:1',
    relatedRecordIds: ['task:1'],
    relatedRecordTypes: ['task'],
    actionableCommandType: 'create_follow_up',
    actionableTargetType: 'contact',
    actionableTargetId: 'contact:1',
    auditEventId: 'diag:oq:1',
    metadata: { clusterKey: 'task:1' },
    createdAtIso: '2026-03-17T12:00:00.000Z',
    evaluatedAtIso: '2026-03-17T12:00:00.000Z',
    lastRefreshedAtIso: null,
    lastExecutedAtIso: null,
    ...overrides
  } as any;
}

function createRepository(options?: {
  comparableMissing?: boolean;
  replayLog?: any;
  sibling?: any;
}) {
  const primary = createQueueItem();
  const sibling = options?.sibling ?? createQueueItem({
    id: 'operator-queue:2',
    priorityScore: 60,
    priorityBand: 'normal',
    idempotencyKey: 'oq:recommendation:2'
  });
  const queueItems = new Map<string, any>([
    [primary.id, primary],
    [sibling.id, sibling]
  ]);
  const actionLogs: any[] = options?.replayLog ? [options.replayLog] : [];

  const repository = {
    getOperatorActionLogByIdempotencyKey: vi.fn(async ({ idempotencyKey }: { idempotencyKey: string }) =>
      actionLogs.find((log) => log.idempotencyKey === idempotencyKey) ?? null
    ),
    getOperatorActionLogByQueueItemId: vi.fn(async ({ queueItemId }: { queueItemId: string }) =>
      actionLogs.find((log) => log.queueItemId === queueItemId && log.executionStatus === 'success') ?? null
    ),
    getOperatorQueueRecordById: vi.fn(async ({ queueItemId }: { queueItemId: string }) => queueItems.get(queueItemId) ?? null),
    updateOperatorQueueRecord: vi.fn(async ({ queueItemId, ...patch }: any) => {
      const existing = queueItems.get(queueItemId);
      if (!existing) throw new Error('operator_queue_item_not_found');
      const next = {
        ...existing,
        ...patch,
        evaluatedAtIso: patch.evaluatedAt ?? existing.evaluatedAtIso,
        staleAfterAtIso: patch.staleAfterAt ?? existing.staleAfterAtIso,
        lastRefreshedAtIso: patch.lastRefreshedAt ?? existing.lastRefreshedAtIso,
        lastExecutedAtIso: patch.lastExecutedAt ?? existing.lastExecutedAtIso
      };
      queueItems.set(queueItemId, next);
      return next;
    }),
    listOperatorQueueRecords: vi.fn(async ({ canonicalIssueKey, statuses }: any = {}) => {
      const values = Array.from(queueItems.values());
      return values.filter((item) => {
        if (canonicalIssueKey && item.canonicalIssueKey !== canonicalIssueKey) return false;
        if (statuses?.length && !statuses.includes(item.status)) return false;
        return true;
      });
    }),
    createOperatorActionLog: vi.fn(async (args: any) => {
      const log = {
        id: args.actionLogId,
        tenantId: args.tenantId,
        queueItemId: args.queueItemId,
        queueItemVersion: args.queueItemVersion,
        canonicalIssueKey: args.canonicalIssueKey,
        actionPath: args.actionPath,
        commandId: args.commandId,
        founderActorId: args.founderActorId,
        idempotencyKey: args.idempotencyKey,
        executionStatus: args.executionStatus,
        failureCode: args.failureCode,
        failureReason: args.failureReason,
        executedAtIso: args.executedAt,
        createdAtIso: args.executedAt
      };
      actionLogs.push(log);
      return log;
    }),
    listEscalations: vi.fn(async () => []),
    listCoalescedSignals: vi.fn(async () => []),
    listStrategicInsights: vi.fn(async () => []),
    listNotifications: vi.fn(async () => []),
    listRecommendations: vi.fn(async () =>
      options?.comparableMissing
        ? []
        : [
            {
              id: 'recommendation:1',
              tenantId,
              source: { sourceType: 'contact', sourceId: 'contact:1' },
              recommendationType: 'follow_up_now',
              status: 'active',
              reason: 'Contact needs a follow-up.',
              summary: 'The thread is still open.',
              idempotencyKey: 'rec:1',
              relatedCommandId: null,
              relatedTaskId: 'task:1',
              metadata: {},
              auditEventId: 'diag:rec:1',
              createdAtIso: '2026-03-17T12:00:00.000Z',
              evaluatedAtIso: '2026-03-17T12:00:00.000Z'
            }
          ]
    ),
    listOpportunities: vi.fn(async () => [])
  } as any;

  return { repository, queueItems, actionLogs };
}

function createFounderCommandService() {
  return {
    executeCommand: vi.fn(async () => ({
      ok: true,
      commandId: 'founder-command:1',
      commandType: 'create_follow_up',
      target: { targetType: 'contact', targetId: 'contact:1' },
      status: 'executed',
      summary: 'Created follow-up.',
      auditEventId: 'diag:command:1',
      executedAtIso: '2026-03-17T12:15:00.000Z'
    }))
  } as any;
}

function createDiagnostics() {
  return {
    recordEvent: vi.fn(async ({ eventType }: { eventType: string }) => ({ eventId: `diag:${eventType}` }))
  } as any;
}

describe('Aaliyah operator action service', () => {
  it('executes a refreshed actionable queue item once and suppresses weaker siblings', async () => {
    const { repository, queueItems, actionLogs } = createRepository();
    const founderCommandService = createFounderCommandService();
    const service = new AaliyahOperatorActionService(repository, founderCommandService, createDiagnostics());

    const result = await service.execute({
      tenantId,
      actorId,
      principalContext: 'founder',
      mode: 'founder',
      queueItemId: 'operator-queue:1',
      idempotencyKey: 'operator-action:execute:1',
      requestedAt: '2026-03-17T12:15:00.000Z'
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.result.executionStatus).toBe('success');
    expect(result.result.commandId).toBe('founder-command:1');
    expect(founderCommandService.executeCommand).toHaveBeenCalledTimes(1);
    expect(queueItems.get('operator-queue:1')?.status).toBe('executed');
    expect(queueItems.get('operator-queue:2')?.status).toBe('suppressed');
    expect(queueItems.get('operator-queue:2')?.supersededByQueueItemId).toBe('operator-queue:1');
    expect(actionLogs).toHaveLength(1);
    expect(actionLogs[0]?.executionStatus).toBe('success');
  });

  it('replays prior execution by idempotency key without issuing a second command', async () => {
    const replayLog = {
      id: 'operator-action:1',
      tenantId,
      queueItemId: 'operator-queue:1',
      queueItemVersion: 2,
      canonicalIssueKey: 'task:1|issue:follow_up_now|command:create_follow_up',
      actionPath: 'create_follow_up:contact:contact:1',
      commandId: 'founder-command:1',
      founderActorId: actorId,
      idempotencyKey: 'operator-action:execute:replay',
      executionStatus: 'success',
      failureCode: null,
      failureReason: null,
      executedAtIso: '2026-03-17T12:15:00.000Z',
      createdAtIso: '2026-03-17T12:15:00.000Z'
    };
    const { repository } = createRepository({ replayLog });
    const founderCommandService = createFounderCommandService();
    const service = new AaliyahOperatorActionService(repository, founderCommandService, createDiagnostics());

    const result = await service.execute({
      tenantId,
      actorId,
      principalContext: 'founder',
      mode: 'founder',
      queueItemId: 'operator-queue:1',
      idempotencyKey: 'operator-action:execute:replay',
      requestedAt: '2026-03-17T12:16:00.000Z'
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.result.executionStatus).toBe('success');
    expect(result.result.commandId).toBe('founder-command:1');
    expect(founderCommandService.executeCommand).not.toHaveBeenCalled();
  });

  it('invalidates execution when the source record no longer exists', async () => {
    const { repository, queueItems, actionLogs } = createRepository({ comparableMissing: true });
    const founderCommandService = createFounderCommandService();
    const service = new AaliyahOperatorActionService(repository, founderCommandService, createDiagnostics());

    const result = await service.execute({
      tenantId,
      actorId,
      principalContext: 'founder',
      mode: 'founder',
      queueItemId: 'operator-queue:1',
      idempotencyKey: 'operator-action:execute:missing-source',
      requestedAt: '2026-03-17T12:20:00.000Z'
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.result.executionStatus).toBe('invalidated');
    expect(founderCommandService.executeCommand).not.toHaveBeenCalled();
    expect(queueItems.get('operator-queue:1')?.status).toBe('invalidated');
    expect(actionLogs[0]?.failureCode).toBe('QUEUE_ITEM_INVALIDATED');
  });
});
