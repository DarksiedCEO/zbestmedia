import { describe, expect, it, vi } from 'vitest';

import { AaliyahTimelineService } from '../src/aaliyah/timeline-service.js';

const tenantId = '11111111-1111-4111-8111-111111111111';
const actorId = 'actor-1';

function createRepository() {
  const events: any[] = [];
  return {
    listOperatorQueueRecords: vi.fn(async () => [
      {
        id: 'operator-queue:1',
        tenantId,
        sourceType: 'escalation',
        sourceId: 'escalation:1',
        queueItemType: 'immediate_action',
        priorityScore: 98,
        priorityBand: 'critical',
        status: 'executed',
        rankingVersion: 2,
        staleAfterAtIso: '2026-03-18T12:00:00.000Z',
        canonicalIssueKey: 'account:1|issue:retention_risk|command:create_follow_up',
        supersededByQueueItemId: null,
        title: 'Retention risk needs founder action',
        summary: 'A high-value account has reopened.',
        reason: 'Critical escalation remained active.',
        idempotencyKey: 'oq:1',
        relatedRecordIds: ['escalation:1'],
        relatedRecordTypes: ['escalation'],
        actionableCommandType: 'create_follow_up',
        actionableTargetType: 'account',
        actionableTargetId: 'account:1',
        auditEventId: 'diag:oq:1',
        metadata: { rankingVersion: 2 },
        createdAtIso: '2026-03-17T08:00:00.000Z',
        evaluatedAtIso: '2026-03-17T08:00:00.000Z',
        lastRefreshedAtIso: '2026-03-17T08:30:00.000Z',
        lastExecutedAtIso: '2026-03-17T09:00:00.000Z',
        issueState: 'reopened',
        lastOutcomeType: 'issue_reopened',
        lastOutcomeStatus: 'confirmed',
        lastOutcomeAtIso: '2026-03-17T10:00:00.000Z'
      }
    ]),
    listOperatorActionLogs: vi.fn(async () => [
      {
        id: 'operator-action:1',
        tenantId,
        queueItemId: 'operator-queue:1',
        queueItemVersion: 2,
        canonicalIssueKey: 'account:1|issue:retention_risk|command:create_follow_up',
        actionPath: 'create_follow_up:account:account:1',
        commandId: 'founder-command:1',
        founderActorId: actorId,
        idempotencyKey: 'oa:1',
        executionStatus: 'success',
        failureCode: null,
        failureReason: null,
        executedAtIso: '2026-03-17T09:00:00.000Z',
        createdAtIso: '2026-03-17T09:00:00.000Z'
      }
    ]),
    listOutcomeFeedback: vi.fn(async () => [
      {
        id: 'outcome:1',
        tenantId,
        queueItemId: 'operator-queue:1',
        operatorActionLogId: 'operator-action:1',
        commandId: 'founder-command:1',
        canonicalIssueKey: 'account:1|issue:retention_risk|command:create_follow_up',
        sourceType: 'escalation',
        sourceId: 'escalation:1',
        outcomeType: 'issue_reopened',
        outcomeStatus: 'confirmed',
        reasonCode: null,
        notes: 'Issue reopened after prior resolution.',
        reportedByFounderActorId: actorId,
        reportedAtIso: '2026-03-17T10:00:00.000Z',
        auditEventId: 'diag:outcome:1',
        metadata: {},
        idempotencyKey: 'outcome:1',
        createdAtIso: '2026-03-17T10:00:00.000Z'
      },
      {
        id: 'outcome:2',
        tenantId,
        queueItemId: 'operator-queue:1',
        operatorActionLogId: 'operator-action:1',
        commandId: 'founder-command:1',
        canonicalIssueKey: 'account:1|issue:retention_risk|command:create_follow_up',
        sourceType: 'opportunity',
        sourceId: 'opportunity:1',
        outcomeType: 'opportunity_converted',
        outcomeStatus: 'confirmed',
        reasonCode: null,
        notes: 'Follow-up reopened the account and then converted.',
        reportedByFounderActorId: actorId,
        reportedAtIso: '2026-03-17T11:00:00.000Z',
        auditEventId: 'diag:outcome:2',
        metadata: {},
        idempotencyKey: 'outcome:2',
        createdAtIso: '2026-03-17T11:00:00.000Z'
      }
    ]),
    listIssueStates: vi.fn(async () => [
      {
        tenantId,
        canonicalIssueKey: 'account:1|issue:retention_risk|command:create_follow_up',
        currentState: 'reopened',
        lastOutcomeType: 'issue_reopened',
        lastOutcomeStatus: 'confirmed',
        lastQueueItemId: 'operator-queue:1',
        lastOperatorActionLogId: 'operator-action:1',
        lastCommandId: 'founder-command:1',
        lastUpdatedAtIso: '2026-03-17T10:00:00.000Z',
        lastOutcomeAtIso: '2026-03-17T10:00:00.000Z',
        reopenCount: 1,
        resolutionCount: 1,
        metadata: {
          lastReasonCode: null,
          wasRecentlyRejected: false,
          wasRecentlyResolved: false,
          hasRepeatedFailure: false
        }
      }
    ]),
    listFounderBriefs: vi.fn(async () => [
      {
        id: 'founder-brief:1',
        tenantId,
        briefDate: '2026-03-17',
        briefKind: 'daily',
        generatedByFounderActorId: actorId,
        generatedAtIso: '2026-03-17T12:00:00.000Z',
        windowStartAtIso: '2026-03-16T12:00:00.000Z',
        windowEndAtIso: '2026-03-17T12:00:00.000Z',
        headline: '1 immediate action, 1 reopened issue, 1 conversion.',
        summary: {
          headline: '1 immediate action, 1 reopened issue, 1 conversion.',
          generatedAtIso: '2026-03-17T12:00:00.000Z',
          previousBriefId: null,
          counts: { immediateActions: 1, resolved: 0, reopenedOrPersisting: 1, opportunities: 1, watchlist: 0 },
          sectionOrder: ['immediate_founder_actions'],
          notes: []
        },
        idempotencyKey: 'brief:1',
        previousBriefId: null,
        deliveryStatus: 'not_sent',
        lastDispatchedAtIso: null,
        auditEventId: 'diag:brief:1',
        metadata: {},
        createdAtIso: '2026-03-17T12:00:00.000Z'
      }
    ]),
    listFounderBriefItems: vi.fn(async () => [
      {
        id: 'brief-item:1',
        tenantId,
        briefId: 'founder-brief:1',
        section: 'immediate_founder_actions',
        queueItemId: 'operator-queue:1',
        canonicalIssueKey: 'account:1|issue:retention_risk|command:create_follow_up',
        operatorActionLogId: 'operator-action:1',
        outcomeFeedbackId: 'outcome:1',
        priorityScore: 98,
        deltaType: 'reopened',
        payload: { title: 'Retention risk needs founder action' },
        createdAtIso: '2026-03-17T12:00:00.000Z'
      }
    ]),
    getTimelineEventByIdempotencyKey: vi.fn(async ({ idempotencyKey }: { idempotencyKey: string }) => events.find((event) => event.idempotencyKey === idempotencyKey) ?? null),
    createTimelineEvent: vi.fn(async (args: any) => {
      const event = {
        id: args.eventId,
        tenantId: args.tenantId,
        eventType: args.eventType,
        eventAtIso: args.eventAt,
        canonicalIssueKey: args.canonicalIssueKey,
        queueItemId: args.queueItemId,
        operatorActionLogId: args.operatorActionLogId,
        outcomeFeedbackId: args.outcomeFeedbackId,
        briefId: args.briefId,
        sourceType: args.sourceType,
        sourceId: args.sourceId,
        decisionClass: args.decisionClass,
        severity: args.severity,
        title: args.title,
        summary: args.summary,
        payload: args.payload,
        idempotencyKey: args.idempotencyKey,
        createdAtIso: args.createdAt
      };
      events.push(event);
      return event;
    }),
    listTimelineEvents: vi.fn(async ({ canonicalIssueKey, briefId, queueItemId }: any) => events.filter((event) => {
      if (canonicalIssueKey && event.canonicalIssueKey !== canonicalIssueKey) return false;
      if (briefId && event.briefId !== briefId) return false;
      if (queueItemId && event.queueItemId !== queueItemId) return false;
      return true;
    }).sort((a, b) => b.eventAtIso.localeCompare(a.eventAtIso))),
    getTimelineEventById: vi.fn(async ({ eventId }: { eventId: string }) => events.find((event) => event.id === eventId) ?? null)
  } as any;
}

