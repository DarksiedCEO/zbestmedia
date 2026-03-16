import { AaliyahAccessControlService } from "./access.js";
import type { AaliyahDiagnosticsService } from "./diagnostics.js";
import type { FounderBriefingMode } from "./briefing-types.js";
import type { AgentOsRepository } from "../persistence/repository.js";
import type { EmailAccountConnectionRecord } from "../persistence/contracts.js";
import {
  AaliyahWorkspaceAccessDeniedError,
  AaliyahWorkspaceInternalError,
  AaliyahWorkspaceInvalidModeError,
  AaliyahWorkspaceProviderDisabledError,
  AaliyahWorkspaceProviderRejectedError,
  AaliyahWorkspaceProviderUnavailableError,
  AaliyahWorkspaceValidationError
} from "./workspace-errors.js";
import {
  DryRunGmailDraftProvider,
  GoogleWorkspaceGmailDraftProvider,
  type GmailDraftProvider
} from "./workspace-gmail.js";
import { AaliyahWorkspaceAuditService } from "./workspace-audit.js";
import type { AaliyahDraftEmailInput, AaliyahDraftEmailResult } from "./workspace-types.js";

export type AaliyahWorkspaceServiceConfig = {
  gmailDraftsEnabled: boolean;
  gmailDryRunDefault: boolean;
};

export function loadAaliyahWorkspaceConfig(raw: NodeJS.ProcessEnv = process.env): AaliyahWorkspaceServiceConfig {
  return {
    gmailDraftsEnabled: raw.AILIYAH_GMAIL_DRAFTS_ENABLED === "true",
    gmailDryRunDefault: raw.AILIYAH_GMAIL_DRY_RUN_DEFAULT !== "false"
  };
}

export class AaliyahWorkspaceService {
  private readonly access = new AaliyahAccessControlService();
  private readonly audit: AaliyahWorkspaceAuditService;
  private readonly dryRunProvider: GmailDraftProvider;
  private readonly gmailProvider: GmailDraftProvider;
  private readonly config: AaliyahWorkspaceServiceConfig;

  constructor(
    private readonly repository: AgentOsRepository,
    diagnostics?: AaliyahDiagnosticsService,
    args?: {
      config?: AaliyahWorkspaceServiceConfig;
      dryRunProvider?: GmailDraftProvider;
      gmailProvider?: GmailDraftProvider;
    }
  ) {
    this.config = args?.config ?? loadAaliyahWorkspaceConfig();
    this.audit = new AaliyahWorkspaceAuditService(diagnostics);
    this.dryRunProvider = args?.dryRunProvider ?? new DryRunGmailDraftProvider();
    this.gmailProvider = args?.gmailProvider ?? new GoogleWorkspaceGmailDraftProvider();
  }

  async createGmailDraft(args: {
    tenantId: string;
    actorId: string;
    principalContext: "founder" | "operator";
    mode: FounderBriefingMode;
    input: AaliyahDraftEmailInput;
    generatedAt?: string;
  }): Promise<AaliyahDraftEmailResult> {
    const generatedAt = args.generatedAt ?? new Date().toISOString();
    const dryRun = args.input.dryRun ?? this.config.gmailDryRunDefault;

    await this.audit.record({
      eventType: "aaliyah.workspace.draft.requested",
      principalId: args.actorId,
      tenantId: args.tenantId,
      mode: args.mode,
      provider: "gmail",
      timestamp: generatedAt,
      metadata: this.audit.buildMetadata({ input: { ...args.input, dryRun } })
    });

    try {
      this.access.assertFounderPrincipal(args.principalContext);
      try {
        this.access.assertModeAccess({
          activeMode: args.mode,
          requestedMode: args.mode,
          detailLevel: args.mode === "founder" ? "summary" : "detail"
        });
      } catch {
        throw new AaliyahWorkspaceInvalidModeError();
      }
      this.validateDraftInput(args.input);

      if (!this.config.gmailDraftsEnabled) {
        throw new AaliyahWorkspaceProviderDisabledError();
      }

      const account = dryRun ? null : await this.requireConnectedAccount(args.tenantId, args.actorId);
      const provider = dryRun ? this.dryRunProvider : this.gmailProvider;
      const created = await provider.createDraft({
        input: { ...args.input, dryRun },
        account: account ?? this.buildDryRunAccount(args.actorId)
      });

      const result: AaliyahDraftEmailResult = {
        ok: true,
        provider: "gmail",
        draftId: created.draftId,
        externalId: created.externalId ?? null,
        dryRun,
        message: dryRun ? "Draft simulated successfully." : "Draft created successfully."
      };

      await this.audit.record({
        eventType: "aaliyah.workspace.draft.created",
        principalId: args.actorId,
        tenantId: args.tenantId,
        mode: args.mode,
        provider: "gmail",
        timestamp: generatedAt,
        metadata: this.audit.buildMetadata({
          input: { ...args.input, dryRun },
          resultCode: "ok",
          accountId: account?.accountId ?? null
        })
      });

      return result;
    } catch (error) {
      const normalized = await this.normalizeFailure({
        tenantId: args.tenantId,
        actorId: args.actorId,
        mode: args.mode,
        generatedAt,
        input: { ...args.input, dryRun },
        error
      });
      return normalized;
    }
  }

