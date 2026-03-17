import { createHash } from 'node:crypto';

import type { AgentOsRepository } from '../persistence/repository.js';
import type { TimelineSourceBundle } from './timeline-types.js';

export class AaliyahTimelineSources {
  constructor(private readonly repository: AgentOsRepository) {}

  async loadBundle(args: { tenantId: string }): Promise<TimelineSourceBundle> {
    const [queueItems, actionLogs, outcomes, issueStates, briefs] = await Promise.all([
      this.repository.listOperatorQueueRecords({ tenantId: args.tenantId, limit: 250 }),
      this.repository.listOperatorActionLogs({ tenantId: args.tenantId, limit: 250 }),
      this.repository.listOutcomeFeedback({ tenantId: args.tenantId, limit: 250 }),
      this.repository.listIssueStates({ tenantId: args.tenantId, limit: 250 }),
      this.repository.listFounderBriefs({ tenantId: args.tenantId, limit: 60 })
    ]);

    const briefItemsById = new Map<string, Awaited<ReturnType<AgentOsRepository['listFounderBriefItems']>>>();
    await Promise.all(
      briefs.map(async (brief) => {
        const items = await this.repository.listFounderBriefItems({ tenantId: args.tenantId, briefId: brief.id });
        briefItemsById.set(brief.id, items);
      })
    );

    const sourceVersion = createHash('sha256')
      .update([
        queueItems.map((item) => `${item.id}:${item.evaluatedAtIso}:${item.status}`).join('|'),
        actionLogs.map((item) => `${item.id}:${item.executedAtIso}:${item.executionStatus}`).join('|'),
        outcomes.map((item) => `${item.id}:${item.reportedAtIso}:${item.outcomeType}`).join('|'),
        issueStates.map((item) => `${item.canonicalIssueKey}:${item.lastUpdatedAtIso}:${item.currentState}`).join('|'),
        briefs.map((item) => `${item.id}:${item.generatedAtIso}`).join('|')
      ].join('||'))
      .digest('hex')
      .slice(0, 16);

    return {
      queueItems,
      actionLogs,
      outcomes,
      issueStates,
      briefs: briefs.map((brief) => ({
        id: brief.id,
        briefDate: brief.briefDate,
        briefKind: brief.briefKind,
        headline: brief.headline,
        summary: brief.summary as unknown as Record<string, unknown>,
        generatedAtIso: brief.generatedAtIso,
        items: (briefItemsById.get(brief.id) ?? []).map((item) => ({
          id: item.id,
          section: item.section,
          queueItemId: item.queueItemId,
          canonicalIssueKey: item.canonicalIssueKey,
          operatorActionLogId: item.operatorActionLogId,
          outcomeFeedbackId: item.outcomeFeedbackId,
          priorityScore: item.priorityScore,
          deltaType: item.deltaType,
          payload: item.payload,
          createdAtIso: item.createdAtIso
        }))
      })),
      sourceVersion
    };
  }
}
