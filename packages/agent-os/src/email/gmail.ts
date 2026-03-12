import type { NormalizedEmailMessage, NormalizedEmailThread, EmailConnectionMode, EmailProvider } from "./types.js";

export type GmailConnectorConfig = {
  provider: EmailProvider;
  connectionMode: EmailConnectionMode;
  accountEmailAddress: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  refreshToken?: string;
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

export interface GmailConnector {
  listThreads(args: { labelIds?: string[]; pageToken?: string | null; maxResults?: number }): Promise<GmailThreadListResult>;
  getThread(threadId: string): Promise<NormalizedEmailThread>;
  normalizeMessage(input: GmailNormalizeMessageInput): Promise<NormalizedEmailMessage>;
  registerWatch(): Promise<GmailWatchRegistration>;
}

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

export class GmailConnectorScaffold implements GmailConnector {
  constructor(private readonly config: GmailConnectorConfig) {
    if (config.provider !== "gmail") {
      throw new GmailConnectorNotConfiguredError(`unsupported_email_provider:${config.provider}`);
    }
    if (config.connectionMode !== "draft_only") {
      throw new GmailConnectorNotConfiguredError(`unsupported_email_connection_mode:${config.connectionMode}`);
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
