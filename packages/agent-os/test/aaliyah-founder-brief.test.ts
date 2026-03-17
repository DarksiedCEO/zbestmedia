import { describe, expect, it, vi } from 'vitest';

import { AaliyahFounderBriefService } from '../src/aaliyah/founder-brief-service.js';

const tenantId = '11111111-1111-4111-8111-111111111111';
const actorId = 'actor-1';

function createRepository(options?: {
  previousBrief?: any;
  previousItems?: any[];
  quiet?: boolean;
}) {
  const briefs: any[] = options?.previousBrief ? [options.previousBrief] : [];
  const briefItems = new Map<string, any[]>(options?.previousBrief ? [[options.previousBrief.id, options?.previousItems ?? []]] : []);

  return {
    listOperatorQueueRecords: vi.fn(async () => options?.quiet ? [] : [
      {
        id: 'operator-queue:1',
        tenantId,
        sourceType: 'escalation',
        sourceId: 'escalation:1',
        queueItemType: 'immediate_action',
        priorityScore: 100,
        priorityBand: 'critical',
        status: 'active',
        rankingVersion: 2,
        staleAfterAtIso: '2026-03-18T12:00:00.000Z',
        canonicalIssueKey: 'task:1|issue:stale_critical_escalation|command:escalate_task',
        supersededByQueueItemId: null,
        title: 'Critical escalation needs founder attention',
        summary: 'The issue is still active.',
        reason: 'Critical signal remained unresolved.',
        idempotencyKey: 'oq:1',
        relatedRecordIds: ['notification:1'],
        relatedRecordTypes: ['notification'],
        actionableCommandType: 'escalate_task',
        actionableTargetType: 'task',
        actionableTargetId: 'task:1',
        auditEventId: 'diag:oq:1',
        metadata: { severity: 'critical' },
        createdAtIso: '2026-03-17T12:00:00.000Z',
        evaluatedAtIso: '2026-03-17T12:00:00.000Z',
        lastRefreshedAtIso: null,
        lastExecutedAtIso: null,
        issueState: 'reopened',
        lastOutcomeType: 'issue_reopened',
        lastOutcomeStatus: 'confirmed',
        lastOutcomeAtIso: '2026-03-17T11:00:00.000Z'
      },
      {
        id: 'operator-queue:2',
        tenantId,
        sourceType: 'opportunity',
        sourceId: 'opportunity:1',
        queueItemType: 'watch_item',
        priorityScore: 60,
        priorityBand: 'high',
        status: 'active',
        rankingVersion: 1,
        staleAfterAtIso: '2026-03-18T12:00:00.000Z',
        canonicalIssueKey: 'contact:1|issue:dormant_contact|command:create_follow_up',
        supersededByQueueItemId: null,
        title: 'Dormant contact worth reviving',
        summary: 'A high-value relationship has gone quiet.',
        reason: 'No recent outreach.',
        idempotencyKey: 'oq:2',
        relatedRecordIds: ['opportunity:1'],
        relatedRecordTypes: ['opportunity'],
        actionableCommandType: 'create_follow_up',
        actionableTargetType: 'contact',
        actionableTargetId: 'contact:1',
        auditEventId: 'diag:oq:2',
        metadata: {},
        createdAtIso: '2026-03-17T10:00:00.000Z',
        evaluatedAtIso: '2026-03-17T10:00:00.000Z',
        lastRefreshedAtIso: null,
        lastExecutedAtIso: null,
        issueState: 'open',
        lastOutcomeType: null,
        lastOutcomeStatus: null,
        lastOutcomeAtIso: null
      }
    ]),
    listOperatorActionLogs: vi.fn(async () => options?.quiet ? [] : [
      {
        id: 'operator-action:1',
        tenantId,
        queueItemId: 'operator-queue:1',
        queueItemVersion: 2,
        canonicalIssueKey: 'task:1|issue:stale_critical_escalation|command:escalate_task',
        actionPath: 'escalate_task:task:task:1',
        commandId: 'founder-command:1',
        founderActorId: actorId,
        idempotencyKey: 'oa:1',
        executionStatus: 'success',
        failureCode: null,
        failureReason: null,
        executedAtIso: '2026-03-17T11:30:00.000Z',
        createdAtIso: '2026-03-17T11:30:00.000Z'
      }
    ]),
    listOutcomeFeedback: vi.fn(async () => options?.quiet ? [] : [
      {
        id: 'outcome:1',
        tenantId,
        queueItemId: 'operator-queue:3',
        operatorActionLogId: 'operator-action:3',
        commandId: 'founder-command:3',
        canonicalIssueKey: 'task:3|issue:follow_up_gap|command:create_follow_up',
        sourceType: 'notification',
        sourceId: 'notification:3',
        outcomeType: 'issue_resolved',
        outcomeStatus: 'confirmed',
        reasonCode: null,
        notes: 'Closed cleanly.',
        reportedByFounderActorId: actorId,
        reportedAtIso: '2026-03-17T11:45:00.000Z',
        auditEventId: 'diag:outcome:1',
        metadata: {},
        idempotencyKey: 'outcome:1',
        createdAtIso: '2026-03-17T11:45:00.000Z'
      }
    ]),
    listIssueStates: vi.fn(async () => options?.quiet ? [] : [
      {
        tenantId,
        canonicalIssueKey: 'task:1|issue:stale_critical_escalation|command:escalate_task',
        currentState: 'reopened',
        lastOutcomeType: 'issue_reopened',
        lastOutcomeStatus: 'confirmed',
        lastQueueItemId: 'operator-queue:1',
        lastOperatorActionLogId: 'operator-action:1',
        lastCommandId: 'founder-command:1',
        lastUpdatedAtIso: '2026-03-17T11:00:00.000Z',
        lastOutcomeAtIso: '2026-03-17T11:00:00.000Z',
        reopenCount: 1,
        resolutionCount: 0,
        metadata: {
          lastReasonCode: null,
          wasRecentlyRejected: false,
          wasRecentlyResolved: false,
          hasRepeatedFailure: true
        }
      },
      {
        tenantId,
        canonicalIssueKey: 'task:3|issue:follow_up_gap|command:create_follow_up',
        currentState: 'resolved',
        lastOutcomeType: 'issue_resolved',
        lastOutcomeStatus: 'confirmed',
        lastQueueItemId: 'operator-queue:3',
        lastOperatorActionLogId: 'operator-action:3',
        lastCommandId: 'founder-command:3',
        lastUpdatedAtIso: '2026-03-17T11:45:00.000Z',
        lastOutcomeAtIso: '2026-03-17T11:45:00.000Z',
        reopenCount: 0,
        resolutionCount: 1,
        metadata: {
          lastReasonCode: null,
          wasRecentlyRejected: false,
          wasRecentlyResolved: true,
          hasRepeatedFailure: false
        }
      }
    ]),
    listStrategicInsights: vi.fn(async () => options?.quiet ? [] : [
      {
        id: 'insight:1',
        tenantId,
        insightType: 'blocked_pattern',
        status: 'active',
        title: 'Blocked pattern still needs review',
        summary: 'A repeated stall is clustering.',
        reason: 'Same issue class reopened.',
        idempotencyKey: 'si:1',
        relatedEntityIds: ['task:1'],
        relatedRecordIds: ['operator-queue:1'],
        auditEventId: 'diag:si:1',
        metadata: {},
        createdAtIso: '2026-03-17T09:00:00.000Z',
        evaluatedAtIso: '2026-03-17T09:00:00.000Z',
        acknowledgedAtIso: null,
        dismissedAtIso: null
      }
    ]),
    listOpportunities: vi.fn(async () => options?.quiet ? [] : [
      {
        id: 'opportunity:1',
        tenantId,
        source: { sourceType: 'contact', sourceId: 'contact:1' },
        opportunityType: 'dormant_contact',
        status: 'active',
        reason: 'No recent contact.',
        summary: 'Dormant contact worth reviving.',
        idempotencyKey: 'opp:1',
        relatedTaskId: null,
        relatedRecommendationId: null,
        auditEventId: 'diag:opp:1',
        metadata: {},
        createdAtIso: '2026-03-17T10:00:00.000Z',
        evaluatedAtIso: '2026-03-17T10:00:00.000Z',
        acknowledgedAtIso: null,
        dismissedAtIso: null
      }
    ]),
    listRecommendations: vi.fn(async () => []),
    listNotifications: vi.fn(async () => []),
    getLatestFounderBrief: vi.fn(async () => options?.previousBrief ?? null),
    listFounderBriefItems: vi.fn(async ({ briefId }: { briefId: string }) => briefItems.get(briefId) ?? []),
    getFounderBriefByIdempotencyKey: vi.fn(async ({ idempotencyKey }: { idempotencyKey: string }) => briefs.find((item) => item.idempotencyKey === idempotencyKey) ?? null),
    createFounderBrief: vi.fn(async (args: any) => {
      const brief = {
        id: args.briefId,
        tenantId: args.tenantId,
        briefDate: args.briefDate,
        briefKind: args.briefKind,
        generatedByFounderActorId: args.generatedByFounderActorId,
        generatedAtIso: args.generatedAt,
        windowStartAtIso: args.windowStartAt,
        windowEndAtIso: args.windowEndAt,
        headline: args.headline,
        summary: args.summary,
        idempotencyKey: args.idempotencyKey,
        previousBriefId: args.previousBriefId,
        deliveryStatus: args.deliveryStatus,
        lastDispatchedAtIso: args.lastDispatchedAt,
        auditEventId: args.auditEventId,
        metadata: args.metadata,
        createdAtIso: args.createdAt
      };
      briefs.push(brief);
      return brief;
    }),
    createFounderBriefItem: vi.fn(async (args: any) => {
      const item = {
        id: args.briefItemId,
        tenantId: args.tenantId,
        briefId: args.briefId,
        section: args.section,
        queueItemId: args.queueItemId,
        canonicalIssueKey: args.canonicalIssueKey,
        operatorActionLogId: args.operatorActionLogId,
        outcomeFeedbackId: args.outcomeFeedbackId,
        priorityScore: args.priorityScore,
        deltaType: args.deltaType,
        payload: args.payload,
        createdAtIso: args.createdAt
      };
      const items = briefItems.get(args.briefId) ?? [];
      items.push(item);
      briefItems.set(args.briefId, items);
      return item;
    }),
    getFounderBriefById: vi.fn(async ({ briefId }: { briefId: string }) => briefs.find((item) => item.id === briefId) ?? null),
    listFounderBriefs: vi.fn(async () => briefs)
  } as any;
}

