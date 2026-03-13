import { randomUUID } from "node:crypto";

import type { EmailAccountConnectionRecord } from "../persistence/contracts.js";
import type { EmailIntegrationConfig, GmailOAuthConfig } from "./config.js";
import type {
  EmailConnectionMode,
  EmailProvider,
  NormalizedEmailMessage,
  NormalizedEmailThread
} from "./types.js";

export type GmailConnectorConfig = {
  provider: EmailProvider;
  connectionMode: EmailConnectionMode;
  accountEmailAddress: string;
  clientId: string;
  clientSecretReference: string;
  redirectUri: string;
  grantedScopes: string[];
  tokenReference?: string | null;
  pollIntervalSeconds?: number;
  watchTopicName?: string;
};

export type GmailThreadListResult = {
  threads: NormalizedEmailThread[];
  nextPageToken: string | null;
};

export type GmailWatchRegistration = {
  watchId: string;
  expiresAt: string;
  topicName: string;
};

export type GmailNormalizeMessageInput = {
  providerMessageId: string;
  providerThreadId: string;
  rawHeaders: Record<string, string>;
  textBody: string;
  htmlBody?: string | null;
  snippet: string;
  sentAt: string;
};

export type GmailOAuthStartArgs = {
  state: string;
  loginHint?: string | null;
};

export type GmailOAuthStartResult = {
  authorizationUrl: string;
  state: string;
  redirectUri: string;
  scopes: string[];
};

export type GmailOAuthExchangeArgs = {
  code: string;
  state: string;
};

export type GmailOAuthExchangeResult = {
  providerAccountId: string;
  accountEmailAddress: string;
  grantedScopes: string[];
  tokenReference: string | null;
  refreshTokenStored: boolean;
  accessTokenExpiresAt: string | null;
};

export type GmailConnectorFactoryArgs = {
  account: EmailAccountConnectionRecord;
};

export interface GmailConnector {
  listThreads(args: { labelIds?: string[]; pageToken?: string | null; maxResults?: number }): Promise<GmailThreadListResult>;
  getThread(threadId: string): Promise<NormalizedEmailThread>;
  normalizeMessage(input: GmailNormalizeMessageInput): Promise<NormalizedEmailMessage>;
  registerWatch(): Promise<GmailWatchRegistration>;
}

export interface GmailOAuthProvider {
  beginAuthorization(args: GmailOAuthStartArgs): Promise<GmailOAuthStartResult>;
  exchangeAuthorizationCode(args: GmailOAuthExchangeArgs): Promise<GmailOAuthExchangeResult>;
  validateGrantedScopes(grantedScopes: string[]): void;
  revokeConnection(args: { accountId: string; tokenReference: string | null }): Promise<void>;
}

export interface GmailConnectorFactory {
  createConnector(args: GmailConnectorFactoryArgs): Promise<GmailConnector>;
}

export interface GmailRuntimeGateway extends GmailOAuthProvider, GmailConnectorFactory {}

export type EmailAgentIntegrationSeams = {
  routing: {
    resolveIntent(intentCategory: import("./types.js").EmailIntentCategory): import("./types.js").EmailRoutingResolution;
  };
  ledger: {
    createAssignmentFromEmail(args: import("./types.js").EmailAssignmentIntegrationRequest): Promise<{ assignmentRecordId: string }>;
  };
  incidents: {
    createProcessingIncident(args: import("./types.js").EmailIncidentIntegrationRequest): Promise<{ incidentId: string }>;
  };
};

export class GmailConnectorNotConfiguredError extends Error {
  constructor(message = "gmail_connector_not_configured") {
    super(message);
  }
}

export class GmailOauthConfigurationError extends Error {
  constructor(message = "gmail_oauth_not_configured") {
    super(message);
  }
}

export class GmailRuntimeScaffold implements GmailRuntimeGateway {
  constructor(private readonly config: EmailIntegrationConfig) {}

