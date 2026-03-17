import { computeOperatorQueueStaleAfter, isOperatorQueueStale } from './operator-action-policy.js';
import { canonicalIssueKeyForComparable } from './operator-queue-canonicalization.js';
import { resolveQueueItemType } from './operator-queue-evaluator.js';
import type { AgentOsRepository } from '../persistence/repository.js';
import type { FounderBriefingMode } from './briefing-types.js';
import { AaliyahOperatorQueueSources } from './operator-queue-sources.js';
import type { OperatorQueueRecord } from './operator-queue-types.js';

export class AaliyahOperatorQueueRefreshService {
  private readonly sources: AaliyahOperatorQueueSources;

  constructor(private readonly repository: AgentOsRepository) {
    this.sources = new AaliyahOperatorQueueSources(repository);
  }

  async refreshQueueItem(args: {
    tenantId: string;
    actorId: string;
    principalContext: 'founder' | 'operator';
    mode: FounderBriefingMode;
    queueItem: OperatorQueueRecord;
    generatedAt: string;
    force?: boolean;
  }) {
    if (!args.force && !isOperatorQueueStale(args.queueItem, args.generatedAt)) {
      return { queueItem: args.queueItem, refreshed: false, invalidated: false };
    }

    const bundle = await this.sources.loadBundle({
      tenantId: args.tenantId,
      actorId: args.actorId,
      principalContext: args.principalContext,
      mode: args.mode,
      generatedAt: args.generatedAt
    });
    const comparable = this.sources.findComparableRecord(bundle, args.queueItem.sourceType, args.queueItem.sourceId);
    if (!comparable) {
      const queueItem = await this.repository.updateOperatorQueueRecord({
        tenantId: args.tenantId,
        queueItemId: args.queueItem.id,
        status: 'invalidated',
        lastRefreshedAt: args.generatedAt,
        evaluatedAt: args.generatedAt,
        staleAfterAt: computeOperatorQueueStaleAfter({
          evaluatedAtIso: args.generatedAt,
          sourceType: args.queueItem.sourceType,
          priorityBand: args.queueItem.priorityBand
        }),
        rankingVersion: args.queueItem.rankingVersion + 1
      });
      return { queueItem, refreshed: true, invalidated: true };
    }

    const queueItem = await this.repository.updateOperatorQueueRecord({
      tenantId: args.tenantId,
      queueItemId: args.queueItem.id,
      queueItemType: resolveQueueItemType(comparable),
      priorityScore: comparable.severityScore,
      priorityBand: comparable.priorityHint,
      title: comparable.title,
      summary: comparable.summary,
      reason: comparable.reason,
      status: 'active',
      canonicalIssueKey: canonicalIssueKeyForComparable(comparable),
      supersededByQueueItemId: null,
      relatedRecordIds: comparable.relatedRecordIds,
      relatedRecordTypes: comparable.relatedRecordTypes,
      actionableCommandType: comparable.actionableCommandType,
      actionableTargetType: comparable.actionableTargetType,
      actionableTargetId: comparable.actionableTargetId,
      metadata: {
        clusterKey: comparable.clusterKey,
        semanticTag: comparable.semanticTag,
        canonicalIssueKey: canonicalIssueKeyForComparable(comparable),
        ...comparable.metadata
      },
      evaluatedAt: args.generatedAt,
      staleAfterAt: computeOperatorQueueStaleAfter({
        evaluatedAtIso: args.generatedAt,
        sourceType: comparable.sourceType,
        priorityBand: comparable.priorityHint
      }),
      rankingVersion: args.queueItem.rankingVersion + 1,
      lastRefreshedAt: args.generatedAt
    });
    return { queueItem, refreshed: true, invalidated: false };
  }
}
