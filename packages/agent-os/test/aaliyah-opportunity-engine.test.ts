import { describe, expect, it, vi } from 'vitest';

import { AaliyahOpportunityEngineService } from '../src/aaliyah/opportunity-engine-service.js';

const tenantId = '11111111-1111-4111-8111-111111111111';
const actorId = 'actor-1';

function createRepository() {
  const contact = {
    id: 'crm-contact:1',
    tenantId,
    principalId: actorId,
    email: 'john@acme.com',
    firstName: 'John',
    lastName: 'Smith',
    accountId: 'crm-account:1',
    roleTitle: null,
    phone: null,
    status: 'active' as const,
    relationshipStage: 'follow_up' as const,
    lastTouchedAt: '2026-02-01T10:00:00.000Z',
    nextActionAt: null,
    notesSummary: null,
    createdAt: '2026-01-01T10:00:00.000Z',
    updatedAt: '2026-03-16T18:00:00.000Z'
  };
  const account = {
    id: 'crm-account:1',
    tenantId,
    name: 'ACME',
    website: null,
    industry: null,
    status: 'active' as const,
    notesSummary: null,
    createdAt: '2026-01-01T10:00:00.000Z',
    updatedAt: '2026-03-16T18:00:00.000Z'
  };
  const task = {
    id: 'task:1',
    tenantId,
    principalId: actorId,
    title: 'Meeting recap',
    description: null,
    status: 'open' as const,
    priority: 'high' as const,
    source: 'calendar_follow_up' as const,
    contactId: contact.id,
    accountId: account.id,
    relatedEmailDraftId: null,
    relatedCalendarEventId: 'cal:event:1',
    dueAt: '2026-03-14T10:00:00.000Z',
    remindAt: null,
    blockedReason: null,
    completionNote: null,
    nextStepSummary: null,
    createdAt: '2026-03-13T10:00:00.000Z',
    updatedAt: '2026-03-14T10:00:00.000Z',
    completedAt: null
  };
  const followThroughBlocked = {
    id: 'follow-through-engine:blocked',
    tenantId,
    source: { sourceType: 'task' as const, sourceId: task.id },
    policyKey: 'FT-005-rejected-intent-context' as const,
    decisionType: 'record_blocked' as const,
    status: 'blocked' as const,
    reason: 'Founder intent was rejected and still needs review.',
    summary: 'Recorded blocked context because founder intent was rejected.',
    idempotencyKey: 'ft:block',
    createdArtifactIds: [],
    auditEventId: 'diag:ft:1',
    metadata: { linkedTaskId: task.id, linkedCommandId: 'founder-command:1' },
    createdAt: '2026-03-16T18:00:00.000Z',
    evaluatedAtIso: '2026-03-16T18:00:00.000Z'
  };
  const blockedRecommendation = {
    id: 'recommendation:1',
    tenantId,
    source: { sourceType: 'follow_through_record' as const, sourceId: followThroughBlocked.id },
    recommendationType: 'review_blocked' as const,
    status: 'active' as const,
    reason: 'Blocked recommendation requires review.',
    summary: 'Review the blocked recommendation path before momentum dies.',
    idempotencyKey: 'rec:1',
    relatedCommandId: null,
    relatedTaskId: task.id,
    metadata: { targetType: 'task', targetId: task.id },
    auditEventId: 'diag:rec:1',
    createdAtIso: '2026-03-16T18:05:00.000Z',
    evaluatedAtIso: '2026-03-16T18:05:00.000Z'
  };

  return {
    listAaliyahDiagnosticsEvents: vi.fn(async () => [
      {
        eventId: 'diag:1',
        tenantId,
        actorId,
        principalContext: 'founder',
        activeMode: 'founder',
        eventType: 'founder_command_rejected',
        eventSource: 'aaliyah_runtime',
        signalKey: 'aaliyah.founder_command.rejected',
        payload: { targetId: task.id, linkedTaskId: task.id, linkedCommandId: 'founder-command:1' },
        createdAt: '2026-03-16T18:01:00.000Z'
      },
      {
        eventId: 'diag:2',
        tenantId,
        actorId,
        principalContext: 'founder',
        activeMode: 'founder',
        eventType: 'follow_through_engine_blocked',
        eventSource: 'aaliyah_runtime',
        signalKey: 'aaliyah.follow_through.blocked',
        payload: { linkedTaskId: task.id, linkedCommandId: 'founder-command:1' },
        createdAt: '2026-03-16T18:02:00.000Z'
      }
    ]),
    listFollowThroughEngineRecords: vi.fn(async () => [followThroughBlocked]),
    listRecommendations: vi.fn(async () => [blockedRecommendation]),
    getAaliyahCrmContactById: vi.fn(async ({ contactId }: { contactId: string }) => contactId === contact.id ? contact : null),
    getAaliyahCrmAccountById: vi.fn(async ({ accountId }: { accountId: string }) => accountId === account.id ? account : null),
    listAaliyahTasksByContactId: vi.fn(async ({ contactId }: { contactId: string }) => contactId === contact.id ? [] : []),
    listAaliyahTasksByAccountId: vi.fn(async ({ accountId }: { accountId: string }) => accountId === account.id ? [task] : []),
    getAaliyahTaskById: vi.fn(async ({ taskId }: { taskId: string }) => taskId === task.id ? task : null),
    getFollowThroughEngineRecordById: vi.fn(async ({ recordId }: { recordId: string }) => recordId === followThroughBlocked.id ? followThroughBlocked : null),
    getRecommendationById: vi.fn(async ({ recommendationId }: { recommendationId: string }) => recommendationId === blockedRecommendation.id ? blockedRecommendation : null),
    getFounderCommandById: vi.fn(async () => null),
    getOpportunityByIdempotencyKey: vi.fn(async () => null),
    createOpportunity: vi.fn(async (args: any) => ({
      id: args.opportunityId,
      tenantId: args.tenantId,
      source: { sourceType: args.sourceType, sourceId: args.sourceId },
      opportunityType: args.opportunityType,
      status: args.opportunityStatus,
      reason: args.reason,
      summary: args.summary,
      idempotencyKey: args.idempotencyKey,
      relatedTaskId: args.relatedTaskId,
      relatedRecommendationId: args.relatedRecommendationId,
      auditEventId: args.auditEventId,
      metadata: args.metadata ?? {},
      createdAtIso: args.createdAt,
      evaluatedAtIso: args.evaluatedAt,
      acknowledgedAtIso: null,
      dismissedAtIso: null
    })),
    getOpportunityById: vi.fn(async ({ opportunityId }: { opportunityId: string }) => opportunityId === 'opportunity:1' ? {
      id: 'opportunity:1',
      tenantId,
      source: { sourceType: 'contact' as const, sourceId: contact.id },
      opportunityType: 'dormant_contact' as const,
      status: 'active' as const,
      reason: 'This relationship has prior value but has gone quiet with no active follow-up.',
      summary: 'A previously active relationship has gone quiet long enough to justify outreach.',
      idempotencyKey: 'opp:key',
      relatedTaskId: null,
      relatedRecommendationId: null,
      auditEventId: 'diag:opp:1',
      metadata: { targetType: 'contact', targetId: contact.id },
      createdAtIso: '2026-03-16T18:10:00.000Z',
      evaluatedAtIso: '2026-03-16T18:10:00.000Z',
      acknowledgedAtIso: null,
      dismissedAtIso: null
    } : null),
    listOpportunities: vi.fn(async () => []),
    updateOpportunityStatus: vi.fn(async ({ status }: { status: 'acknowledged' | 'dismissed' }) => ({
      id: 'opportunity:1',
      tenantId,
      source: { sourceType: 'contact' as const, sourceId: contact.id },
      opportunityType: 'dormant_contact' as const,
      status,
      reason: 'This relationship has prior value but has gone quiet with no active follow-up.',
      summary: 'A previously active relationship has gone quiet long enough to justify outreach.',
      idempotencyKey: 'opp:key',
      relatedTaskId: null,
      relatedRecommendationId: null,
      auditEventId: 'diag:opp:1',
      metadata: { targetType: 'contact', targetId: contact.id },
      createdAtIso: '2026-03-16T18:10:00.000Z',
      evaluatedAtIso: '2026-03-16T18:10:00.000Z',
      acknowledgedAtIso: status === 'acknowledged' ? '2026-03-16T18:12:00.000Z' : null,
      dismissedAtIso: status === 'dismissed' ? '2026-03-16T18:12:00.000Z' : null
    }))
  } as any;
}

