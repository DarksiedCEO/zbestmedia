import type { FounderBriefingMode } from './briefing-types.js';
import { StrategicIntelligenceValidationError } from './strategic-intelligence-errors.js';
import type {
  StrategicIntelligenceEvaluationScope,
  StrategicIntelligenceSourceBundle
} from './strategic-intelligence-types.js';
import type { AgentOsRepository } from '../persistence/repository.js';

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

export class AaliyahStrategicIntelligenceSources {
  constructor(private readonly repository: AgentOsRepository) {}

  async loadBundle(args: {
    tenantId: string;
    actorId: string;
    principalContext: 'founder' | 'operator';
    mode: FounderBriefingMode;
    scope: StrategicIntelligenceEvaluationScope;
    generatedAt: string;
  }): Promise<StrategicIntelligenceSourceBundle> {
    if (!['current', 'daily', 'weekly'].includes(args.scope)) {
      throw new StrategicIntelligenceValidationError('Strategic intelligence scope is invalid.');
    }

    const [notifications, recommendations, opportunities, followThroughRecords, founderCommands, tasks, diagnostics] = await Promise.all([
      this.repository.listNotifications({ tenantId: args.tenantId, limit: 200 }),
      this.repository.listRecommendations({ tenantId: args.tenantId, limit: 200 }),
      this.repository.listOpportunities({ tenantId: args.tenantId, limit: 200 }),
      this.repository.listFollowThroughEngineRecords({ tenantId: args.tenantId, limit: 200 }),
      this.repository.listFounderCommands({ tenantId: args.tenantId, limit: 100 }),
      this.repository.listAaliyahOpenTasks({ tenantId: args.tenantId, principalId: args.actorId }),
      this.repository.listAaliyahDiagnosticsEvents({
        tenantId: args.tenantId,
        actorId: args.actorId,
        principalContext: args.principalContext,
        since: '2000-01-01T00:00:00.000Z',
        until: args.generatedAt,
        limit: 400
      })
    ]);

    const normalizedNotifications = notifications.map((item) => ({
      id: item.id,
      type: item.notificationType,
      severity: item.severity,
      status: item.status,
      sourceType: item.source.sourceType,
      sourceId: item.source.sourceId,
      summary: item.summary,
      reason: item.reason,
      relatedRecommendationId: item.relatedRecommendationId,
      relatedTaskId: item.relatedTaskId,
      acknowledgedAtIso: item.acknowledgedAtIso,
      createdAtIso: item.createdAtIso
    }));

    const normalizedRecommendations = recommendations.map((item) => ({
      id: item.id,
      type: item.recommendationType,
      status: item.status,
      sourceType: item.source.sourceType,
      sourceId: item.source.sourceId,
      summary: item.summary,
      reason: item.reason,
      relatedCommandId: item.relatedCommandId,
      relatedTaskId: item.relatedTaskId,
      metadata: item.metadata,
      createdAtIso: item.createdAtIso
    }));

    const normalizedOpportunities = opportunities.map((item) => ({
      id: item.id,
      type: item.opportunityType,
      status: item.status,
      sourceType: item.source.sourceType,
      sourceId: item.source.sourceId,
      summary: item.summary,
      reason: item.reason,
      relatedTaskId: item.relatedTaskId,
      relatedRecommendationId: item.relatedRecommendationId,
      metadata: item.metadata,
      createdAtIso: item.createdAtIso
    }));

    const normalizedFollowThrough = followThroughRecords.map((item) => ({
      id: item.id,
      sourceType: item.source.sourceType,
      sourceId: item.source.sourceId,
      policyKey: item.policyKey,
      decisionType: item.decisionType,
      status: item.status,
      summary: item.summary,
      reason: item.reason,
      metadata: item.metadata,
      createdArtifactIds: item.createdArtifactIds,
      createdAtIso: item.createdAt
    }));

    const normalizedCommands = founderCommands.map((item) => ({
      id: item.id,
      commandType: item.commandType,
      targetType: item.targetType,
      targetId: item.targetId,
      executionStatus: item.executionStatus,
      summary: item.summary,
      metadata: item.metadata,
      executedAtIso: item.executedAt,
      createdAtIso: item.createdAt
    }));

    const normalizedTasks = tasks.map((item) => ({
      id: item.id,
      title: item.title,
      status: item.status,
      priority: item.priority,
      source: item.source,
      contactId: item.contactId,
      accountId: item.accountId,
      relatedEmailDraftId: item.relatedEmailDraftId,
      relatedCalendarEventId: item.relatedCalendarEventId,
      dueAtIso: item.dueAt,
      updatedAtIso: item.updatedAt
    }));

    const normalizedDiagnostics = diagnostics.map((item) => ({
      eventId: item.eventId,
      eventType: item.eventType,
      signalKey: item.signalKey,
      createdAtIso: item.createdAt,
      payload: asRecord(item.payload)
    }));

    const versionParts = [
      args.scope,
      ...normalizedNotifications.map((item) => `${item.id}:${item.status}`),
      ...normalizedRecommendations.map((item) => `${item.id}:${item.status}`),
      ...normalizedOpportunities.map((item) => `${item.id}:${item.status}`),
      ...normalizedFollowThrough.map((item) => `${item.id}:${item.status}`),
      ...normalizedCommands.map((item) => `${item.id}:${item.executionStatus}`),
      ...normalizedTasks.map((item) => `${item.id}:${item.status}:${item.updatedAtIso}`),
      ...normalizedDiagnostics.map((item) => item.eventId)
    ];

    return {
      scope: args.scope,
      notifications: normalizedNotifications,
      recommendations: normalizedRecommendations,
      opportunities: normalizedOpportunities,
      followThroughRecords: normalizedFollowThrough,
      founderCommands: normalizedCommands,
      tasks: normalizedTasks,
      diagnostics: normalizedDiagnostics,
      sourceVersion: versionParts.join('|')
    };
  }
}
