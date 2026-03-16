import { AaliyahAccessControlService } from "./access.js";
import type { AaliyahDiagnosticsService } from "./diagnostics.js";
import type { FounderBriefingMode } from "./briefing-types.js";
import type { AgentOsRepository } from "../persistence/repository.js";
import type { EmailAccountConnectionRecord } from "../persistence/contracts.js";
import {
  AaliyahCalendarAccessDeniedError,
  AaliyahCalendarInternalError,
  AaliyahCalendarInvalidModeError,
  AaliyahCalendarProviderDisabledError,
  AaliyahCalendarProviderRejectedError,
  AaliyahCalendarProviderUnavailableError,
  AaliyahCalendarValidationError
} from "./calendar-errors.js";
import {
  DryRunGoogleCalendarProvider,
  GoogleWorkspaceCalendarProvider,
  type GoogleCalendarProvider
} from "./calendar-google.js";
import { AaliyahCalendarAuditService } from "./calendar-audit.js";
import type {
  AaliyahCalendarAvailabilityFailureResult,
  AaliyahCalendarAvailabilityInput,
  AaliyahCalendarAvailabilityResult,
  AaliyahCalendarAvailabilitySuccessResult,
  AaliyahCalendarCreateEventFailureResult,
  AaliyahCalendarCreateEventInput,
  AaliyahCalendarCreateEventResult,
  AaliyahCalendarCreateEventSuccessResult
} from "./calendar-types.js";

const MAX_AVAILABILITY_WINDOW_DAYS = 14;
const MAX_EVENT_DURATION_HOURS = 8;
const DEFAULT_DURATION_MINUTES = 30;

export type AaliyahCalendarServiceConfig = {
  enabled: boolean;
  dryRunDefault: boolean;
};

export function loadAaliyahCalendarConfig(raw: NodeJS.ProcessEnv = process.env): AaliyahCalendarServiceConfig {
  return {
    enabled: raw.AILIYAH_CALENDAR_ENABLED === "true",
    dryRunDefault: raw.AILIYAH_CALENDAR_DRY_RUN_DEFAULT !== "false"
  };
}

export class AaliyahCalendarService {
  private readonly access = new AaliyahAccessControlService();
  private readonly audit: AaliyahCalendarAuditService;
  private readonly liveProvider: GoogleCalendarProvider;
  private readonly dryRunProvider: GoogleCalendarProvider;
  private readonly config: AaliyahCalendarServiceConfig;

  constructor(
    private readonly repository: AgentOsRepository,
    diagnostics?: AaliyahDiagnosticsService,
    args?: {
      config?: AaliyahCalendarServiceConfig;
      liveProvider?: GoogleCalendarProvider;
      dryRunProvider?: GoogleCalendarProvider;
    }
  ) {
    this.config = args?.config ?? loadAaliyahCalendarConfig();
    this.audit = new AaliyahCalendarAuditService(diagnostics);
    this.liveProvider = args?.liveProvider ?? new GoogleWorkspaceCalendarProvider();
    this.dryRunProvider = args?.dryRunProvider ?? new DryRunGoogleCalendarProvider();
  }

  async getAvailability(args: {
    tenantId: string;
    actorId: string;
    principalContext: "founder" | "operator";
    mode: FounderBriefingMode;
    input: AaliyahCalendarAvailabilityInput;
    generatedAt?: string;
  }): Promise<AaliyahCalendarAvailabilityResult> {
    const generatedAt = args.generatedAt ?? new Date().toISOString();
    const dryRun = args.input.dryRun ?? this.config.dryRunDefault;

    await this.audit.record({
      eventType: "aaliyah.calendar.availability.requested",
      principalId: args.actorId,
      tenantId: args.tenantId,
      mode: args.mode,
      provider: "google_calendar",
      timestamp: generatedAt,
      metadata: this.audit.buildAvailabilityMetadata({
        input: { ...args.input, dryRun }
      })
    });

    try {
      this.assertFounderModeAccess(args.principalContext, args.mode);
      this.validateAvailabilityInput(args.input);
      if (!this.config.enabled) {
        throw new AaliyahCalendarProviderDisabledError();
      }
      const account = dryRun ? null : await this.requireConnectedAccount(args.tenantId, args.actorId);
      const provider = dryRun ? this.dryRunProvider : this.liveProvider;
      const slots = await provider.getAvailability({
        input: { ...args.input, dryRun },
        account: account ?? this.buildDryRunAccount(args.actorId)
      });
      const result: AaliyahCalendarAvailabilitySuccessResult = {
        ok: true,
        provider: "google_calendar",
        dryRun,
        slots,
        message: dryRun ? "Availability simulated successfully." : "Availability resolved successfully."
      };
      await this.audit.record({
        eventType: "aaliyah.calendar.availability.resolved",
        principalId: args.actorId,
        tenantId: args.tenantId,
        mode: args.mode,
        provider: "google_calendar",
        timestamp: generatedAt,
        metadata: this.audit.buildAvailabilityMetadata({
          input: { ...args.input, dryRun },
          accountId: account?.accountId ?? null,
          slotCount: slots.length,
          resultCode: "ok"
        })
      });
      return result;
    } catch (error) {
      return this.normalizeAvailabilityFailure({
        tenantId: args.tenantId,
        actorId: args.actorId,
        mode: args.mode,
        input: { ...args.input, dryRun },
        generatedAt,
        error
      });
    }
  }

