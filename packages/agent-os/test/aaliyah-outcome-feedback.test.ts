import { describe, expect, it, vi } from 'vitest';

import { AaliyahOutcomeFeedbackService } from '../src/aaliyah/outcome-feedback-service.js';

const tenantId = '11111111-1111-4111-8111-111111111111';
const actorId = 'actor-1';
const canonicalIssueKey = 'task:1|issue:stale_critical_escalation|command:none';

function createRepository(options?: {
  actionExecutionStatus?: string;
  queueItemIdMismatch?: boolean;
  priorIssueState?: any;
  replayOutcome?: any;
}) {
  const queueItem = {
    id: 'operator-queue:1',
    tenantId,
    sourceType: 'escalation',
    sourceId: 'escalation:1',
    queueItemType: 'immediate_action',
    priorityScore: 100,
    priorityBand: 'critical',
    status: 'executed',
    rankingVersion: 2,
    staleAfterAtIso: '2026-03-17T13:30:00.000Z',
    canonicalIssueKey,
    supersededByQueueItemId: null,
    title: 'Critical issue crossed the escalation line',
    summary: 'Critical stale work has remained active too long.',
    reason: 'Critical notification remained unresolved past threshold.',
    idempotencyKey: 'oq:1',
    relatedRecordIds: ['notification:1'],
    relatedRecordTypes: ['notification'],
    actionableCommandType: 'escalate_task',
    actionableTargetType: 'task',
    actionableTargetId: 'task:1',
    auditEventId: 'diag:oq:1',
    metadata: {},
    createdAtIso: '2026-03-17T13:10:00.000Z',
    evaluatedAtIso: '2026-03-17T13:10:00.000Z',
    lastRefreshedAtIso: '2026-03-17T13:15:00.000Z',
    lastExecutedAtIso: '2026-03-17T13:20:00.000Z',
    issueState: options?.priorIssueState?.currentState ?? null,
    lastOutcomeType: options?.priorIssueState?.lastOutcomeType ?? null,
    lastOutcomeStatus: options?.priorIssueState?.lastOutcomeStatus ?? null,
    lastOutcomeAtIso: options?.priorIssueState?.lastOutcomeAtIso ?? null
  } as any;

  const actionLog = {
    id: 'operator-action:1',
    tenantId,
    queueItemId: options?.queueItemIdMismatch ? 'operator-queue:other' : 'operator-queue:1',
    queueItemVersion: 2,
    canonicalIssueKey,
    actionPath: 'escalate_task:task:task:1',
    commandId: 'founder-command:1',
    founderActorId: actorId,
    idempotencyKey: 'operator-action:1',
    executionStatus: options?.actionExecutionStatus ?? 'success',
    failureCode: null,
    failureReason: null,
    executedAtIso: '2026-03-17T13:20:00.000Z',
    createdAtIso: '2026-03-17T13:20:00.000Z'
  } as any;

  const founderCommand = {
    id: 'founder-command:1',
    tenantId,
    requestId: 'request:1',
    actorUserId: actorId,
    actorRole: 'founder',
    commandType: 'escalate_task',
    targetType: 'task',
    targetId: 'task:1',
    payload: {},
    idempotencyKey: 'fcmd:1',
    executionStatus: 'executed',
    summary: 'Escalated task.',
    auditEventId: 'diag:fcmd:1',
    metadata: {},
    createdAt: '2026-03-17T13:20:00.000Z',
    executedAt: '2026-03-17T13:20:00.000Z'
  } as any;

  const outcomeRecords: any[] = options?.replayOutcome ? [options.replayOutcome] : [];
  let issueState = options?.priorIssueState ?? null;
  const updatedQueueItems: any[] = [];

  const repository = {
    getOutcomeFeedbackByIdempotencyKey: vi.fn(async ({ idempotencyKey }: { idempotencyKey: string }) =>
      outcomeRecords.find((record) => record.idempotencyKey === idempotencyKey) ?? null
    ),
    createOutcomeFeedback: vi.fn(async (args: any) => {
      const record = {
        id: args.outcomeId,
        tenantId: args.tenantId,
        queueItemId: args.queueItemId,
        operatorActionLogId: args.operatorActionLogId,
        commandId: args.commandId,
        canonicalIssueKey: args.canonicalIssueKey,
        sourceType: args.sourceType,
        sourceId: args.sourceId,
        outcomeType: args.outcomeType,
        outcomeStatus: args.outcomeStatus,
        reasonCode: args.reasonCode,
        notes: args.notes,
        reportedByFounderActorId: args.reportedByFounderActorId,
        reportedAtIso: args.reportedAt,
        auditEventId: args.auditEventId,
        metadata: args.metadata ?? {},
        idempotencyKey: args.idempotencyKey,
        createdAtIso: args.createdAt
      };
      outcomeRecords.push(record);
      return record;
    }),
    getOutcomeFeedbackById: vi.fn(async ({ outcomeId }: { outcomeId: string }) =>
      outcomeRecords.find((record) => record.id === outcomeId) ?? null
    ),
    listOutcomeFeedbackByCanonicalIssueKey: vi.fn(async () => outcomeRecords),
    listOutcomeFeedbackByQueueItemId: vi.fn(async () => outcomeRecords),
    getOperatorQueueRecordById: vi.fn(async () => queueItem),
    getOperatorActionLogById: vi.fn(async () => actionLog),
    getFounderCommandById: vi.fn(async () => founderCommand),
    getIssueStateByCanonicalIssueKey: vi.fn(async () => issueState),
    upsertIssueState: vi.fn(async (args: any) => {
      issueState = {
        tenantId: args.tenantId,
        canonicalIssueKey: args.canonicalIssueKey,
        currentState: args.currentState,
        lastOutcomeType: args.lastOutcomeType,
        lastOutcomeStatus: args.lastOutcomeStatus,
        lastQueueItemId: args.lastQueueItemId,
        lastOperatorActionLogId: args.lastOperatorActionLogId,
        lastCommandId: args.lastCommandId,
        lastUpdatedAtIso: args.lastUpdatedAt,
        lastOutcomeAtIso: args.lastOutcomeAt,
        reopenCount: args.reopenCount,
        resolutionCount: args.resolutionCount,
        metadata: args.metadata
      };
      return issueState;
    }),
    listOperatorQueueRecords: vi.fn(async () => [queueItem]),
    updateOperatorQueueRecord: vi.fn(async (args: any) => {
      const updated = {
        ...queueItem,
        issueState: args.issueState ?? queueItem.issueState,
        lastOutcomeType: args.lastOutcomeType ?? queueItem.lastOutcomeType,
        lastOutcomeStatus: args.lastOutcomeStatus ?? queueItem.lastOutcomeStatus,
        lastOutcomeAtIso: args.lastOutcomeAt ?? queueItem.lastOutcomeAtIso
      };
      updatedQueueItems.push(updated);
      return updated;
    })
  } as any;

  return { repository, updatedQueueItems, outcomeRecords, getIssueState: () => issueState };
}

