import { randomUUID } from 'node:crypto';

import type { AgentOsRepository } from '../persistence/repository.js';
import { AaliyahAccessControlService } from './access.js';
import type { FounderBriefingMode } from './briefing-types.js';
import type { AaliyahDiagnosticsService } from './diagnostics.js';
import { AaliyahFounderPreferencesAuditService } from './founder-preferences-audit.js';
import { DEFAULT_FOUNDER_PREFERENCES } from './founder-preferences-defaults.js';
import {
  FounderPreferencesAccessDeniedError,
  FounderPreferencesInternalError,
  FounderPreferencesInvalidModeError,
  FounderPreferencesValidationError
} from './founder-preferences-errors.js';
import {
  normalizeFounderPreferencesInput,
  validateFounderPreferences
} from './founder-preferences-policy.js';
import { AaliyahFounderPreferencesResolver, mergeFounderPreferences } from './founder-preferences-resolver.js';
import { buildFounderPreferencesMessage } from './founder-preferences-summary.js';
import type {
  FounderPreferencesFailureResult,
  FounderPreferencesInput,
  FounderPreferencesResult
} from './founder-preferences-types.js';

export class AaliyahFounderPreferencesService {
  private readonly access = new AaliyahAccessControlService();
  private readonly audit: AaliyahFounderPreferencesAuditService;
  readonly resolver: AaliyahFounderPreferencesResolver;

  constructor(
    private readonly repository: AgentOsRepository,
    diagnostics?: AaliyahDiagnosticsService
  ) {
    this.audit = new AaliyahFounderPreferencesAuditService(diagnostics);
    this.resolver = new AaliyahFounderPreferencesResolver(repository);
  }

  async get(args: {
    tenantId: string;
    actorId: string;
    principalContext: 'founder' | 'operator';
    mode: FounderBriefingMode;
    generatedAt?: string;
  }): Promise<FounderPreferencesResult> {
    const generatedAt = args.generatedAt ?? new Date().toISOString();
    try {
      this.assertFounderModeAccess(args.principalContext, args.mode);
      const preferences = await this.resolver.resolve({
        tenantId: args.tenantId,
        actorUserId: args.actorId,
        generatedAt
      });
      await this.audit.record({
        eventType: 'aaliyah.founder_preferences.resolved',
        principalId: args.actorId,
        tenantId: args.tenantId,
        mode: args.mode,
        timestamp: generatedAt,
        metadata: {
          preferencesId: preferences.id,
          usedDefaults: preferences.id === 'founder-preferences:default'
        }
      });
      return { ok: true, preferences, message: buildFounderPreferencesMessage(false) };
    } catch (error) {
      return this.normalizeFailure(error);
    }
  }

  async put(args: {
    tenantId: string;
    actorId: string;
    principalContext: 'founder' | 'operator';
    mode: FounderBriefingMode;
    input: FounderPreferencesInput;
    generatedAt?: string;
  }): Promise<FounderPreferencesResult> {
    const generatedAt = args.generatedAt ?? new Date().toISOString();
    try {
      this.assertFounderModeAccess(args.principalContext, args.mode);
      const normalized = normalizeFounderPreferencesInput(args.input);
      const existing = await this.repository.getFounderPreferenceControls({ tenantId: args.tenantId });
      const merged = mergeFounderPreferences({
        tenantId: args.tenantId,
        actorUserId: args.actorId,
        existing,
        input: normalized,
        timestamp: generatedAt
      });
      validateFounderPreferences(merged);

      const preferences = await this.repository.upsertFounderPreferenceControls({
        tenantId: args.tenantId,
        preferencesId: existing?.id ?? `founder-preference-controls:${randomUUID()}`,
        actorUserId: args.actorId,
        notification: merged.notification,
        digest: merged.digest,
        opportunity: merged.opportunity,
        recommendation: merged.recommendation,
        scheduler: merged.scheduler,
        delivery: merged.delivery,
        escalation: merged.escalation,
        createdAt: existing?.createdAtIso ?? generatedAt,
        updatedAt: generatedAt
      });

      await this.audit.record({
        eventType: 'aaliyah.founder_preferences.updated',
        principalId: args.actorId,
        tenantId: args.tenantId,
        mode: args.mode,
        timestamp: generatedAt,
        metadata: {
          preferencesId: preferences.id,
          notification: preferences.notification,
          digest: preferences.digest,
          opportunity: preferences.opportunity,
          recommendation: preferences.recommendation,
          scheduler: preferences.scheduler,
          delivery: preferences.delivery,
          escalation: preferences.escalation
        }
      });

      return { ok: true, preferences, message: buildFounderPreferencesMessage(true) };
    } catch (error) {
      return this.normalizeFailure(error);
    }
  }

  getDefaults() {
    return DEFAULT_FOUNDER_PREFERENCES;
  }

  private assertFounderModeAccess(principalContext: 'founder' | 'operator', mode: FounderBriefingMode) {
    try {
      this.access.assertFounderPrincipal(principalContext);
    } catch {
      throw new FounderPreferencesAccessDeniedError();
    }
    try {
      this.access.assertModeAccess({
        activeMode: mode,
        requestedMode: mode,
        detailLevel: mode === 'founder' ? 'summary' : 'detail'
      });
    } catch {
      throw new FounderPreferencesInvalidModeError();
    }
  }

  private normalizeFailure(errorValue: unknown): FounderPreferencesFailureResult {
    const error = errorValue instanceof Error ? errorValue : new FounderPreferencesInternalError();
    return error instanceof FounderPreferencesAccessDeniedError || error.message === 'aaliyah_principal_context_denied'
      ? { ok: false as const, denialCode: 'ACCESS_DENIED', errorCode: null, retryable: false, message: 'Founder access is required for founder preferences.' }
      : error instanceof FounderPreferencesInvalidModeError || error.message.startsWith('aaliyah_memory_boundary_denied')
        ? { ok: false as const, denialCode: 'INVALID_MODE', errorCode: null, retryable: false, message: 'Mode is not allowed for founder preferences.' }
        : error instanceof FounderPreferencesValidationError
          ? { ok: false as const, denialCode: null, errorCode: 'INVALID_INPUT', retryable: false, message: error.message }
        : { ok: false as const, denialCode: null, errorCode: 'INTERNAL_ERROR', retryable: false, message: 'Founder preferences failed.' };
  }
}