  async beginAuthorization(args: GmailOAuthStartArgs): Promise<GmailOAuthStartResult> {
    const oauth = this.requireOauthConfig();
    const params = new URLSearchParams({
      client_id: oauth.clientId,
      redirect_uri: oauth.redirectUri,
      response_type: "code",
      access_type: "offline",
      prompt: "consent",
      scope: oauth.scopes.join(" "),
      state: args.state
    });
    if (args.loginHint) {
      params.set("login_hint", args.loginHint);
    }
    return {
      authorizationUrl: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
      state: args.state,
      redirectUri: oauth.redirectUri,
      scopes: [...oauth.scopes]
    };
  }

  async exchangeAuthorizationCode(_args: GmailOAuthExchangeArgs): Promise<GmailOAuthExchangeResult> {
    this.requireOauthConfig();
    throw new GmailConnectorNotConfiguredError("gmail_oauth_exchange_not_implemented");
  }

  validateGrantedScopes(grantedScopes: string[]): void {
    const oauth = this.requireOauthConfig();
    const missing = oauth.scopes.filter((scope) => !grantedScopes.includes(scope));
    if (missing.length > 0) {
      throw new GmailOauthConfigurationError(`gmail_oauth_missing_required_scopes:${missing.join(",")}`);
    }
  }

  async revokeConnection(_args: { accountId: string; tokenReference: string | null }): Promise<void> {
    this.requireOauthConfig();
    throw new GmailConnectorNotConfiguredError("gmail_oauth_revoke_not_implemented");
  }

  async createConnector(args: GmailConnectorFactoryArgs): Promise<GmailConnector> {
    const oauth = this.requireOauthConfig();
    if (!args.account.tokenReference) {
      throw new GmailConnectorNotConfiguredError(`gmail_account_missing_token_reference:${args.account.accountId}`);
    }
    return new GmailConnectorScaffold({
      provider: args.account.provider,
      connectionMode: "draft_only",
      accountEmailAddress: args.account.accountEmailAddress ?? `account-${args.account.accountId}@unknown.local`,
      clientId: oauth.clientId,
      clientSecretReference: oauth.clientSecretReference,
      redirectUri: oauth.redirectUri,
      grantedScopes: args.account.grantedScopes,
      tokenReference: args.account.tokenReference
    });
  }

  private requireOauthConfig(): GmailOAuthConfig {
    if (!this.config.enabled) {
      throw new GmailOauthConfigurationError("gmail_integration_disabled");
    }
    if (!this.config.oauth) {
      throw new GmailOauthConfigurationError("gmail_oauth_not_configured");
    }
    return this.config.oauth;
  }
}

export class GmailConnectorScaffold implements GmailConnector {
  constructor(private readonly config: GmailConnectorConfig) {
    if (config.provider !== "gmail") {
      throw new GmailConnectorNotConfiguredError(`unsupported_email_provider:${config.provider}`);
    }
    if (config.connectionMode !== "draft_only") {
      throw new GmailConnectorNotConfiguredError(`unsupported_email_connection_mode:${config.connectionMode}`);
    }
    if (!config.tokenReference) {
      throw new GmailConnectorNotConfiguredError("gmail_token_reference_required");
    }
  }

  async listThreads(_args: { labelIds?: string[]; pageToken?: string | null; maxResults?: number }): Promise<GmailThreadListResult> {
    throw new GmailConnectorNotConfiguredError("gmail_list_threads_not_implemented");
  }

  async getThread(_threadId: string): Promise<NormalizedEmailThread> {
    throw new GmailConnectorNotConfiguredError("gmail_get_thread_not_implemented");
  }

  async normalizeMessage(_input: GmailNormalizeMessageInput): Promise<NormalizedEmailMessage> {
    throw new GmailConnectorNotConfiguredError("gmail_normalize_message_not_implemented");
  }

  async registerWatch(): Promise<GmailWatchRegistration> {
    throw new GmailConnectorNotConfiguredError("gmail_register_watch_not_implemented");
  }
}

export function buildGmailOauthState(): string {
  return `gmail-oauth:${randomUUID()}`;
}