function createDiagnostics() {
  return {
    recordEvent: vi.fn(async ({ eventType }: { eventType: string }) => ({ eventId: `diag:${eventType}` }))
  } as any;
}

describe('Aaliyah outcome feedback service', () => {
  it('records a resolved outcome and updates issue state', async () => {
    const { repository, getIssueState, updatedQueueItems } = createRepository();
    const service = new AaliyahOutcomeFeedbackService(repository, createDiagnostics());

    const result = await service.record({
      tenantId,
      actorId,
      principalContext: 'founder',
      mode: 'founder',
      request: {
        queueItemId: 'operator-queue:1',
        operatorActionLogId: 'operator-action:1',
        outcomeType: 'issue_resolved',
        outcomeStatus: 'confirmed',
        reasonCode: 'founder_confirmed_resolution',
        idempotencyKey: 'outcome-feedback:1',
        reportedAtIso: '2026-03-17T13:40:00.000Z'
      }
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.issueState.currentState).toBe('resolved');
    expect(result.issueState.resolutionCount).toBe(1);
    expect(getIssueState()?.currentState).toBe('resolved');
    expect(updatedQueueItems[0]?.issueState).toBe('resolved');
  });

  it('records an unresolved outcome without fake resolution', async () => {
    const { repository, getIssueState } = createRepository();
    const service = new AaliyahOutcomeFeedbackService(repository, createDiagnostics());

    const result = await service.record({
      tenantId,
      actorId,
      principalContext: 'founder',
      mode: 'founder',
      request: {
        queueItemId: 'operator-queue:1',
        operatorActionLogId: 'operator-action:1',
        outcomeType: 'issue_unresolved',
        outcomeStatus: 'needs_follow_through',
        idempotencyKey: 'outcome-feedback:2',
        reportedAtIso: '2026-03-17T13:45:00.000Z'
      }
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.issueState.currentState).toBe('unresolved');
    expect(getIssueState()?.resolutionCount).toBe(0);
  });

  it('increments reopen count when a resolved issue is reopened', async () => {
    const priorIssueState = {
      tenantId,
      canonicalIssueKey,
      currentState: 'resolved',
      lastOutcomeType: 'issue_resolved',
      lastOutcomeStatus: 'confirmed',
      lastQueueItemId: 'operator-queue:1',
      lastOperatorActionLogId: 'operator-action:1',
      lastCommandId: 'founder-command:1',
      lastUpdatedAtIso: '2026-03-17T13:40:00.000Z',
      lastOutcomeAtIso: '2026-03-17T13:40:00.000Z',
      reopenCount: 0,
      resolutionCount: 1,
      metadata: {
        lastReasonCode: 'founder_confirmed_resolution',
        wasRecentlyRejected: false,
        wasRecentlyResolved: true,
        hasRepeatedFailure: false
      }
    };
    const { repository } = createRepository({ priorIssueState });
    const service = new AaliyahOutcomeFeedbackService(repository, createDiagnostics());

    const result = await service.record({
      tenantId,
      actorId,
      principalContext: 'founder',
      mode: 'founder',
      request: {
        queueItemId: 'operator-queue:1',
        operatorActionLogId: 'operator-action:1',
        outcomeType: 'issue_reopened',
        outcomeStatus: 'confirmed',
        idempotencyKey: 'outcome-feedback:3',
        reportedAtIso: '2026-03-17T14:00:00.000Z'
      }
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.issueState.currentState).toBe('reopened');
    expect(result.issueState.reopenCount).toBe(1);
  });

  it('rejects lineage mismatch between queue item and action log', async () => {
    const { repository } = createRepository({ queueItemIdMismatch: true });
    const service = new AaliyahOutcomeFeedbackService(repository, createDiagnostics());

    const result = await service.record({
      tenantId,
      actorId,
      principalContext: 'founder',
      mode: 'founder',
      request: {
        queueItemId: 'operator-queue:1',
        operatorActionLogId: 'operator-action:1',
        outcomeType: 'issue_resolved',
        outcomeStatus: 'confirmed',
        idempotencyKey: 'outcome-feedback:4',
        reportedAtIso: '2026-03-17T14:10:00.000Z'
      }
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errorCode).toBe('CONFLICT');
  });
});
