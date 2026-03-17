import { randomUUID } from 'node:crypto';

import type { AgentOsRepository } from '../persistence/repository.js';
import { AaliyahAccessControlService } from './access.js';
import type { FounderBriefingMode } from './briefing-types.js';
import type { AaliyahDiagnosticsService } from './diagnostics.js';
import { AaliyahTimelineAuditService } from './timeline-audit.js';
import { composeTimelineEvents } from './timeline-composer.js';
import {
  TimelineAccessDeniedError,
  TimelineInvalidModeError,
  TimelineNotFoundError,
  TimelineValidationError
} from './timeline-errors.js';
import { assertTimelineFilters, buildTimelineListMessage } from './timeline-policy.js';
import { AaliyahTimelineSources } from './timeline-sources.js';
import type { TimelineDetailResult, TimelineFilters, TimelineListResult } from './timeline-types.js';

export class AaliyahTimelineService {
  private readonly access = new AaliyahAccessControlService();
  private readonly audit: AaliyahTimelineAuditService;
  private readonly sources: AaliyahTimelineSources;

  constructor(private readonly repository: AgentOsRepository, diagnostics?: AaliyahDiagnosticsService) {
    this.audit = new AaliyahTimelineAuditService(diagnostics);
    this.sources = new AaliyahTimelineSources(repository);
  }

  async list(args: {
    tenantId: string;
    actorId: string;
    principalContext: 'founder' | 'operator';
    mode: FounderBriefingMode;
    filters: TimelineFilters;
  }): Promise<TimelineListResult> {
    try {
      this.assertFounderModeAccess(args.principalContext, args.mode);
      assertTimelineFilters(args.filters);
      const composition = await this.compose(args.tenantId, args.actorId, args.mode);
      const events = await this.repository.listTimelineEvents({ tenantId: args.tenantId, ...args.filters });
      return { ok: true, events, generatedCount: composition.generatedCount, replayedCount: composition.replayedCount, message: buildTimelineListMessage(events.length) };
    } catch (error) {
      return this.normalizeFailure(error) as TimelineListResult;
    }
  }

  async getById(args: {
    tenantId: string;
    actorId: string;
    principalContext: 'founder' | 'operator';
    mode: FounderBriefingMode;
    eventId: string;
  }): Promise<TimelineDetailResult> {
    try {
      this.assertFounderModeAccess(args.principalContext, args.mode);
      const event = await this.repository.getTimelineEventById({ tenantId: args.tenantId, eventId: args.eventId });
      if (!event) throw new TimelineNotFoundError('Timeline event was not found.');
      return { ok: true, event, message: event.title };
    } catch (error) {
      return this.normalizeFailure(error) as TimelineDetailResult;
    }
  }

  async listByIssueKey(args: {
    tenantId: string;
    actorId: string;
    principalContext: 'founder' | 'operator';
    mode: FounderBriefingMode;
    canonicalIssueKey: string;
    filters: Omit<TimelineFilters, 'canonicalIssueKey'>;
  }): Promise<TimelineListResult> {
    return this.list({
      tenantId: args.tenantId,
      actorId: args.actorId,
      principalContext: args.principalContext,
      mode: args.mode,
      filters: {
        ...args.filters,
        canonicalIssueKey: args.canonicalIssueKey
      }
    });
  }

  async listByBriefId(args: {
    tenantId: string;
    actorId: string;
    principalContext: 'founder' | 'operator';
    mode: FounderBriefingMode;
    briefId: string;
    filters: Omit<TimelineFilters, 'briefId'>;
  }): Promise<TimelineListResult> {
    return this.list({
      tenantId: args.tenantId,
      actorId: args.actorId,
      principalContext: args.principalContext,
      mode: args.mode,
      filters: {
        ...args.filters,
        briefId: args.briefId
      }
    });
  }