  async createEvent(args: {
    tenantId: string;
    actorId: string;
    principalContext: "founder" | "operator";
    mode: FounderBriefingMode;
    input: AaliyahCalendarCreateEventInput;
    generatedAt?: string;
  }): Promise<AaliyahCalendarCreateEventResult> {
    const generatedAt = args.generatedAt ?? new Date().toISOString();
    const dryRun = args.input.dryRun ?? this.config.dryRunDefault;

    await this.audit.record({
      eventType: "aaliyah.calendar.event.requested",
      principalId: args.actorId,
      tenantId: args.tenantId,
      mode: args.mode,
      provider: "google_calendar",
      timestamp: generatedAt,
      metadata: this.audit.buildEventMetadata({
        input: { ...args.input, dryRun }
      })
    });

    try {
      this.assertFounderModeAccess(args.principalContext, args.mode);
      this.validateEventInput(args.input);
      if (!this.config.enabled) {
        throw new AaliyahCalendarProviderDisabledError();
      }
      const account = dryRun ? null : await this.requireConnectedAccount(args.tenantId, args.actorId);
      const provider = dryRun ? this.dryRunProvider : this.liveProvider;
      const created = await provider.createEvent({
        input: { ...args.input, dryRun },
        account: account ?? this.buildDryRunAccount(args.actorId)
      });
      const result: AaliyahCalendarCreateEventSuccessResult = {
        ok: true,
        provider: "google_calendar",
        dryRun,
        eventId: created.eventId,
        externalId: created.externalId ?? null,
        message: dryRun ? "Calendar event simulated successfully." : "Calendar event created successfully."
      };
      await this.audit.record({
        eventType: "aaliyah.calendar.event.created",
        principalId: args.actorId,
        tenantId: args.tenantId,
        mode: args.mode,
        provider: "google_calendar",
        timestamp: generatedAt,
        metadata: this.audit.buildEventMetadata({
          input: { ...args.input, dryRun },
          accountId: account?.accountId ?? null,
          resultCode: "ok"
        })
      });
      return result;
    } catch (error) {
      return this.normalizeEventFailure({
        tenantId: args.tenantId,
        actorId: args.actorId,
        mode: args.mode,
        input: { ...args.input, dryRun },
        generatedAt,
        error
      });
    }
  }

  private assertFounderModeAccess(principalContext: "founder" | "operator", mode: FounderBriefingMode) {
    this.access.assertFounderPrincipal(principalContext);
    try {
      this.access.assertModeAccess({
        activeMode: mode,
        requestedMode: mode,
        detailLevel: mode === "founder" ? "summary" : "detail"
      });
    } catch {
      throw new AaliyahCalendarInvalidModeError();
    }
  }