function createPreferencesResolver() {
  return {
    resolve: vi.fn(async () => ({
      id: 'prefs:1',
      tenantId,
      actorUserId: actorId,
      notification: { minimumConsoleSeverity: 'warning', minimumEmailSeverity: 'critical', autoDismissInfoAfterHours: null },
      digest: { dailyDigestEnabled: true, weeklyBriefEnabled: true, criticalDigestEnabled: true, sendEmptyDigests: false },
      opportunity: { dormantContactDays: 14, missedFollowUpWindowHours: 48, recurringBlockThreshold: 3, engagementSpikeMinimumEvents: 2 },
      recommendation: { escalateHighPriorityOnly: true, reviveContactRequiresPriorValue: true },
      scheduler: { allowAutomaticRuns: true, defaultDailyRunHourUtc: 16 },
      delivery: { emailEnabled: true, consoleEnabled: true },
      escalation: { criticalEscalationHours: 24, blockedPatternEscalationCount: 3, clusterPressureThreshold: 3, missedFollowUpEscalationHours: 72, attentionOverloadThreshold: 5 },
      createdAtIso: '2026-03-16T12:00:00.000Z',
      updatedAtIso: '2026-03-16T12:00:00.000Z'
    }))
  } as any;
}

function createDiagnostics() {
  return {
    recordEvent: vi.fn(async ({ eventType }: { eventType: string }) => ({ eventId: `diag:${eventType}` }))
  } as any;
}

