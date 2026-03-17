import { randomUUID } from 'node:crypto';

import { AaliyahAccessControlService } from './access.js';
import type { FounderBriefingMode } from './briefing-types.js';
import type { AaliyahDiagnosticsService } from './diagnostics.js';
import { AaliyahSignalCoalescingAuditService } from './signal-coalescing-audit.js';
import {
  SignalCoalescingAccessDeniedError,
  SignalCoalescingConflictError,
  SignalCoalescingInternalError,
  SignalCoalescingInvalidModeError,
  SignalCoalescingNotFoundError
} from './signal-coalescing-errors.js';
import { evaluateSignalCoalescing } from './signal-coalescing-evaluator.js';
import { buildCoalescedSignalListMessage } from './signal-coalescing-policy.js';
import { AaliyahSignalCoalescingSources } from './signal-coalescing-sources.js';
import { buildCoalescedSignalMessage } from './signal-coalescing-summary.js';
import type {
  CoalescedSignalDetailResult,
  CoalescedSignalFailureResult,
  CoalescedSignalListResult,
  CoalescedSignalResult
} from './signal-coalescing-types.js';
import type { AgentOsRepository } from '../persistence/repository.js';

export class AaliyahSignalCoalescingService {
  private readonly access = new AaliyahAccessControlService();
  private readonly audit: AaliyahSignalCoalescingAuditService;
  private readonly sources: AaliyahSignalCoalescingSources;

  constructor(private readonly repository: AgentOsRepository, diagnostics?: AaliyahDiagnosticsService) {
    this.audit = new AaliyahSignalCoalescingAuditService(diagnostics);
    this.sources = new AaliyahSignalCoalescingSources(repository);
  }

  async evaluate(args: {
    tenantId: string;
    actorId: string;
    principalContext: 'founder' | 'operator';
    mode: FounderBriefingMode;
    generatedAt?: string;
  }): Promise<CoalescedSignalResult> {
    const generatedAt = args.generatedAt ?? new Date().toISOString();
    try {
      this.assertFounderModeAccess(args.principalContext, args.mode);
      const bundle = await this.sources.loadBundle({ ...args, generatedAt });
      const drafts = evaluateSignalCoalescing({ bundle, evaluatedAtIso: generatedAt });
      if (drafts.length === 0) {
        await this.audit.record({
          eventType: 'aaliyah.signal_coalescing.noop',
          principalId: args.actorId,
          tenantId: args.tenantId,
          mode: args.mode,
          timestamp: generatedAt,
          metadata: { recordCount: bundle.records.length }
        });
        return { ok: true, signals: [], replayedCount: 0, message: 'No priority clusters qualified for persistence.' };
      }

      const signals = [] as Awaited<ReturnType<AgentOsRepository['createCoalescedSignal']>>[];
      let replayedCount = 0;
      for (const draft of drafts) {
        const existing = await this.repository.getCoalescedSignalByIdempotencyKey({
          tenantId: args.tenantId,
          idempotencyKey: draft.idempotencyKey
        });
        if (existing) {
          replayedCount += 1;
          signals.push(existing);
          await this.audit.record({
            eventType: 'aaliyah.signal_coalescing.replayed',
            principalId: args.actorId,
            tenantId: args.tenantId,
            mode: args.mode,
            timestamp: generatedAt,
            metadata: this.audit.buildMetadata({
              signalId: existing.id,
              signalType: existing.signalType,
              idempotencyKey: existing.idempotencyKey,
              sourceRecordIds: existing.sourceRecordIds,
              sourceRecordTypes: existing.sourceRecordTypes,
              dominantSourceType: existing.dominantSourceType,
              suppressedRecordIds: existing.suppressedRecordIds,
              reason: existing.reason,
              summary: existing.summary,
              replayed: true
            })
          });
          continue;
        }

        const signalId = `coalesced-signal:${randomUUID()}`;
        const auditEventId = await this.audit.record({
          eventType: 'aaliyah.signal_coalescing.created',
          principalId: args.actorId,
          tenantId: args.tenantId,
          mode: args.mode,
          timestamp: generatedAt,
          metadata: this.audit.buildMetadata({
            signalId,
            signalType: draft.signalType,
            idempotencyKey: draft.idempotencyKey,
            sourceRecordIds: draft.sourceRecordIds,
            sourceRecordTypes: draft.sourceRecordTypes,
            dominantSourceType: draft.dominantSourceType,
            suppressedRecordIds: draft.suppressedRecordIds,
            reason: draft.reason,
            summary: draft.summary,
            replayed: false
          })
        });

        const created = await this.repository.createCoalescedSignal({
          tenantId: args.tenantId,
          signalId,
          signalType: draft.signalType,
          signalStatus: draft.status,
          title: draft.title,
          summary: draft.summary,
          reason: draft.reason,
          idempotencyKey: draft.idempotencyKey,
          sourceRecordIds: draft.sourceRecordIds,
          sourceRecordTypes: draft.sourceRecordTypes,
          dominantSourceType: draft.dominantSourceType,
          suppressedRecordIds: draft.suppressedRecordIds,
          metadata: draft.metadata,
          auditEventId,
          createdAt: generatedAt,
          evaluatedAt: draft.evaluatedAtIso
        });
        signals.push(created);
      }

      return {
        ok: true,
        signals,
        replayedCount,
        message: buildCoalescedSignalMessage(signals.length, replayedCount)
      };
    } catch (error) {
      return this.normalizeFailure(error);
    }
  }