  async listByQueueItemId(args: {
    tenantId: string;
    actorId: string;
    principalContext: 'founder' | 'operator';
    mode: FounderBriefingMode;
    queueItemId: string;
    filters: Omit<TimelineFilters, 'queueItemId'>;
  }): Promise<TimelineListResult> {
    return this.list({
      tenantId: args.tenantId,
      actorId: args.actorId,
      principalContext: args.principalContext,
      mode: args.mode,
      filters: {
        ...args.filters,
        queueItemId: args.queueItemId
      }
    });
  }

  private async compose(tenantId: string, actorId: string, mode: FounderBriefingMode) {
    const bundle = await this.sources.loadBundle({ tenantId });
    const drafts = composeTimelineEvents(bundle);
    let generatedCount = 0;
    let replayedCount = 0;

    for (const draft of drafts) {
      const existing = await this.repository.getTimelineEventByIdempotencyKey({ tenantId, idempotencyKey: draft.idempotencyKey });
      if (existing) {
        replayedCount += 1;
        continue;
      }
      await this.repository.createTimelineEvent({
        tenantId,
        eventId: `timeline-event:${randomUUID()}`,
        eventType: draft.eventType,
        eventAt: draft.eventAtIso,
        canonicalIssueKey: draft.canonicalIssueKey,
        queueItemId: draft.queueItemId,
        operatorActionLogId: draft.operatorActionLogId,
        outcomeFeedbackId: draft.outcomeFeedbackId,
        briefId: draft.briefId,
        sourceType: draft.sourceType,
        sourceId: draft.sourceId,
        decisionClass: draft.decisionClass,
        severity: draft.severity,
        title: draft.title,
        summary: draft.summary,
        payload: draft.payload,
        idempotencyKey: draft.idempotencyKey,
        createdAt: draft.eventAtIso
      });
      generatedCount += 1;
    }

    await this.audit.record({
      eventType: generatedCount > 0 ? 'aaliyah.timeline.composed' : 'aaliyah.timeline.replayed',
      principalId: actorId,
      tenantId,
      mode,
      timestamp: new Date().toISOString(),
      metadata: {
        sourceVersion: bundle.sourceVersion,
        draftCount: drafts.length,
        generatedCount,
        replayedCount
      }
    });

    return { generatedCount, replayedCount };
  }

  private assertFounderModeAccess(principalContext: 'founder' | 'operator', mode: FounderBriefingMode) {
    try {
      this.access.assertFounderModeAccess({
        principalContext,
        activeMode: mode,
        requestedMode: mode,
        detailLevel: mode === 'founder' ? 'summary' : 'detail'
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'aaliyah_timeline_access_denied';
      if (message === 'aaliyah_principal_context_denied') throw new TimelineAccessDeniedError();
      if (message.startsWith('aaliyah_memory_boundary_denied')) throw new TimelineInvalidModeError();
      throw error;
    }
  }

  private normalizeFailure(error: unknown) {
    if (error instanceof TimelineAccessDeniedError) {
      return { ok: false, denialCode: 'ACCESS_DENIED', errorCode: null, retryable: false, message: error.message };
    }
    if (error instanceof TimelineInvalidModeError) {
      return { ok: false, denialCode: 'INVALID_MODE', errorCode: null, retryable: false, message: error.message };
    }
    if (error instanceof TimelineNotFoundError) {
      return { ok: false, denialCode: null, errorCode: 'NOT_FOUND', retryable: false, message: error.message };
    }
    if (error instanceof TimelineValidationError) {
      return { ok: false, denialCode: null, errorCode: 'INVALID_INPUT', retryable: false, message: error.message };
    }
    if (error instanceof Error && error.message.startsWith('timeline_invalid_')) {
      return { ok: false, denialCode: null, errorCode: 'INVALID_INPUT', retryable: false, message: error.message };
    }
    return { ok: false, denialCode: null, errorCode: 'INTERNAL_ERROR', retryable: true, message: error instanceof Error ? error.message : 'Timeline failed unexpectedly.' };
  }
}
