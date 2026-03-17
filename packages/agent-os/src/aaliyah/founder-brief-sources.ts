import type { AgentOsRepository } from '../persistence/repository.js';
import { buildFounderBriefWindow } from './founder-brief-policy.js';
import type { FounderBriefKind, FounderBriefSourceBundle } from './founder-brief-types.js';

export class AaliyahFounderBriefSources {
  constructor(private readonly repository: AgentOsRepository) {}

  async loadBundle(args: {
    tenantId: string;
    generatedAtIso: string;
    briefKind: FounderBriefKind;
  }): Promise<FounderBriefSourceBundle> {
    const window = buildFounderBriefWindow({ generatedAtIso: args.generatedAtIso, briefKind: args.briefKind });
    const [
      queueItems,
      actionLogs,
      outcomes,
      issueStates,
      strategicInsights,
      opportunities,
      recommendations,
      notifications,
      previousBrief
    ] = await Promise.all([
      this.repository.listOperatorQueueRecords({ tenantId: args.tenantId, limit: 100 }),
      this.repository.listOperatorActionLogs({ tenantId: args.tenantId, limit: 100 }),
      this.repository.listOutcomeFeedback({ tenantId: args.tenantId, limit: 100 }),
      this.repository.listIssueStates({ tenantId: args.tenantId, limit: 100 }),
      this.repository.listStrategicInsights({ tenantId: args.tenantId, limit: 30, status: 'active' }),
      this.repository.listOpportunities({ tenantId: args.tenantId, limit: 30, status: 'active' }),
      this.repository.listRecommendations({ tenantId: args.tenantId, limit: 30 }),
      this.repository.listNotifications({ tenantId: args.tenantId, limit: 30, status: 'active' }),
      this.repository.getLatestFounderBrief({ tenantId: args.tenantId, briefKind: args.briefKind, beforeGeneratedAt: args.generatedAtIso })
    ]);

    const previous = previousBrief
      ? {
          brief: previousBrief,
          items: await this.repository.listFounderBriefItems({ tenantId: args.tenantId, briefId: previousBrief.id })
        }
      : null;

    const sourceVersion = JSON.stringify({
      queue: queueItems.map((item) => [item.id, item.status, item.priorityScore, item.issueState, item.lastOutcomeAtIso]),
      outcomes: outcomes.map((item) => [item.id, item.outcomeType, item.outcomeStatus, item.reportedAtIso]),
      issues: issueStates.map((item) => [item.canonicalIssueKey, item.currentState, item.lastOutcomeAtIso, item.reopenCount]),
      previousBriefId: previous?.brief.id ?? null
    });

    return {
      generatedAtIso: args.generatedAtIso,
      briefDate: window.briefDate,
      windowStartAtIso: window.windowStartAtIso,
      windowEndAtIso: window.windowEndAtIso,
      queueItems: queueItems.map((item) => ({
        id: item.id,
        sourceType: item.sourceType,
        sourceId: item.sourceId,
        queueItemType: item.queueItemType,
        priorityScore: item.priorityScore,
        priorityBand: item.priorityBand,
        status: item.status,
        title: item.title,
        summary: item.summary,
        reason: item.reason,
        canonicalIssueKey: item.canonicalIssueKey,
        actionableCommandType: item.actionableCommandType,
        actionableTargetType: item.actionableTargetType,
        actionableTargetId: item.actionableTargetId,
        issueState: item.issueState,
        lastOutcomeType: item.lastOutcomeType,
        lastOutcomeStatus: item.lastOutcomeStatus,
        lastOutcomeAtIso: item.lastOutcomeAtIso,
        relatedRecordIds: item.relatedRecordIds,
        relatedRecordTypes: item.relatedRecordTypes,
        metadata: item.metadata,
        createdAtIso: item.createdAtIso
      })),
      actionLogs: actionLogs.map((item) => ({
        id: item.id,
        queueItemId: item.queueItemId,
        canonicalIssueKey: item.canonicalIssueKey,
        commandId: item.commandId,
        executionStatus: item.executionStatus,
        executedAtIso: item.executedAtIso
      })),
      outcomes: outcomes.map((item) => ({
        id: item.id,
        queueItemId: item.queueItemId,
        canonicalIssueKey: item.canonicalIssueKey,
        outcomeType: item.outcomeType,
        outcomeStatus: item.outcomeStatus,
        reportedAtIso: item.reportedAtIso,
        sourceType: item.sourceType,
        sourceId: item.sourceId,
        notes: item.notes
      })),
      issueStates: issueStates.map((item) => ({
        canonicalIssueKey: item.canonicalIssueKey,
        currentState: item.currentState,
        lastOutcomeType: item.lastOutcomeType,
        lastOutcomeStatus: item.lastOutcomeStatus,
        lastOutcomeAtIso: item.lastOutcomeAtIso,
        reopenCount: item.reopenCount,
        resolutionCount: item.resolutionCount,
        metadata: {
          wasRecentlyRejected: item.metadata.wasRecentlyRejected,
          wasRecentlyResolved: item.metadata.wasRecentlyResolved,
          hasRepeatedFailure: item.metadata.hasRepeatedFailure
        }
      })),
      strategicInsights: strategicInsights.map((item) => ({
        id: item.id,
        insightType: item.insightType,
        status: item.status,
        title: item.title,
        summary: item.summary,
        reason: item.reason,
        relatedRecordIds: item.relatedRecordIds,
        createdAtIso: item.createdAtIso
      })),
      opportunities: opportunities.map((item) => ({
        id: item.id,
        sourceType: item.source.sourceType,
        sourceId: item.source.sourceId,
        opportunityType: item.opportunityType,
        status: item.status,
        summary: item.summary,
        reason: item.reason,
        createdAtIso: item.createdAtIso
      })),
      recommendations: recommendations.filter((item) => item.status === 'active').map((item) => ({
        id: item.id,
        sourceType: item.source.sourceType,
        sourceId: item.source.sourceId,
        recommendationType: item.recommendationType,
        status: item.status,
        summary: item.summary,
        reason: item.reason,
        createdAtIso: item.createdAtIso
      })),
      notifications: notifications.map((item) => ({
        id: item.id,
        sourceType: item.source.sourceType,
        sourceId: item.source.sourceId,
        notificationType: item.notificationType,
        severity: item.severity,
        status: item.status,
        title: item.title,
        summary: item.summary,
        reason: item.reason,
        createdAtIso: item.createdAtIso
      })),
      previousBrief: previous,
      sourceVersion
    };
  }
}
