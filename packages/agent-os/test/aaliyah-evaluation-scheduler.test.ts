import { describe, expect, it, vi } from 'vitest';

import { AaliyahEvaluationSchedulerService } from '../src/aaliyah/evaluation-scheduler-service.js';

const tenantId = '11111111-1111-4111-8111-111111111111';
const actorId = 'actor-1';

function createRepository() {
  const schedules: any[] = [];
  const runs: any[] = [];

  return {
    getEvaluationScheduleByEngine: vi.fn(async ({ engineType }: any) => schedules.find((item) => item.engineType === engineType) ?? null),
    createEvaluationSchedule: vi.fn(async (args: any) => {
      const record = {
        id: args.scheduleId,
        tenantId: args.tenantId,
        engineType: args.engineType,
        status: args.status,
        cadenceType: args.cadenceType,
        cadenceValue: args.cadenceValue,
        lastRunAtIso: args.lastRunAt,
        nextRunAtIso: args.nextRunAt,
        idempotencyKey: args.idempotencyKey,
        metadata: args.metadata ?? {},
        createdAtIso: args.createdAt,
        updatedAtIso: args.updatedAt
      };
      schedules.push(record);
      return record;
    }),
    updateEvaluationSchedule: vi.fn(async (args: any) => {
      const schedule = schedules.find((item) => item.id === args.scheduleId)!;
      if (args.status !== undefined) schedule.status = args.status;
      if (args.cadenceType !== undefined) schedule.cadenceType = args.cadenceType;
      if ('cadenceValue' in args) schedule.cadenceValue = args.cadenceValue;
      if ('nextRunAt' in args) schedule.nextRunAtIso = args.nextRunAt;
      if (args.idempotencyKey) schedule.idempotencyKey = args.idempotencyKey;
      if (args.metadata) schedule.metadata = args.metadata;
      schedule.updatedAtIso = args.updatedAt;
      return schedule;
    }),
    updateEvaluationScheduleRuntime: vi.fn(async (args: any) => {
      const schedule = schedules.find((item) => item.id === args.scheduleId)!;
      schedule.lastRunAtIso = args.lastRunAt;
      schedule.nextRunAtIso = args.nextRunAt;
      schedule.updatedAtIso = args.updatedAt;
      return schedule;
    }),
    getEvaluationScheduleById: vi.fn(async ({ scheduleId }: any) => schedules.find((item) => item.id === scheduleId) ?? null),
    listEvaluationSchedules: vi.fn(async () => schedules),
    listDueEvaluationSchedules: vi.fn(async () => schedules.filter((item) => item.status === 'active' && item.nextRunAtIso)),
    createEvaluationRun: vi.fn(async (args: any) => {
      const record = {
        id: args.runId,
        tenantId: args.tenantId,
        scheduleId: args.scheduleId,
        engineType: args.engineType,
        runStatus: args.runStatus,
        windowKey: args.windowKey,
        summary: args.summary,
        auditEventId: args.auditEventId,
        metadata: args.metadata ?? {},
        startedAtIso: args.startedAt,
        completedAtIso: args.completedAt
      };
      runs.push(record);
      return record;
    }),
    updateEvaluationRun: vi.fn(async (args: any) => {
      const run = runs.find((item) => item.id === args.runId)!;
      run.runStatus = args.runStatus;
      run.summary = args.summary;
      run.auditEventId = args.auditEventId;
      run.metadata = args.metadata ?? {};
      run.completedAtIso = args.completedAt;
      return run;
    }),
    getEvaluationRunById: vi.fn(async ({ runId }: any) => runs.find((item) => item.id === runId) ?? null),
    getEvaluationRunByWindowKey: vi.fn(async ({ windowKey }: any) => runs.find((item) => item.windowKey === windowKey) ?? null),
    listEvaluationRuns: vi.fn(async () => runs),
    listAaliyahOpenTasks: vi.fn(async () => [{
      id: 'task:1',
      tenantId,
      principalId: actorId,
      title: 'Follow up',
      description: null,
      status: 'open',
      priority: 'high',
      source: 'manual',
      contactId: null,
      accountId: null,
      relatedEmailDraftId: null,
      relatedCalendarEventId: null,
      dueAt: null,
      remindAt: null,
      blockedReason: null,
      completionNote: null,
      nextStepSummary: null,
      createdAt: '2026-03-16T18:00:00.000Z',
      updatedAt: '2026-03-16T18:00:00.000Z',
      completedAt: null
    }]),
    listFounderCommands: vi.fn(async () => []),
    listFollowThroughEngineRecords: vi.fn(async () => []),
    listRecommendations: vi.fn(async () => []),
    listAaliyahCrmContacts: vi.fn(async () => []),
    listAaliyahCrmAccounts: vi.fn(async () => [])
  } as any;
}