describe('AaliyahTimelineService', () => {
  it('composes and lists timeline events from queue, outcomes, and briefs', async () => {
    const repository = createRepository();
    const service = new AaliyahTimelineService(repository);

    const result = await service.list({
      tenantId,
      actorId,
      principalContext: 'founder',
      mode: 'founder',
      filters: { limit: 20 }
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.generatedCount).toBeGreaterThan(0);
    expect(result.events.some((event) => event.eventType === 'queue_item_created')).toBe(true);
    expect(result.events.some((event) => event.eventType === 'issue_reopened')).toBe(true);
    expect(result.events.some((event) => event.eventType === 'opportunity_converted')).toBe(true);
    expect(result.events.some((event) => event.eventType === 'brief_generated')).toBe(true);
  });

  it('returns canonical issue history in ordered form', async () => {
    const repository = createRepository();
    const service = new AaliyahTimelineService(repository);

    const result = await service.listByIssueKey({
      tenantId,
      actorId,
      principalContext: 'founder',
      mode: 'founder',
      canonicalIssueKey: 'account:1|issue:retention_risk|command:create_follow_up',
      filters: { limit: 20 }
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.events.every((event) => event.canonicalIssueKey === 'account:1|issue:retention_risk|command:create_follow_up')).toBe(true);
    expect(result.events.map((event) => event.eventType)).toContain('queue_item_executed');
    expect(result.events.map((event) => event.eventType)).toContain('issue_reopened');
  });

  it('returns events linked to a founder brief', async () => {
    const repository = createRepository();
    const service = new AaliyahTimelineService(repository);

    const result = await service.listByBriefId({
      tenantId,
      actorId,
      principalContext: 'founder',
      mode: 'founder',
      briefId: 'founder-brief:1',
      filters: { limit: 20 }
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.events.length).toBeGreaterThan(0);
    expect(result.events.every((event) => event.briefId === 'founder-brief:1')).toBe(true);
  });

  it('rejects non-founder access', async () => {
    const repository = createRepository();
    const service = new AaliyahTimelineService(repository);

    const result = await service.list({
      tenantId,
      actorId,
      principalContext: 'operator',
      mode: 'founder',
      filters: { limit: 10 }
    });

    expect(result).toEqual({
      ok: false,
      denialCode: 'ACCESS_DENIED',
      errorCode: null,
      retryable: false,
      message: 'Founder timeline access is denied.'
    });
  });
});
