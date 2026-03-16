import { randomUUID } from "node:crypto";

import type { EmailAccountConnectionRecord } from "../persistence/contracts.js";
import {
  GmailConnectorNotConfiguredError,
  GmailOauthConfigurationError,
  GmailRuntimeScaffold,
  type GmailRuntimeGateway
} from "../email/gmail.js";
import { loadEmailIntegrationConfig, type EmailIntegrationConfig } from "../email/config.js";
import type { AaliyahDraftEmailInput } from "./workspace-types.js";
import {
  AaliyahWorkspaceProviderRejectedError,
  AaliyahWorkspaceProviderUnavailableError
} from "./workspace-errors.js";

export interface GmailDraftProvider {
  createDraft(args: {
    input: AaliyahDraftEmailInput;
    account: EmailAccountConnectionRecord;
  }): Promise<{
    draftId: string;
    externalId?: string | null;
  }>;
}

export class DryRunGmailDraftProvider implements GmailDraftProvider {
  async createDraft(): Promise<{ draftId: string; externalId?: string | null }> {
    const suffix = randomUUID();
    return {
      draftId: `dryrun-draft:${suffix}`,
      externalId: `dryrun-external:${suffix}`
    };
  }
}

export class GoogleWorkspaceGmailDraftProvider implements GmailDraftProvider {
  constructor(
    private readonly gmailRuntime: GmailRuntimeGateway = new GmailRuntimeScaffold(loadEmailIntegrationConfig()),
    private readonly config: EmailIntegrationConfig = loadEmailIntegrationConfig()
  ) {}

  async createDraft(args: {
    input: AaliyahDraftEmailInput;
    account: EmailAccountConnectionRecord;
  }): Promise<{ draftId: string; externalId?: string | null }> {
    if (!this.config.enabled) {
      throw new AaliyahWorkspaceProviderUnavailableError("Gmail integration is not enabled.");
    }

    if (!this.config.oauth) {
      throw new AaliyahWorkspaceProviderUnavailableError("Gmail OAuth is not configured.");
    }

    if (args.account.connectionStatus !== "connected" || !args.account.tokenReference) {
      throw new AaliyahWorkspaceProviderUnavailableError("No connected Gmail account is available for drafting.");
    }

    try {
      const connector = await this.gmailRuntime.createConnector({ account: args.account });
      const draft = await connector.createDraft({
        to: args.input.to,
        cc: args.input.cc,
        bcc: args.input.bcc,
        subject: args.input.subject,
        bodyText: args.input.bodyText,
        bodyHtml: args.input.bodyHtml ?? null,
        threadId: args.input.threadId ?? null
      });

      return {
        draftId: draft.providerDraftId,
        externalId: draft.providerThreadId
      };
    } catch (error) {
      if (
        error instanceof GmailConnectorNotConfiguredError ||
        error instanceof GmailOauthConfigurationError
      ) {
        throw new AaliyahWorkspaceProviderUnavailableError("Live Gmail draft creation is not available for this environment.");
      }
      if (error instanceof Error) {
        throw new AaliyahWorkspaceProviderRejectedError(`Gmail draft request was rejected: ${error.message}`);
      }
      throw new AaliyahWorkspaceProviderRejectedError();
    }
  }
}
