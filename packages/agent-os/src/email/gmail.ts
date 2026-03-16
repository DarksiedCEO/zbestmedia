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

export type GmailSendDraftArgs = {
  threadId: string;
  subject: string;
  body: string;
};

export type GmailCreateDraftArgs = {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  bodyText: string;
  bodyHtml?: string | null;
  threadId?: string | null;
};

export type GmailSendDraftResult = {
  providerMessageId: string;
  providerThreadId: string;
  sentAt: string;
};

export type GmailCreateDraftResult = {
  providerDraftId: string;
  providerThreadId: string | null;
  createdAt: string;
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
  createDraft(args: GmailCreateDraftArgs): Promise<GmailCreateDraftResult>;
  sendApprovedDraft(args: GmailSendDraftArgs): Promise<GmailSendDraftResult>;
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

  async exchangeAuthorizationCode(args: GmailOAuthExchangeArgs): Promise<GmailOAuthExchangeResult> {
    const oauth = this.requireOauthConfig();
    const tokenData = await exchangeOauthCode({
      clientId: oauth.clientId,
      clientSecret: oauth.clientSecretReference,
      redirectUri: oauth.redirectUri,
      code: args.code,
    });
    const profile = await fetchGmailProfile(tokenData.accessToken);
    return {
      providerAccountId: profile.emailAddress,
      accountEmailAddress: profile.emailAddress,
      grantedScopes: tokenData.scopes,
      tokenReference: tokenData.refreshToken,
      refreshTokenStored: Boolean(tokenData.refreshToken),
      accessTokenExpiresAt: tokenData.accessTokenExpiresAt,
    };
  }

  validateGrantedScopes(grantedScopes: string[]): void {
    const oauth = this.requireOauthConfig();
    const missing = oauth.scopes.filter((scope) => !grantedScopes.includes(scope));
    if (missing.length > 0) {
      throw new GmailOauthConfigurationError(`gmail_oauth_missing_required_scopes:${missing.join(",")}`);
    }
  }

  async revokeConnection(args: { accountId: string; tokenReference: string | null }): Promise<void> {
    this.requireOauthConfig();
    if (!args.tokenReference) {
      return;
    }
    const res = await fetch("https://oauth2.googleapis.com/revoke", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        token: args.tokenReference
      })
    });
    if (!res.ok) {
      throw new GmailConnectorNotConfiguredError(`gmail_oauth_revoke_failed:${res.status}`);
    }
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

  async createDraft(_args: GmailCreateDraftArgs): Promise<GmailCreateDraftResult> {
    const accessToken = await refreshAccessToken({
      clientId: this.config.clientId,
      clientSecret: this.config.clientSecretReference,
      refreshToken: this.config.tokenReference ?? null
    });
    const encodedMessage = encodeDraftMessage({
      from: this.config.accountEmailAddress,
      to: _args.to,
      cc: _args.cc,
      bcc: _args.bcc,
      subject: _args.subject,
      bodyText: _args.bodyText,
      bodyHtml: _args.bodyHtml ?? null
    });
    const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/drafts", {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        message: {
          raw: encodedMessage,
          threadId: _args.threadId ?? undefined
        }
      })
    });
    if (!res.ok) {
      const body = await safeReadText(res);
      throw new GmailConnectorNotConfiguredError(`gmail_create_draft_failed:${res.status}:${body}`);
    }
    const payload = (await res.json()) as {
      id?: string;
      message?: { threadId?: string | null };
    };
    if (!payload.id) {
      throw new GmailConnectorNotConfiguredError("gmail_create_draft_missing_id");
    }
    return {
      providerDraftId: payload.id,
      providerThreadId: payload.message?.threadId ?? null,
      createdAt: new Date().toISOString()
    };
  }

  async sendApprovedDraft(_args: GmailSendDraftArgs): Promise<GmailSendDraftResult> {
    throw new GmailConnectorNotConfiguredError("gmail_send_approved_draft_not_implemented");
  }
}