  private validateAvailabilityInput(input: AaliyahCalendarAvailabilityInput) {
    const start = Date.parse(input.startIso);
    const end = Date.parse(input.endIso);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      throw new AaliyahCalendarValidationError("Availability range is invalid.");
    }
    if (!input.timezone.trim()) {
      throw new AaliyahCalendarValidationError("Timezone is required.");
    }
    const maxEnd = start + MAX_AVAILABILITY_WINDOW_DAYS * 24 * 60 * 60 * 1000;
    if (end > maxEnd) {
      throw new AaliyahCalendarValidationError("Availability range exceeds the maximum supported window.");
    }
    const duration = input.durationMinutes ?? DEFAULT_DURATION_MINUTES;
    if (!Number.isInteger(duration) || duration <= 0 || duration > 8 * 60) {
      throw new AaliyahCalendarValidationError("Availability durationMinutes is invalid.");
    }
  }

  private validateEventInput(input: AaliyahCalendarCreateEventInput) {
    if (!input.title.trim()) {
      throw new AaliyahCalendarValidationError("Event title is required.");
    }
    const start = Date.parse(input.startIso);
    const end = Date.parse(input.endIso);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      throw new AaliyahCalendarValidationError("Event time range is invalid.");
    }
    if (!input.timezone.trim()) {
      throw new AaliyahCalendarValidationError("Timezone is required.");
    }
    if (end - start > MAX_EVENT_DURATION_HOURS * 60 * 60 * 1000) {
      throw new AaliyahCalendarValidationError("Event duration exceeds the supported limit.");
    }
    if (input.attendees?.some((email) => !this.isValidEmail(email))) {
      throw new AaliyahCalendarValidationError("All attendee emails must be valid.");
    }
  }

  private async requireConnectedAccount(tenantId: string, actorId: string): Promise<EmailAccountConnectionRecord> {
    const account = await this.repository.getLatestConnectedEmailAccountByPrincipal({
      tenantId,
      principalId: actorId,
      provider: "gmail"
    });
    if (!account) {
      throw new AaliyahCalendarProviderUnavailableError("No connected Google account is available for this founder.");
    }
    return account;
  }

  private async normalizeAvailabilityFailure(args: {
    tenantId: string;
    actorId: string;
    mode: FounderBriefingMode;
    generatedAt: string;
    input: AaliyahCalendarAvailabilityInput;
    error: unknown;
  }): Promise<AaliyahCalendarAvailabilityFailureResult> {
    const error = args.error instanceof Error ? args.error : new AaliyahCalendarInternalError();
    const result =
      error instanceof AaliyahCalendarAccessDeniedError || error.message === "aaliyah_principal_context_denied"
        ? this.deniedAvailabilityResult(args.input, "ACCESS_DENIED", "Founder access is required for Calendar actions.")
        : error instanceof AaliyahCalendarInvalidModeError || error.message.startsWith("aaliyah_memory_boundary_denied")
          ? this.deniedAvailabilityResult(args.input, "INVALID_MODE", "Mode is not allowed for Calendar actions.")
          : error instanceof AaliyahCalendarProviderDisabledError
            ? this.deniedAvailabilityResult(args.input, "PROVIDER_DISABLED", "Calendar integration is disabled.")
            : error instanceof AaliyahCalendarValidationError
              ? this.failedAvailabilityResult(args.input, "INVALID_INPUT", "Calendar input failed validation.")
              : error instanceof AaliyahCalendarProviderUnavailableError
                ? this.failedAvailabilityResult(args.input, "PROVIDER_UNAVAILABLE", "Calendar provider is unavailable.")
                : error instanceof AaliyahCalendarProviderRejectedError
                  ? this.failedAvailabilityResult(args.input, "PROVIDER_REJECTED", "Calendar provider rejected the request.")
                  : this.failedAvailabilityResult(args.input, "INTERNAL_ERROR", "Calendar request failed.");

    await this.audit.record({
      eventType: result.denialCode ? "aaliyah.calendar.availability.denied" : "aaliyah.calendar.availability.failed",
      principalId: args.actorId,
      tenantId: args.tenantId,
      mode: args.mode,
      provider: "google_calendar",
      timestamp: args.generatedAt,
      metadata: this.audit.buildAvailabilityMetadata({
        input: args.input,
        resultCode: error.message
      })
    });

    return result;
  }

  private async normalizeEventFailure(args: {
    tenantId: string;
    actorId: string;
    mode: FounderBriefingMode;
    generatedAt: string;
    input: AaliyahCalendarCreateEventInput;
    error: unknown;
  }): Promise<AaliyahCalendarCreateEventFailureResult> {
    const error = args.error instanceof Error ? args.error : new AaliyahCalendarInternalError();
    const result =
      error instanceof AaliyahCalendarAccessDeniedError || error.message === "aaliyah_principal_context_denied"
        ? this.deniedEventResult(args.input, "ACCESS_DENIED", "Founder access is required for Calendar actions.")
        : error instanceof AaliyahCalendarInvalidModeError || error.message.startsWith("aaliyah_memory_boundary_denied")
          ? this.deniedEventResult(args.input, "INVALID_MODE", "Mode is not allowed for Calendar actions.")
          : error instanceof AaliyahCalendarProviderDisabledError
            ? this.deniedEventResult(args.input, "PROVIDER_DISABLED", "Calendar integration is disabled.")
            : error instanceof AaliyahCalendarValidationError
              ? this.failedEventResult(args.input, "INVALID_INPUT", "Calendar input failed validation.")
              : error instanceof AaliyahCalendarProviderUnavailableError
                ? this.failedEventResult(args.input, "PROVIDER_UNAVAILABLE", "Calendar provider is unavailable.")
                : error instanceof AaliyahCalendarProviderRejectedError
                  ? this.failedEventResult(args.input, "PROVIDER_REJECTED", "Calendar provider rejected the request.")
                  : this.failedEventResult(args.input, "INTERNAL_ERROR", "Calendar request failed.");

    await this.audit.record({
      eventType: result.denialCode ? "aaliyah.calendar.event.denied" : "aaliyah.calendar.event.failed",
      principalId: args.actorId,
      tenantId: args.tenantId,
      mode: args.mode,
      provider: "google_calendar",
      timestamp: args.generatedAt,
      metadata: this.audit.buildEventMetadata({
        input: args.input,
        resultCode: error.message
      })
    });

    return result;
  }

  private deniedAvailabilityResult(
    input: AaliyahCalendarAvailabilityInput,
    denialCode: "ACCESS_DENIED" | "INVALID_MODE" | "PROVIDER_DISABLED",
    message: string
  ): AaliyahCalendarAvailabilityFailureResult {
    return {
      ok: false,
      provider: "google_calendar",
      dryRun: Boolean(input.dryRun),
      denialCode,
      errorCode: null,
      retryable: false,
      message
    };
  }

  private failedAvailabilityResult(
    input: AaliyahCalendarAvailabilityInput,
    errorCode: "INVALID_INPUT" | "PROVIDER_UNAVAILABLE" | "PROVIDER_REJECTED" | "INTERNAL_ERROR",
    message: string
  ): AaliyahCalendarAvailabilityFailureResult {
    return {
      ok: false,
      provider: "google_calendar",
      dryRun: Boolean(input.dryRun),
      denialCode: null,
      errorCode,
      retryable: false,
      message
    };
  }

  private deniedEventResult(
    input: AaliyahCalendarCreateEventInput,
    denialCode: "ACCESS_DENIED" | "INVALID_MODE" | "PROVIDER_DISABLED",
    message: string
  ): AaliyahCalendarCreateEventFailureResult {
    return {
      ok: false,
      provider: "google_calendar",
      dryRun: Boolean(input.dryRun),
      denialCode,
      errorCode: null,
      retryable: false,
      message
    };
  }

  private failedEventResult(
    input: AaliyahCalendarCreateEventInput,
    errorCode: "INVALID_INPUT" | "PROVIDER_UNAVAILABLE" | "PROVIDER_REJECTED" | "INTERNAL_ERROR",
    message: string
  ): AaliyahCalendarCreateEventFailureResult {
    return {
      ok: false,
      provider: "google_calendar",
      dryRun: Boolean(input.dryRun),
      denialCode: null,
      errorCode,
      retryable: false,
      message
    };
  }

  private isValidEmail(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  private buildDryRunAccount(actorId: string): EmailAccountConnectionRecord {
    const now = new Date().toISOString();
    return {
      tenantId: "00000000-0000-4000-8000-000000000000",
      accountId: "email-account:dryrun",
      provider: "gmail",
      principalId: actorId,
      accountEmailAddress: "founder@zbestmedia.com",
      connectionStatus: "connected",
      grantedScopes: [],
      tokenReference: "dryrun",
      externalAccountId: "dryrun",
      draftOnlyMode: true,
      processingEnabled: false,
      processingMode: "poll",
      maxBatchThreads: 1,
      allowedLabelIds: [],
      oauthState: null,
      oauthStateExpiresAt: null,
      lastProcessedAt: null,
      lastError: null,
      createdAt: now,
      updatedAt: now
    };
  }
}
