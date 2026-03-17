import type { FounderBriefingMode } from './briefing-types.js';
import type { AaliyahFollowThroughEngineService } from './follow-through-engine-service.js';
import type { AaliyahNotificationEngineService } from './notification-engine-service.js';
import type { AaliyahOpportunityEngineService } from './opportunity-engine-service.js';
import type { AaliyahRecommendationEngineService } from './recommendation-engine-service.js';
import type { AaliyahStrategicIntelligenceService } from './strategic-intelligence-service.js';
import type {
  EvaluationJobOutcome,
  EvaluationScheduleRecord
} from './evaluation-scheduler-types.js';
import type { AgentOsRepository } from '../persistence/repository.js';

export type SchedulerEngineServices = {
  followThrough: AaliyahFollowThroughEngineService;
  recommendation: AaliyahRecommendationEngineService;
  notification: AaliyahNotificationEngineService;
  opportunity: AaliyahOpportunityEngineService;
  strategicIntelligence: AaliyahStrategicIntelligenceService;
};

export async function executeScheduledEngine(args: {
  repository: AgentOsRepository;
  services: SchedulerEngineServices;
  tenantId: string;
  actorId: string;
  principalContext: 'founder' | 'operator';
  mode: FounderBriefingMode;
  schedule: EvaluationScheduleRecord;
  generatedAt: string;
}): Promise<EvaluationJobOutcome> {
  switch (args.schedule.engineType) {
    case 'follow_through':
      return runFollowThrough(args);
    case 'recommendation':
      return runRecommendation(args);
    case 'notification':
      return runNotification(args);
    case 'opportunity':
      return runOpportunity(args);
    case 'strategic_intelligence':
      return runStrategicIntelligence(args);
  }
}

async function runFollowThrough(args: Parameters<typeof executeScheduledEngine>[0]): Promise<EvaluationJobOutcome> {
  const [tasks, commands] = await Promise.all([
    args.repository.listAaliyahOpenTasks({ tenantId: args.tenantId, principalId: args.actorId }),
    args.repository.listFounderCommands({ tenantId: args.tenantId, limit: 12 })
  ]);
  const sources = [
    ...tasks.slice(0, 20).map((task) => ({ sourceType: 'task' as const, sourceId: task.id })),
    ...commands.filter((command) => command.executionStatus === 'executed').slice(0, 8).map((command) => ({ sourceType: 'founder_command' as const, sourceId: command.id }))
  ];
  return runPerSource({
    sources,
    runOne: async (source) => args.services.followThrough.evaluateSource({
      tenantId: args.tenantId,
      actorId: args.actorId,
      principalContext: args.principalContext,
      mode: args.mode,
      source,
      generatedAt: args.generatedAt
    })
  });
}

async function runRecommendation(args: Parameters<typeof executeScheduledEngine>[0]): Promise<EvaluationJobOutcome> {
  const records = await args.repository.listFollowThroughEngineRecords({ tenantId: args.tenantId, limit: 25 });
  const sources = records.slice(0, 25).map((record) => ({ sourceType: 'follow_through_record' as const, sourceId: record.id }));
  return runPerSource({
    sources,
    runOne: async (source) => args.services.recommendation.evaluateSource({
      tenantId: args.tenantId,
      actorId: args.actorId,
      principalContext: args.principalContext,
      mode: args.mode,
      source,
      generatedAt: args.generatedAt
    })
  });
}

async function runNotification(args: Parameters<typeof executeScheduledEngine>[0]): Promise<EvaluationJobOutcome> {
  const [recommendations, records] = await Promise.all([
    args.repository.listRecommendations({ tenantId: args.tenantId, limit: 20 }),
    args.repository.listFollowThroughEngineRecords({ tenantId: args.tenantId, limit: 20 })
  ]);
  const sources = [
    ...recommendations.filter((item) => item.status === 'active').slice(0, 12).map((item) => ({ sourceType: 'recommendation' as const, sourceId: item.id })),
    ...records.filter((item) => item.status === 'blocked' || item.status === 'stale').slice(0, 8).map((item) => ({ sourceType: 'follow_through_record' as const, sourceId: item.id }))
  ];
  return runPerSource({
    sources,
    runOne: async (source) => args.services.notification.evaluateSource({
      tenantId: args.tenantId,
      actorId: args.actorId,
      principalContext: args.principalContext,
      mode: args.mode,
      source,
      generatedAt: args.generatedAt
    })
  });
}