  async getById(args: {
    tenantId: string;
    actorId: string;
    principalContext: 'founder' | 'operator';
    mode: FounderBriefingMode;
    signalId: string;
  }): Promise<CoalescedSignalDetailResult> {
    try {
      this.assertFounderModeAccess(args.principalContext, args.mode);
      const signal = await this.repository.getCoalescedSignalById({ tenantId: args.tenantId, signalId: args.signalId });
      if (!signal) {
        throw new SignalCoalescingNotFoundError('Priority cluster was not found.');
      }
      return { ok: true, signal, message: signal.summary };
    } catch (error) {
      return this.normalizeFailure(error);
    }
  }

  async list(args: {
    tenantId: string;
    actorId: string;
    principalContext: 'founder' | 'operator';
    mode: FounderBriefingMode;
    limit?: number;
    status?: 'active' | 'acknowledged' | 'dismissed' | 'resolved';
  }): Promise<CoalescedSignalListResult> {
    try {
      this.assertFounderModeAccess(args.principalContext, args.mode);
      const signals = await this.repository.listCoalescedSignals({
        tenantId: args.tenantId,
        limit: args.limit,
        status: args.status
      });
      return { ok: true, signals, message: buildCoalescedSignalListMessage(signals.length) };
    } catch (error) {
      return this.normalizeFailure(error);
    }
  }

  async acknowledge(args: {
    tenantId: string;
    actorId: string;
    principalContext: 'founder' | 'operator';
    mode: FounderBriefingMode;
    signalId: string;
    generatedAt?: string;
  }): Promise<CoalescedSignalDetailResult> {
    return this.transition({ ...args, nextStatus: 'acknowledged', eventType: 'aaliyah.signal_coalescing.acknowledged' });
  }

  async dismiss(args: {
    tenantId: string;
    actorId: string;
    principalContext: 'founder' | 'operator';
    mode: FounderBriefingMode;
    signalId: string;
    generatedAt?: string;
  }): Promise<CoalescedSignalDetailResult> {
    return this.transition({ ...args, nextStatus: 'dismissed', eventType: 'aaliyah.signal_coalescing.dismissed' });
  }

  private async transition(args: {
    tenantId: string;
    actorId: string;
    principalContext: 'founder' | 'operator';
    mode: FounderBriefingMode;
    signalId: string;
    nextStatus: 'acknowledged' | 'dismissed';
    eventType: 'aaliyah.signal_coalescing.acknowledged' | 'aaliyah.signal_coalescing.dismissed';
    generatedAt?: string;
  }): Promise<CoalescedSignalDetailResult> {
    const generatedAt = args.generatedAt ?? new Date().toISOString();
    try {
      this.assertFounderModeAccess(args.principalContext, args.mode);
      const existing = await this.repository.getCoalescedSignalById({ tenantId: args.tenantId, signalId: args.signalId });
      if (!existing) {
        throw new SignalCoalescingNotFoundError('Priority cluster was not found.');
      }
      if (existing.status === args.nextStatus) {
        return { ok: true, signal: existing, message: existing.summary };
      }
      if (existing.status !== 'active') {
        throw new SignalCoalescingConflictError('Priority cluster has already been resolved.');
      }
      const signal = await this.repository.updateCoalescedSignalStatus({
        tenantId: args.tenantId,
        signalId: args.signalId,
        status: args.nextStatus,
        changedAt: generatedAt
      });
      await this.audit.record({
        eventType: args.eventType,
        principalId: args.actorId,
        tenantId: args.tenantId,
        mode: args.mode,
        timestamp: generatedAt,
        metadata: this.audit.buildMetadata({
          signalId: signal.id,
          signalType: signal.signalType,
          idempotencyKey: signal.idempotencyKey,
          sourceRecordIds: signal.sourceRecordIds,
          sourceRecordTypes: signal.sourceRecordTypes,
          dominantSourceType: signal.dominantSourceType,
          suppressedRecordIds: signal.suppressedRecordIds,
          reason: signal.reason,
          summary: signal.summary,
          replayed: false
        })
      });
      return { ok: true, signal, message: signal.summary };
    } catch (error) {
      return this.normalizeFailure(error);
    }
  }

  private assertFounderModeAccess(principalContext: 'founder' | 'operator', mode: FounderBriefingMode) {
    try {
      this.access.assertFounderPrincipal(principalContext);
    } catch {
      throw new SignalCoalescingAccessDeniedError();
    }
    try {
      this.access.assertModeAccess({
        activeMode: mode,
        requestedMode: mode,
        detailLevel: mode === 'founder' ? 'summary' : 'detail'
      });
    } catch {
      throw new SignalCoalescingInvalidModeError();
    }
  }

  private normalizeFailure(errorValue: unknown): CoalescedSignalFailureResult {
    const error = errorValue instanceof Error ? errorValue : new SignalCoalescingInternalError();
    if (error instanceof SignalCoalescingAccessDeniedError || error.message === 'aaliyah_principal_context_denied') {
      return { ok: false, denialCode: 'ACCESS_DENIED', errorCode: null, retryable: false, message: 'Founder access is required for priority clusters.' };
    }
    if (error instanceof SignalCoalescingInvalidModeError || error.message.startsWith('aaliyah_memory_boundary_denied')) {
      return { ok: false, denialCode: 'INVALID_MODE', errorCode: null, retryable: false, message: 'Mode is not allowed for priority clusters.' };
    }
    if (error instanceof SignalCoalescingNotFoundError) {
      return { ok: false, denialCode: null, errorCode: 'NOT_FOUND', retryable: false, message: error.message };
    }
    if (error instanceof SignalCoalescingConflictError) {
      return { ok: false, denialCode: null, errorCode: 'CONFLICT', retryable: false, message: error.message };
    }
    return { ok: false, denialCode: null, errorCode: 'INTERNAL_ERROR', retryable: false, message: 'Signal coalescing failed.' };
  }
}
