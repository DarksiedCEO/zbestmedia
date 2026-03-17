import { describe, expect, it, vi } from 'vitest';

import { AaliyahRecommendationEngineService } from '../src/aaliyah/recommendation-engine-service.js';

const tenantId = '11111111-1111-4111-8111-111111111111';
const actorId = 'actor-1';

function createRepository() {
  const staleTask = {
    id: 'task:1',
    tenantId,
    principalId: actorId,
    title: 'Follow up with ACME',
    description: 'Client follow-up is overdue.',
    status: 'open' as const,
    priority: 'critical' as const,
    source: 'crm_follow_up' as const,
    contactId: 'crm-contact:1',
    accountId: 'crm-account:1',
    relatedEmailDraftId: null,
    relatedCalendarEventId: null,
    dueAt: '2026-03-14T18:00:00.000Z',
    remindAt: '2026-03-14T16:00:00.000Z',
    blockedReason: null,
    completionNote: null,
    nextStepSummary: 'Follow up with ACME now.',
    createdAt: '2026-03-12T18:00:00.000Z',
    updatedAt: '2026-03-14T18:00:00.000Z',
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
    idempotencyKey: 'ft:FT-003-overdue-task-stale:task:task:1:abc',
    createdArtifactIds: [],
    auditEventId: 'diag:ft:1',
    metadata: { linkedTaskId: staleTask.id },
    createdAt: '2026-03-16T18:00:00.000Z',
    evaluatedAtIso: '2026-03-16T18:00:00.000Z'
  };

  const blockedRecord = {
    ...followThroughRecord,
    id: 'follow-through-engine:blocked',
    source: { sourceType: 'founder_command' as const, sourceId: 'founder-command:blocked' },
    policyKey: 'FT-005-rejected-intent-context' as const,
    decisionType: 'record_blocked' as const,
    status: 'blocked' as const,
    reason: 'Founder intent was rejected and still needs review.',
    summary: 'Recorded blocked context because founder intent was rejected.',
    metadata: { linkedCommandId: 'founder-command:blocked', linkedTaskId: staleTask.id }
  };

  const dormantContact = {
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

  const founderCommand = {
    id: 'founder-command:blocked',
    tenantId,
    requestId: 'req-1',
    actorUserId: actorId,
    actorRole: 'founder' as const,
    commandType: 'approve_draft' as const,
    targetType: 'gmail_draft' as const,
    targetId: 'email-review:1',
    payload: { approvalMode: 'approved_for_send' },
    idempotencyKey: 'founder-command-blocked',
    executionStatus: 'noop' as const,
    summary: 'Command was blocked.',
    auditEventId: 'diag:cmd:1',
    metadata: {},
    createdAt: '2026-03-16T18:00:00.000Z',
    executedAt: null
  };

  return {
    listAaliyahDiagnosticsEvents: vi.fn(async () => [
      {
        eventId: 'diag:blocked:1',
        tenantId,
        actorId,
        principalContext: 'founder',
        activeMode: 'founder',
        eventType: 'founder_command_rejected',
        eventSource: 'aaliyah_runtime',
        signalKey: 'aaliyah.founder_command.rejected',
        payload: { targetId: founderCommand.targetId, linkedCommandId: founderCommand.id, linkedTaskId: staleTask.id },
        createdAt: '2026-03-16T18:01:00.000Z'
      }
    ]),
    getFollowThroughEngineRecordById: vi.fn(async ({ recordId }: { recordId: string }) => {
      if (recordId === followThroughRecord.id) return followThroughRecord;
      if (recordId === blockedRecord.id) return blockedRecord;
      return null;
    }),
    getAaliyahTaskById: vi.fn(async ({ taskId }: { taskId: string }) => taskId === staleTask.id ? staleTask : null),
    getFounderCommandById: vi.fn(async ({ commandId }: { commandId: string }) => commandId === founderCommand.id ? founderCommand : null),
    getAaliyahCrmContactById: vi.fn(async ({ contactId }: { contactId: string }) => contactId === dormantContact.id ? dormantContact : null),
    getAaliyahCrmAccountById: vi.fn(async ({ accountId }: { accountId: string }) => accountId === account.id ? account : null),
    listAaliyahTasksByContactId: vi.fn(async () => []),
    getRecommendationByIdempotencyKey: vi.fn(async () => null),
    createRecommendation: vi.fn(async (args: any) => ({
      id: args.recommendationId,
      tenantId: args.tenantId,
      source: { sourceType: args.sourceType, sourceId: args.sourceId },
      recommendationType: args.recommendationType,
      status: args.recommendationStatus,
      reason: args.reason,
      summary: args.summary,
      idempotencyKey: args.idempotencyKey,
      relatedCommandId: args.relatedCommandId,
      relatedTaskId: args.relatedTaskId,
      metadata: args.metadata ?? {},
      auditEventId: args.auditEventId,
      createdAtIso: args.createdAt,
      evaluatedAtIso: args.evaluatedAt
    })),
    getRecommendationById: vi.fn(async ({ recommendationId }: { recommendationId: string }) => recommendationId === 'recommendation:1' ? {
      id: 'recommendation:1',
      tenantId,
      source: { sourceType: 'contact' as const, sourceId: dormantContact.id },
      recommendationType: 'revive_contact' as const,
      status: 'active' as const,
      reason: 'Previously active relationship is dormant with no open follow-up.',
      summary: 'Revive the contact relationship now.',
      idempotencyKey: 'rec:key',
      relatedCommandId: null,
      relatedTaskId: null,
      metadata: { targetType: 'contact', targetId: dormantContact.id },
      auditEventId: 'diag:rec:1',
      createdAtIso: '2026-03-16T18:00:00.000Z',
      evaluatedAtIso: '2026-03-16T18:00:00.000Z'
    } : null),
    listRecommendations: vi.fn(async () => [])
  } as any;
}

function createDiagnostics() {
  return {
    recordEvent: vi.fn(async () => ({ eventId: 'aaliyah-diagnostics:event-3' }))
  } as any;
}

describe('Aaliyah recommendation engine service', () => {
  it('creates an escalate recommendation for stale high-priority work', async () => {
    const repository = createRepository();
    const service = new AaliyahRecommendationEngineService(repository, createDiagnostics());

    const result = await service.evaluateSource({
      tenantId,
      actorId,
      principalContext: 'founder',
      mode: 'founder',
      source: { sourceType: 'follow_through_record', sourceId: 'follow-through-engine:1' },
      generatedAt: '2026-03-16T18:10:00.000Z'
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.recommendation.recommendationType).toBe('escalate_now');
      expect(result.recommendation.relatedTaskId).toBe('task:1');
    }
  });

  it('replays a previously persisted recommendation', async () => {
    const repository = createRepository();
    repository.getRecommendationByIdempotencyKey.mockResolvedValueOnce({
      id: 'recommendation:existing',
      tenantId,
      source: { sourceType: 'follow_through_record', sourceId: 'follow-through-engine:1' },
      recommendationType: 'escalate_now',
      status: 'active',
      reason: 'Stale high-priority work should be escalated now.',
      summary: 'Escalate the stale task now.',
      idempotencyKey: 'rec:key',
      relatedCommandId: 'founder-command:1',
      relatedTaskId: 'task:1',
      metadata: { targetType: 'task', targetId: 'task:1' },
      auditEventId: 'diag:rec:existing',
      createdAtIso: '2026-03-16T18:10:00.000Z',
      evaluatedAtIso: '2026-03-16T18:10:00.000Z'
    });
    const service = new AaliyahRecommendationEngineService(repository, createDiagnostics());

    const result = await service.evaluateSource({
      tenantId,
      actorId,
      principalContext: 'founder',
      mode: 'founder',
      source: { sourceType: 'follow_through_record', sourceId: 'follow-through-engine:1' },
      generatedAt: '2026-03-16T18:10:00.000Z'
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.replayed).toBe(true);
    }
    expect(repository.createRecommendation).not.toHaveBeenCalled();
  });

  it('creates a blocked review recommendation from rejected intent context', async () => {
    const repository = createRepository();
    const service = new AaliyahRecommendationEngineService(repository, createDiagnostics());

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
      expect(result.recommendation.recommendationType).toBe('review_blocked');
    }
  });

  it('creates a revive-contact recommendation for dormant relationships', async () => {
    const repository = createRepository();
    const service = new AaliyahRecommendationEngineService(repository, createDiagnostics());

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
      expect(result.recommendation.recommendationType).toBe('revive_contact');
    }
  });

  it('denies non-founder access', async () => {
    const service = new AaliyahRecommendationEngineService(createRepository(), createDiagnostics());
    const result = await service.listRecommendations({
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

  it('normalizes not-found lookup failures', async () => {
    const service = new AaliyahRecommendationEngineService(createRepository(), createDiagnostics());
    const result = await service.getRecommendationById({
      tenantId,
      actorId,
      principalContext: 'founder',
      mode: 'founder',
      recommendationId: 'recommendation:missing'
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe('NOT_FOUND');
    }
  });
});