export function buildGmailOauthState(): string {
  return `gmail-oauth:${randomUUID()}`;
}

type GoogleTokenResponse = {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
};

type GmailProfileResponse = {
  emailAddress?: string;
};

async function exchangeOauthCode(args: {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  code: string;
}): Promise<{
  accessToken: string;
  refreshToken: string | null;
  scopes: string[];
  accessTokenExpiresAt: string | null;
}> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      client_id: args.clientId,
      client_secret: args.clientSecret,
      code: args.code,
      grant_type: "authorization_code",
      redirect_uri: args.redirectUri
    })
  });
  const payload = (await safeReadJson(res)) as GoogleTokenResponse;
  if (!res.ok || !payload.access_token) {
    throw new GmailConnectorNotConfiguredError(
      `gmail_oauth_exchange_failed:${payload.error ?? res.status}:${payload.error_description ?? "unknown"}`
    );
  }
  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token ?? null,
    scopes: parseScopeList(payload.scope),
    accessTokenExpiresAt: payload.expires_in ? new Date(Date.now() + payload.expires_in * 1000).toISOString() : null
  };
}

async function refreshAccessToken(args: {
  clientId: string;
  clientSecret: string;
  refreshToken: string | null;
}): Promise<string> {
  if (!args.refreshToken) {
    throw new GmailConnectorNotConfiguredError("gmail_refresh_token_missing");
  }
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      client_id: args.clientId,
      client_secret: args.clientSecret,
      refresh_token: args.refreshToken,
      grant_type: "refresh_token"
    })
  });
  const payload = (await safeReadJson(res)) as GoogleTokenResponse;
  if (!res.ok || !payload.access_token) {
    throw new GmailConnectorNotConfiguredError(
      `gmail_refresh_access_token_failed:${payload.error ?? res.status}:${payload.error_description ?? "unknown"}`
    );
  }
  return payload.access_token;
}

async function fetchGmailProfile(accessToken: string): Promise<{ emailAddress: string }> {
  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
    headers: {
      authorization: `Bearer ${accessToken}`
    }
  });
  const payload = (await safeReadJson(res)) as GmailProfileResponse;
  if (!res.ok || !payload.emailAddress) {
    throw new GmailConnectorNotConfiguredError("gmail_profile_lookup_failed");
  }
  return {
    emailAddress: payload.emailAddress
  };
}

function parseScopeList(scopeValue: string | undefined): string[] {
  if (!scopeValue) {
    return [];
  }
  return scopeValue
    .split(" ")
    .map((scope) => scope.trim())
    .filter((scope) => scope.length > 0);
}

function encodeDraftMessage(args: {
  from: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  bodyText: string;
  bodyHtml: string | null;
}): string {
  const boundary = `aaliyah-${randomUUID()}`;
  const headers = [
    `From: ${args.from}`,
    `To: ${args.to.join(", ")}`,
    args.cc && args.cc.length > 0 ? `Cc: ${args.cc.join(", ")}` : null,
    args.bcc && args.bcc.length > 0 ? `Bcc: ${args.bcc.join(", ")}` : null,
    `Subject: ${args.subject}`,
    "MIME-Version: 1.0",
    args.bodyHtml
      ? `Content-Type: multipart/alternative; boundary=\"${boundary}\"`
      : "Content-Type: text/plain; charset=UTF-8"
  ].filter(Boolean);

  const body = args.bodyHtml
    ? [
        "",
        `--${boundary}`,
        "Content-Type: text/plain; charset=UTF-8",
        "",
        args.bodyText,
        `--${boundary}`,
        "Content-Type: text/html; charset=UTF-8",
        "",
        args.bodyHtml,
        `--${boundary}--`
      ].join("\r\n")
    : `\r\n\r\n${args.bodyText}`;

  return Buffer.from(`${headers.join("\r\n")}${body}`, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

async function safeReadJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

async function safeReadText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}
