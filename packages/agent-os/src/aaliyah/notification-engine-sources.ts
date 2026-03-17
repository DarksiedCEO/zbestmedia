import {
  NotificationEngineNotFoundError,
  NotificationEngineValidationError
} from './notification-engine-errors.js';
import type { NotificationSourceBundle, NotificationSourceRef } from './notification-engine-types.js';
import type { AgentOsRepository } from '../persistence/repository.js';

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

export class AaliyahNotificationEngineSources {
  constructor(private readonly repository: AgentOsRepository) {}

  async loadSourceBundle(args: {
    tenantId: string;
    source: NotificationSourceRef;
  }): Promise<NotificationSourceBundle> {
    if (!args.source.sourceId.trim()) {
      throw new NotificationEngineValidationError('Notification source id is required.');
    }

    switch (args.source.sourceType) {
      case 'follow_through_record': {
        const record = await this.repository.getFollowThroughEngineRecordById({ tenantId: args.tenantId, recordId: args.source.sourceId });
        if (!record) {
          throw new NotificationEngineNotFoundError('Follow-through source was not found.');
        }
        const metadata = asRecord(record.metadata);
        const taskId = typeof metadata.linkedTaskId === 'string' ? metadata.linkedTaskId : record.createdArtifactIds[0] ?? null;
        const task = taskId ? await this.repository.getAaliyahTaskById({ tenantId: args.tenantId, taskId }) : null;
        return {
          source: args.source,
          followThroughRecord: {
            id: record.id,
            policyKey: record.policyKey,
            decisionType: record.decisionType,
            status: record.status,
            reason: record.reason,
            summary: record.summary,
            metadata: record.metadata,
            createdArtifactIds: record.createdArtifactIds,
            evaluatedAtIso: record.evaluatedAtIso
          },
          recommendation: null,
          task: task ? {
            id: task.id,
            title: task.title,
            status: task.status,
            priority: task.priority,
            dueAt: task.dueAt,
            updatedAt: task.updatedAt
          } : null,
          sourceVersion: `${record.id}:${record.evaluatedAtIso}:${task?.updatedAt ?? ''}`
        };
      }
      case 'recommendation': {
        const recommendation = await this.repository.getRecommendationById({ tenantId: args.tenantId, recommendationId: args.source.sourceId });
        if (!recommendation) {
          throw new NotificationEngineNotFoundError('Recommendation source was not found.');
        }
        const task = recommendation.relatedTaskId
          ? await this.repository.getAaliyahTaskById({ tenantId: args.tenantId, taskId: recommendation.relatedTaskId })
          : null;
        return {
          source: args.source,
          followThroughRecord: null,
          recommendation: {
            id: recommendation.id,
            recommendationType: recommendation.recommendationType,
            status: recommendation.status,
            reason: recommendation.reason,
            summary: recommendation.summary,
            relatedTaskId: recommendation.relatedTaskId,
            metadata: recommendation.metadata,
            evaluatedAtIso: recommendation.evaluatedAtIso
          },
          task: task ? {
            id: task.id,
            title: task.title,
            status: task.status,
            priority: task.priority,
            dueAt: task.dueAt,
            updatedAt: task.updatedAt
          } : null,
          sourceVersion: `${recommendation.id}:${recommendation.evaluatedAtIso}:${recommendation.status}:${task?.updatedAt ?? ''}`
        };
      }
      case 'task': {
        const task = await this.repository.getAaliyahTaskById({ tenantId: args.tenantId, taskId: args.source.sourceId });
        if (!task) {
          throw new NotificationEngineNotFoundError('Task source was not found.');
        }
        return {
          source: args.source,
          followThroughRecord: null,
          recommendation: null,
          task: {
            id: task.id,
            title: task.title,
            status: task.status,
            priority: task.priority,
            dueAt: task.dueAt,
            updatedAt: task.updatedAt
          },
          sourceVersion: `${task.id}:${task.updatedAt}:${task.status}:${task.priority}`
        };
      }
      case 'founder_command':
      case 'contact':
      case 'account':
        throw new NotificationEngineNotFoundError('Notification source is not yet supported for direct evaluation.');
    }
  }
}