describe('Aaliyah founder brief service', () => {
  it('generates a brief with action, resolved, reopened, opportunity, and watch sections', async () => {
    const repository = createRepository();
    const service = new AaliyahFounderBriefService(repository, createDiagnostics(), createPreferencesResolver());

    const result = await service.generate({
      tenantId,
      actorId,
      principalContext: 'founder',
      mode: 'founder',
      generatedAt: '2026-03-17T12:00:00.000Z'
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.brief.headline).toContain('immediate action');
    expect(result.items.some((item) => item.section === 'immediate_founder_actions')).toBe(true);
    expect(result.items.some((item) => item.section === 'newly_resolved')).toBe(true);
    expect(result.items.some((item) => item.section === 'reopened_or_persisting')).toBe(true);
    expect(result.items.some((item) => item.section === 'high_value_opportunities')).toBe(true);
    expect(result.items.some((item) => item.section === 'strategic_watchlist')).toBe(true);
  });

  it('uses previous brief state to mark unchanged and reopened deltas', async () => {
    const previousBrief = {
      id: 'founder-brief:previous',
      tenantId,
      briefDate: '2026-03-16',
      briefKind: 'daily',
      generatedByFounderActorId: actorId,
      generatedAtIso: '2026-03-16T12:00:00.000Z',
      windowStartAtIso: '2026-03-15T12:00:00.000Z',
      windowEndAtIso: '2026-03-16T12:00:00.000Z',
      headline: 'Yesterday',
      summary: { headline: 'Yesterday', generatedAtIso: '2026-03-16T12:00:00.000Z', previousBriefId: null, counts: { immediateActions: 1, resolved: 0, reopenedOrPersisting: 0, opportunities: 0, watchlist: 0 }, sectionOrder: [], notes: [] },
      idempotencyKey: 'brief:previous',
      previousBriefId: null,
      deliveryStatus: 'not_sent',
      lastDispatchedAtIso: null,
      auditEventId: null,
      metadata: {},
      createdAtIso: '2026-03-16T12:00:00.000Z'
    };
    const previousItems = [
      {
        id: 'brief-item:1',
        tenantId,
        briefId: previousBrief.id,
        section: 'immediate_founder_actions',
        queueItemId: 'operator-queue:1',
        canonicalIssueKey: 'task:1|issue:stale_critical_escalation|command:escalate_task',
        operatorActionLogId: null,
        outcomeFeedbackId: null,
        priorityScore: 95,
        deltaType: 'new',
        payload: {},
        createdAtIso: '2026-03-16T12:00:00.000Z'
      }
    ];
    const repository = createRepository({ previousBrief, previousItems });
    const service = new AaliyahFounderBriefService(repository, createDiagnostics(), createPreferencesResolver());

    const result = await service.generate({
      tenantId,
      actorId,
      principalContext: 'founder',
      mode: 'founder',
      generatedAt: '2026-03-17T12:00:00.000Z'
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const immediate = result.items.find((item) => item.section === 'immediate_founder_actions');
    expect(immediate?.deltaType).toBe('reopened');
  });

  it('generates a truthful quiet-day brief', async () => {
    const repository = createRepository({ quiet: true });
    const service = new AaliyahFounderBriefService(repository, createDiagnostics(), createPreferencesResolver());

    const result = await service.generate({
      tenantId,
      actorId,
      principalContext: 'founder',
      mode: 'founder',
      generatedAt: '2026-03-17T12:00:00.000Z'
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.items.some((item) => item.section === 'immediate_founder_actions')).toBe(false);
    expect(result.brief.summary.notes[0]).toContain('No immediate founder actions');
  });

  it('denies non-founder callers', async () => {
    const repository = createRepository();
    const service = new AaliyahFounderBriefService(repository, createDiagnostics(), createPreferencesResolver());

    const result = await service.generate({
      tenantId,
      actorId,
      principalContext: 'operator',
      mode: 'founder',
      generatedAt: '2026-03-17T12:00:00.000Z'
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.denialCode).toBe('ACCESS_DENIED');
  });
});