async function runOpportunity(args: Parameters<typeof executeScheduledEngine>[0]): Promise<EvaluationJobOutcome> {
  const [contacts, accounts, tasks, recommendations] = await Promise.all([
    args.repository.listAaliyahCrmContacts({ tenantId: args.tenantId, limit: 20 }),
    args.repository.listAaliyahCrmAccounts({ tenantId: args.tenantId, limit: 12 }),
    args.repository.listAaliyahOpenTasks({ tenantId: args.tenantId, principalId: args.actorId }),
    args.repository.listRecommendations({ tenantId: args.tenantId, limit: 10 })
  ]);
  const sources = [
    ...contacts.slice(0, 12).map((contact) => ({ sourceType: 'contact' as const, sourceId: contact.id })),
    ...accounts.slice(0, 8).map((account) => ({ sourceType: 'account' as const, sourceId: account.id })),
    ...tasks.slice(0, 5).map((task) => ({ sourceType: 'task' as const, sourceId: task.id })),
    ...recommendations.filter((recommendation) => recommendation.status === 'active').slice(0, 5).map((recommendation) => ({ sourceType: 'recommendation' as const, sourceId: recommendation.id }))
  ];
  return runPerSource({
    sources,
    runOne: async (source) => args.services.opportunity.evaluateSource({
      tenantId: args.tenantId,
      actorId: args.actorId,
      principalContext: args.principalContext,
      mode: args.mode,
      source,
      generatedAt: args.generatedAt
    })
  });
}

async function runStrategicIntelligence(args: Parameters<typeof executeScheduledEngine>[0]): Promise<EvaluationJobOutcome> {
  const scope = args.schedule.cadenceType === 'weekly' ? 'weekly' : args.schedule.cadenceType === 'daily' ? 'daily' : 'current';
  const result = await args.services.strategicIntelligence.evaluate({
    tenantId: args.tenantId,
    actorId: args.actorId,
    principalContext: args.principalContext,
    mode: args.mode,
    scope,
    generatedAt: args.generatedAt
  });
  if (!result.ok) {
    return {
      executedCount: 0,
      replayedCount: 0,
      failureCount: 1,
      recordIds: [],
      details: [{ sourceType: 'strategic_intelligence', sourceId: scope, ok: false, message: result.message }]
    };
  }
  return {
    executedCount: result.insights.length - result.replayedCount,
    replayedCount: result.replayedCount,
    failureCount: 0,
    recordIds: result.insights.map((insight) => insight.id),
    details: [{
      sourceType: 'strategic_intelligence',
      sourceId: scope,
      ok: true,
      message: result.message,
      recordId: result.insights[0]?.id
    }]
  };
}

async function runPerSource<TSource extends { sourceType: string; sourceId: string }>(args: {
  sources: TSource[];
  runOne: (source: TSource) => Promise<any>;
}): Promise<EvaluationJobOutcome> {
  const details: EvaluationJobOutcome['details'] = [];
  const recordIds: string[] = [];
  let executedCount = 0;
  let replayedCount = 0;
  let failureCount = 0;

  for (const source of args.sources) {
    const result = await args.runOne(source);
    if (!result.ok) {
      failureCount += 1;
      details.push({ sourceType: source.sourceType, sourceId: source.sourceId, ok: false, message: result.message });
      continue;
    }

    const recordId = 'record' in result
      ? result.record.id
      : 'recommendation' in result
        ? result.recommendation.id
        : 'notification' in result
          ? result.notification.id
          : 'opportunity' in result
            ? result.opportunity.id
            : undefined;

    if ('replayed' in result && result.replayed) {
      replayedCount += 1;
    } else {
      executedCount += 1;
    }
    if (recordId) {
      recordIds.push(recordId);
    }
    details.push({
      sourceType: source.sourceType,
      sourceId: source.sourceId,
      ok: true,
      replayed: 'replayed' in result ? Boolean(result.replayed) : false,
      message: result.message,
      recordId
    });
  }

  return { executedCount, replayedCount, failureCount, recordIds, details };
}