function createServices() {
  return {
    followThrough: {
      evaluateSource: vi.fn(async ({ source }: any) => ({
        ok: true,
        record: {
          id: `follow-through:${source.sourceId}`,
          summary: 'Created follow-up task after approved draft command.'
        },
        message: 'Created follow-up task after approved draft command.'
      }))
    },
    recommendation: { evaluateSource: vi.fn(async () => ({ ok: true, recommendation: { id: 'recommendation:1' }, replayed: false, message: 'ok' })) },
    notification: { evaluateSource: vi.fn(async () => ({ ok: true, notification: { id: 'notification:1' }, replayed: false, message: 'ok' })) },
    opportunity: { evaluateSource: vi.fn(async () => ({ ok: true, opportunity: { id: 'opportunity:1' }, replayed: false, message: 'ok' })) },
    strategicIntelligence: {
      evaluate: vi.fn(async () => ({ ok: true, insights: [{ id: 'strategic-insight:1' }], replayedCount: 0, message: 'Created 1 strategic insight.' }))
    }
  } as any;
}

function createDiagnostics() {
  return {
    recordEvent: vi.fn(async () => ({ eventId: 'aaliyah-diagnostics:event-9' }))
  } as any;
}

describe('Aaliyah evaluation scheduler service', () => {
  it('creates a schedule and computes the next run', async () => {
    const service = new AaliyahEvaluationSchedulerService(createRepository(), createServices(), createDiagnostics());
    const result = await service.createOrUpdateSchedule({
      tenantId,
      actorId,
      principalContext: 'founder',
      mode: 'founder',
      engineType: 'follow_through',
      cadenceType: 'hourly',
      cadenceValue: '1',
      generatedAt: '2026-03-16T18:00:00.000Z'
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.schedule.engineType).toBe('follow_through');
      expect(result.schedule.nextRunAtIso).toBe('2026-03-16T19:00:00.000Z');
    }
  });

  it('pauses and resumes a schedule', async () => {
    const repository = createRepository();
    const service = new AaliyahEvaluationSchedulerService(repository, createServices(), createDiagnostics());
    const created = await service.createOrUpdateSchedule({
      tenantId,
      actorId,
      principalContext: 'founder',
      mode: 'founder',
      engineType: 'recommendation',
      cadenceType: 'daily',
      cadenceValue: '09:00',
      generatedAt: '2026-03-16T18:00:00.000Z'
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const paused = await service.pauseSchedule({
      tenantId,
      actorId,
      principalContext: 'founder',
      mode: 'founder',
      scheduleId: created.schedule.id,
      generatedAt: '2026-03-16T18:05:00.000Z'
    });
    expect(paused.ok).toBe(true);
    if (paused.ok) {
      expect(paused.schedule.status).toBe('paused');
      expect(paused.schedule.nextRunAtIso).toBeNull();
    }

    const resumed = await service.resumeSchedule({
      tenantId,
      actorId,
      principalContext: 'founder',
      mode: 'founder',
      scheduleId: created.schedule.id,
      generatedAt: '2026-03-16T18:06:00.000Z'
    });
    expect(resumed.ok).toBe(true);
    if (resumed.ok) {
      expect(resumed.schedule.status).toBe('active');
      expect(resumed.schedule.nextRunAtIso).toBeTruthy();
    }
  });

  it('runs a schedule through existing engine services and replays by window', async () => {
    const repository = createRepository();
    const services = createServices();
    const service = new AaliyahEvaluationSchedulerService(repository, services, createDiagnostics());
    const created = await service.createOrUpdateSchedule({
      tenantId,
      actorId,
      principalContext: 'founder',
      mode: 'founder',
      engineType: 'follow_through',
      cadenceType: 'hourly',
      cadenceValue: '1',
      generatedAt: '2026-03-16T18:00:00.000Z'
    });
    if (!created.ok) {
      throw new Error('schedule create failed');
    }

    const first = await service.runSchedule({
      tenantId,
      actorId,
      principalContext: 'founder',
      mode: 'founder',
      scheduleId: created.schedule.id,
      generatedAt: '2026-03-16T18:15:00.000Z'
    });
    expect(first.ok).toBe(true);
    if (first.ok) {
      expect(first.replayed).toBe(false);
      expect(first.run.runStatus).toBe('completed');
    }
    expect(services.followThrough.evaluateSource).toHaveBeenCalled();

    const second = await service.runSchedule({
      tenantId,
      actorId,
      principalContext: 'founder',
      mode: 'founder',
      scheduleId: created.schedule.id,
      generatedAt: '2026-03-16T18:45:00.000Z'
    });
    expect(second.ok).toBe(true);
    if (second.ok) {
      expect(second.replayed).toBe(true);
    }
  });

  it('rejects non-founder access', async () => {
    const service = new AaliyahEvaluationSchedulerService(createRepository(), createServices(), createDiagnostics());
    const result = await service.listSchedules({
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