  private validateDraftInput(input: AaliyahDraftEmailInput): void {
    if (!Array.isArray(input.to) || input.to.length === 0 || input.to.some((value) => !this.isValidEmail(value))) {
      throw new AaliyahWorkspaceValidationError("At least one valid recipient is required.");
    }
    if (input.cc && input.cc.some((value) => !this.isValidEmail(value))) {
      throw new AaliyahWorkspaceValidationError("All cc recipients must be valid email addresses.");
    }
    if (input.bcc && input.bcc.some((value) => !this.isValidEmail(value))) {
      throw new AaliyahWorkspaceValidationError("All bcc recipients must be valid email addresses.");
    }
    if (!input.subject.trim()) {
      throw new AaliyahWorkspaceValidationError("Subject is required.");
    }
    if (!input.bodyText.trim()) {
      throw new AaliyahWorkspaceValidationError("Plain text body is required.");
    }
  }

  private async requireConnectedAccount(tenantId: string, actorId: string): Promise<EmailAccountConnectionRecord> {
    const account = await this.repository.getLatestConnectedEmailAccountByPrincipal({
      tenantId,
      principalId: actorId,
      provider: "gmail"
    });
    if (!account) {
      throw new AaliyahWorkspaceProviderUnavailableError("No connected Gmail account is available for this founder.");
    }
    return account;
  }

  private async normalizeFailure(args: {
    tenantId: string;
    actorId: string;
    mode: FounderBriefingMode;
    generatedAt: string;
    input: AaliyahDraftEmailInput;
    error: unknown;
  }): Promise<AaliyahDraftEmailResult> {
    const error = args.error instanceof Error ? args.error : new AaliyahWorkspaceInternalError();
    const metadata = this.audit.buildMetadata({ input: args.input, resultCode: error.message });

    const result: AaliyahDraftEmailResult =
      error instanceof AaliyahWorkspaceAccessDeniedError || error.message === "aaliyah_principal_context_denied"
        ? {
            ok: false,
            provider: "gmail",
            dryRun: Boolean(args.input.dryRun),
            denialCode: "ACCESS_DENIED",
            errorCode: null,
            retryable: false,
            message: "Founder access is required for Gmail drafting."
          }
        : error instanceof AaliyahWorkspaceInvalidModeError || error.message.startsWith("aaliyah_memory_boundary_denied")
          ? {
              ok: false,
              provider: "gmail",
              dryRun: Boolean(args.input.dryRun),
              denialCode: "INVALID_MODE",
              errorCode: null,
              retryable: false,
              message: "Mode is not allowed for Gmail drafting."
            }
          : error instanceof AaliyahWorkspaceProviderDisabledError
            ? {
                ok: false,
                provider: "gmail",
                dryRun: Boolean(args.input.dryRun),
                denialCode: "PROVIDER_DISABLED",
                errorCode: null,
                retryable: false,
                message: "Gmail drafting is disabled."
              }
            : error instanceof AaliyahWorkspaceValidationError
              ? {
                  ok: false,
                  provider: "gmail",
                  dryRun: Boolean(args.input.dryRun),
                  denialCode: null,
                  errorCode: "INVALID_INPUT",
                  retryable: false,
                  message: "Draft input failed validation."
                }
              : error instanceof AaliyahWorkspaceProviderUnavailableError
                ? {
                    ok: false,
                    provider: "gmail",
                    dryRun: Boolean(args.input.dryRun),
                    denialCode: null,
                    errorCode: "PROVIDER_UNAVAILABLE",
                    retryable: false,
                    message: "Gmail drafting provider is unavailable."
                  }
                : error instanceof AaliyahWorkspaceProviderRejectedError
                  ? {
                      ok: false,
                      provider: "gmail",
                      dryRun: Boolean(args.input.dryRun),
                      denialCode: null,
                      errorCode: "PROVIDER_REJECTED",
                      retryable: false,
                      message: "Gmail drafting provider rejected the request."
                    }
                  : {
                      ok: false,
                      provider: "gmail",
                      dryRun: Boolean(args.input.dryRun),
                      denialCode: null,
                      errorCode: "INTERNAL_ERROR",
                      retryable: false,
                      message: "Draft creation failed."
                    };

    await this.audit.record({
      eventType: result.denialCode ? "aaliyah.workspace.draft.denied" : "aaliyah.workspace.draft.failed",
      principalId: args.actorId,
      tenantId: args.tenantId,
      mode: args.mode,
      provider: "gmail",
      timestamp: args.generatedAt,
      metadata
    });

    return result;
  }

  private isValidEmail(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
  }

  private buildDryRunAccount(actorId: string): EmailAccountConnectionRecord {
    return {
      tenantId: "00000000-0000-4000-8000-000000000000",
      accountId: `dryrun:${actorId}`,
      provider: "gmail",
      principalId: actorId,
      accountEmailAddress: null,
      connectionStatus: "connected",
      grantedScopes: [],
      tokenReference: "dryrun",
      externalAccountId: null,
      draftOnlyMode: true,
      processingEnabled: false,
      processingMode: "poll",
      maxBatchThreads: 1,
      allowedLabelIds: [],
      oauthState: null,
      oauthStateExpiresAt: null,
      lastProcessedAt: null,
      lastError: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }
}