function createDiagnostics() {
  return {
    recordEvent: vi.fn(async () => ({ eventId: 'aaliyah-diagnostics:event-5' }))
  } as any;
}

describe('Aaliyah opportunity engine service', () => {
  it('creates a dormant contact opportunity', async () => {
    const service = new AaliyahOpportunityEngineService(createRepository(), createDiagnostics());
    const result = await service.evaluateSource({
      tenantId,
      actorId,
      principalContext: 'founder',
      mode: 'founder',
      source: { sourceType: 'contact', sourceId: 'crm-contact:1' },
      generatedAt: '2026-03-16T18:10:00.000Z'
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.opportunity.opportunityType).toBe('dormant_contact');
    }
  });

  it('creates a missed follow-up window opportunity', async () => {
    const service = new AaliyahOpportunityEngineService(createRepository(), createDiagnostics());
    const result = await service.evaluateSource({
      tenantId,
      actorId,
      principalContext: 'founder',
      mode: 'founder',
      source: { sourceType: 'task', sourceId: 'task:1' },
      generatedAt: '2026-03-16T18:10:00.000Z'
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.opportunity.opportunityType).toBe('missed_follow_up_window');
    }
  });

  it('creates a recurring block pattern opportunity', async () => {
    const service = new AaliyahOpportunityEngineService(createRepository(), createDiagnostics());
    const result = await service.evaluateSource({
      tenantId,
      actorId,
      principalContext: 'founder',
      mode: 'founder',
      source: { sourceType: 'follow_through_record', sourceId: 'follow-through-engine:blocked' },
      generatedAt: '2026-03-16T18:10:00.000Z'
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.opportunity.opportunityType).toBe('recurring_block_pattern');
      expect(result.opportunity.relatedRecommendationId).toBe('recommendation:1');
    }
  });

  it('replays a duplicate opportunity', async () => {
    const repository = createRepository();
    repository.getOpportunityByIdempotencyKey.mockResolvedValueOnce({
      id: 'opportunity:existing',
      tenantId,
      source: { sourceType: 'contact' as const, sourceId: 'crm-contact:1' },
      opportunityType: 'dormant_contact' as const,
      status: 'active' as const,
      reason: 'This relationship has prior value but has gone quiet with no active follow-up.',
      summary: 'A previously active relationship has gone quiet long enough to justify outreach.',
      idempotencyKey: 'opp:key',
      relatedTaskId: null,
      relatedRecommendationId: null,
      auditEventId: 'diag:opp:existing',
      metadata: { targetType: 'contact', targetId: 'crm-contact:1' },
      createdAtIso: '2026-03-16T18:10:00.000Z',
      evaluatedAtIso: '2026-03-16T18:10:00.000Z',
      acknowledgedAtIso: null,
      dismissedAtIso: null
    });
    const service = new AaliyahOpportunityEngineService(repository, createDiagnostics());

    const result = await service.evaluateSource({
      tenantId,
      actorId,
      principalContext: 'founder',
      mode: 'founder',
      source: { sourceType: 'contact', sourceId: 'crm-contact:1' },
      generatedAt: '2026-03-16T18:10:00.000Z'
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.replayed).toBe(true);
    }
    expect(repository.createOpportunity).not.toHaveBeenCalled();
  });

  it('acknowledges an opportunity', async () => {
    const service = new AaliyahOpportunityEngineService(createRepository(), createDiagnostics());
    const result = await service.acknowledgeOpportunity({
      tenantId,
      actorId,
      principalContext: 'founder',
      mode: 'founder',
      opportunityId: 'opportunity:1'
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.opportunity.status).toBe('acknowledged');
    }
  });

  it('denies non-founder access', async () => {
    const service = new AaliyahOpportunityEngineService(createRepository(), createDiagnostics());
    const result = await service.listOpportunities({
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
