import { describe, expect, it, vi } from "vitest";

import { loadEmailIntegrationConfig } from "../src/email/config.js";
import type { GmailRuntimeGateway } from "../src/email/gmail.js";
import { EmailAssistantService } from "../src/email/service.js";
import { assembleAaliyahPrompt } from "../src/email/prompts.js";
import type { NormalizedEmailThread } from "../src/email/types.js";

function buildThread(overrides: Partial<NormalizedEmailThread> = {}): NormalizedEmailThread {
  return {
    provider: "gmail",
    providerThreadId: "thread-1",
    accountId: "account-1",
    subject: "Need help with marketing strategy",
    messages: [
      {
        providerMessageId: "msg-1",
        providerThreadId: "thread-1",
        subject: "Need help with marketing strategy",
        sentAt: "2026-03-12T00:00:00.000Z",
        from: {
          displayName: "Prospect",
          emailAddress: "prospect@example.com",
          domain: "example.com"
        },
        to: [],
        cc: [],
        bcc: [],
        textBody: "We are looking for help with branding and growth.",
        htmlBody: null,
        snippet: "looking for help"
      }
    ],
    labels: ["INBOX", "UNREAD"],
    lastMessageAt: "2026-03-12T00:00:00.000Z",
    ...overrides
  };
}

function buildRepository() {
  const assignment = {
    assignmentRecordId: "assignment:1",
    manifestVersion: "2026-03-12.v1",
    tenantId: "11111111-1111-4111-8111-111111111111",
    correlationId: "corr-1",
    requestSource: "email-agent",
    requestedBy: "actor-1",
    requestedTaskCategory: "campaign_growth",
    requestedResponsibilityKey: "social_campaign_deployment",
    requestMetadata: {},
    requestedExecutionTarget: "kobe",
    resolvedExecutiveId: "cmo",
    resolvedDepartmentId: "marketing",
    resolvedLeadAgentId: "kobe",
    resolvedSubAgentId: null,
    executionAgentId: "kobe",
    policyDecision: "approved",
    policyDecisionReason: "email_intake_policy_valid",
    routingDecision: null,
    routingTrace: [],
    createdAt: "2026-03-12T00:00:00.000Z",
    updatedAt: "2026-03-12T00:00:00.000Z"
  };
  let currentRun: any = {
    runRecordId: "run:1",
    assignmentRecordId: "assignment:1",
    executionId: null,
    currentState: "requested",
    tenantId: "11111111-1111-4111-8111-111111111111",
    requestedAt: "2026-03-12T00:00:00.000Z",
    validatedAt: null,
    routedAt: null,
    blockedAt: null,
    executionStartedAt: null,
    retriableAt: null,
    executionEndedAt: null,
    failureCategory: null,
    failureMessage: null,
    retryable: false,
    metadata: {},
    createdAt: "2026-03-12T00:00:00.000Z",
    updatedAt: "2026-03-12T00:00:00.000Z"
  };
  const execution = {
    tenantId: "11111111-1111-4111-8111-111111111111",
    executionId: "execution:1",
    agentId: "maestro",
    agentVersionId: "maestro:foundation-v1",
    correlationId: "corr-1",
    requestSource: "email-agent",
    requestedBy: "actor-1",
    subjectType: "email_thread",
    subjectId: "thread-1",
    status: "RUNNING",
    inputPayload: {},
    outputPayload: null,
    failureClass: null,
    failureMessage: null,
    approvalRequestId: null,
    retryCount: 0,
    maxRetries: 2,
    nextRetryAt: null,
    deadLetteredAt: null,
    startedAt: "2026-03-12T00:00:00.000Z",
    completedAt: null,
    createdAt: "2026-03-12T00:00:00.000Z",
    updatedAt: "2026-03-12T00:00:00.000Z"
  };

  return {
    createAssignmentRecord: vi.fn(async () => assignment),
    createExecutionRunRecord: vi.fn(async () => currentRun),
    transitionExecutionRunRecord: vi.fn(async ({ toState, executionId, failureCategory, failureMessage, metadata }: any) => {
      currentRun = {
        ...currentRun,
        currentState: toState,
        executionId: executionId ?? currentRun.executionId,
        failureCategory: failureCategory ?? null,
        failureMessage: failureMessage ?? null,
        metadata: metadata ?? currentRun.metadata,
        updatedAt: "2026-03-12T00:00:10.000Z"
      } as typeof currentRun;
      return currentRun;
    }),
    getExecutionRunRecord: vi.fn(async () => currentRun),
    createIncidentRecord: vi.fn(async () => ({ incidentId: "incident:1" })),
    createEmailDraftReviewItem: vi.fn(async () => ({
      tenantId: "11111111-1111-4111-8111-111111111111",
      reviewItemId: "email-review:1",
      draftId: "draft:1",
      accountId: "account-1",
      threadId: "thread-1",
      assignmentRecordId: "assignment:1",
      runRecordId: "run:1",
      intentCategory: "lead_inquiry",
      priority: "high",
      riskLevel: "medium",
      requiredApproval: true,
      reviewStatus: "pending_review",
      recommendedExecutiveId: "cmo",
      recommendedDepartmentId: "marketing",
      recommendedLeadAgentId: "kobe",
      recommendedSubAgentId: null,
      draftSummary: "summary",
      proposedReplySubject: "Re: Need help with marketing strategy",
      proposedReplyBody: "reply",
      confidenceScore: 0.8,
      riskScore: 0.3,
      escalationRecommended: false,
      blockedAutoSend: true,
      manifestVersion: "2026-03-12.v1",
      routingProvenance: { intentCategory: "lead_inquiry", target: { targetType: "lead_agent", departmentId: "marketing", executiveId: "cmo", leadAgentId: "kobe", subAgentId: null, executionAgentId: "kobe", requiresEscalation: false }, routingDecision: null, trace: [] },
      createdAt: "2026-03-12T00:00:00.000Z",
      updatedAt: "2026-03-12T00:00:00.000Z",
      reviewedAt: null,
      reviewedBy: null,
      reviewNote: null
    })),
    createEmailAccountConnection: vi.fn(async (args: any) => ({
      tenantId: args.tenantId,
      accountId: args.accountId,
      provider: "gmail",
      principalId: args.principalId,
      accountEmailAddress: args.accountEmailAddress ?? null,
      connectionStatus: args.connectionStatus,
      grantedScopes: args.grantedScopes ?? [],
      tokenReference: args.tokenReference ?? null,
      externalAccountId: args.externalAccountId ?? null,
      draftOnlyMode: true,
      processingEnabled: args.processingEnabled,
      processingMode: args.processingMode,
      maxBatchThreads: args.maxBatchThreads,
      allowedLabelIds: args.allowedLabelIds,
      oauthState: args.oauthState ?? null,
      oauthStateExpiresAt: args.oauthStateExpiresAt ?? null,
      lastProcessedAt: args.lastProcessedAt ?? null,
      lastError: args.lastError ?? null,
      createdAt: args.createdAt,
      updatedAt: args.createdAt
    })),
    updateEmailAccountConnection: vi.fn(async (args: any) => ({
      tenantId: "11111111-1111-4111-8111-111111111111",
      accountId: args.accountId,
      provider: "gmail",
      principalId: "principal-1",
      accountEmailAddress: args.accountEmailAddress ?? "ops@zbestmedia.com",
      connectionStatus: args.connectionStatus ?? "connected",
      grantedScopes: args.grantedScopes ?? [
        "https://www.googleapis.com/auth/gmail.readonly",
        "https://www.googleapis.com/auth/gmail.compose",
        "https://www.googleapis.com/auth/calendar.readonly",
        "https://www.googleapis.com/auth/calendar.events"
      ],
      tokenReference: args.tokenReference ?? "secret:gmail:ops",
      externalAccountId: args.externalAccountId ?? "gmail-user-1",
      draftOnlyMode: true,
      processingEnabled: args.processingEnabled ?? true,
      processingMode: "poll",
      maxBatchThreads: args.maxBatchThreads ?? 10,
      allowedLabelIds: args.allowedLabelIds ?? ["INBOX", "UNREAD"],
      oauthState: args.oauthState ?? null,
      oauthStateExpiresAt: args.oauthStateExpiresAt ?? null,
      lastProcessedAt: args.lastProcessedAt ?? null,
      lastError: args.lastError ?? null,
      createdAt: "2026-03-12T00:00:00.000Z",
      updatedAt: args.updatedAt ?? "2026-03-12T00:00:00.000Z"
    })),
    getEmailAccountConnection: vi.fn(async (_args: any) => ({
      tenantId: "11111111-1111-4111-8111-111111111111",
      accountId: "email-account:1",
      provider: "gmail",
      principalId: "principal-1",
      accountEmailAddress: "ops@zbestmedia.com",
      connectionStatus: "connected",
      grantedScopes: [
        "https://www.googleapis.com/auth/gmail.readonly",
        "https://www.googleapis.com/auth/gmail.compose",
        "https://www.googleapis.com/auth/calendar.readonly",
        "https://www.googleapis.com/auth/calendar.events"
      ],
      tokenReference: "secret:gmail:ops",
      externalAccountId: "gmail-user-1",
      draftOnlyMode: true,
      processingEnabled: true,
      processingMode: "poll",
      maxBatchThreads: 10,
      allowedLabelIds: ["INBOX", "UNREAD"],
      oauthState: null,
      oauthStateExpiresAt: null,
      lastProcessedAt: null,
      lastError: null,
      createdAt: "2026-03-12T00:00:00.000Z",
      updatedAt: "2026-03-12T00:00:00.000Z"
    })),
    getEmailAccountConnectionByOauthState: vi.fn(async (_args: any) => ({
      tenantId: "11111111-1111-4111-8111-111111111111",
      accountId: "email-account:oauth",
      provider: "gmail",
      principalId: "principal-1",
      accountEmailAddress: "ops@zbestmedia.com",
      connectionStatus: "oauth_pending",
      grantedScopes: [],
      tokenReference: null,
      externalAccountId: null,
      draftOnlyMode: true,
      processingEnabled: false,
      processingMode: "poll",
      maxBatchThreads: 10,
      allowedLabelIds: ["INBOX", "UNREAD"],
      oauthState: "gmail-oauth:1",
      oauthStateExpiresAt: "2026-03-12T00:15:00.000Z",
      lastProcessedAt: null,
      lastError: null,
      createdAt: "2026-03-12T00:00:00.000Z",
      updatedAt: "2026-03-12T00:00:00.000Z"
    })),
    listEmailAccountConnections: vi.fn(async () => []),
    createExecution: vi.fn(async () => execution),
    appendExecutionStep: vi.fn(async () => ({ executionStepId: "step:1" })),
    completeExecution: vi.fn(async () => undefined)
  };
}

function buildGmailRuntime(thread: NormalizedEmailThread): GmailRuntimeGateway {
  return {
    beginAuthorization: vi.fn(async ({ state }) => ({
      authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth?client_id=test",
      state,
      redirectUri: "https://example.com/oauth/callback",
      scopes: [
        "https://www.googleapis.com/auth/gmail.readonly",
        "https://www.googleapis.com/auth/gmail.compose",
        "https://www.googleapis.com/auth/calendar.readonly",
        "https://www.googleapis.com/auth/calendar.events"
      ]
    })),
    exchangeAuthorizationCode: vi.fn(async () => ({
      providerAccountId: "gmail-user-1",
      accountEmailAddress: "ops@zbestmedia.com",
      grantedScopes: [
        "https://www.googleapis.com/auth/gmail.readonly",
        "https://www.googleapis.com/auth/gmail.compose",
        "https://www.googleapis.com/auth/calendar.readonly",
        "https://www.googleapis.com/auth/calendar.events"
      ],
      tokenReference: "secret:gmail:ops",
      refreshTokenStored: true,
      accessTokenExpiresAt: null
    })),
    validateGrantedScopes: vi.fn(),
    revokeConnection: vi.fn(async () => undefined),
    createConnector: vi.fn(async () => ({
      listThreads: vi.fn(async () => ({ threads: [thread], nextPageToken: null })),
      getThread: vi.fn(async () => thread),
      normalizeMessage: vi.fn(),
      registerWatch: vi.fn(),
      createDraft: vi.fn(async () => ({
        providerDraftId: "gmail-draft-1",
        providerThreadId: thread.providerThreadId,
        createdAt: "2026-03-12T00:01:00.000Z"
      })),
      sendApprovedDraft: vi.fn(async () => ({
        providerMessageId: "gmail-message-1",
        providerThreadId: thread.providerThreadId,
        sentAt: "2026-03-12T00:02:00.000Z"
      }))
    }))
  };
}

describe("email assistant service", () => {
  it("processes a thread into assignment, run, and draft output", async () => {
    const repository = buildRepository();
    const service = new EmailAssistantService(
      repository as never,
      undefined,
      undefined,
      undefined,
      undefined,
      loadEmailIntegrationConfig({}),
      buildGmailRuntime(buildThread())
    );

    const outcome = await service.processThread({
      tenantId: "11111111-1111-4111-8111-111111111111",
      actorId: "actor-1",
      correlationId: "corr-1",
      requestSource: "email-agent",
      thread: buildThread(),
      createdAt: "2026-03-12T00:00:00.000Z"
    });

    expect(outcome.assignmentRecordId).toBe("assignment:1");
    expect(outcome.runRecordId).toBe("run:1");
    expect(outcome.result.intentCategory).toBe("lead_inquiry");
    expect(outcome.result.draft?.approvalRequired).toBe(true);
    expect(outcome.result.draft?.blockedAutoSend).toBe(true);
    expect(outcome.result.reviewItemId).toBe("email-review:1");
    expect(repository.createAssignmentRecord).toHaveBeenCalledOnce();
    expect(repository.createExecution).toHaveBeenCalledOnce();
    expect(repository.completeExecution).toHaveBeenCalledOnce();
  });

  it("creates an incident when processing fails", async () => {
    const repository = buildRepository();
    repository.createExecution.mockRejectedValueOnce(new Error("execution_write_failed"));
    const service = new EmailAssistantService(
      repository as never,
      undefined,
      undefined,
      undefined,
      undefined,
      loadEmailIntegrationConfig({}),
      buildGmailRuntime(buildThread())
    );

    await expect(
      service.processThread({
        tenantId: "11111111-1111-4111-8111-111111111111",
        actorId: "actor-1",
        correlationId: "corr-1",
        requestSource: "email-agent",
        thread: buildThread(),
        createdAt: "2026-03-12T00:00:00.000Z"
      })
    ).rejects.toThrow("execution_write_failed");

    expect(repository.createIncidentRecord).toHaveBeenCalledOnce();
  });

  it("suppresses spam threads without generating a draft", async () => {
    const repository = buildRepository();
    const service = new EmailAssistantService(
      repository as never,
      undefined,
      undefined,
      undefined,
      undefined,
      loadEmailIntegrationConfig({}),
      buildGmailRuntime(buildThread())
    );

    const outcome = await service.processThread({
      tenantId: "11111111-1111-4111-8111-111111111111",
      actorId: "actor-1",
      correlationId: "corr-1",
      requestSource: "email-agent",
      thread: buildThread({
        subject: "Guest post and casino SEO opportunity",
        messages: [
          {
            ...buildThread().messages[0],
            subject: "Guest post and casino SEO opportunity",
            textBody: "We can sell backlinks and casino SEO packages.",
            snippet: "casino SEO"
          }
        ]
      }),
      createdAt: "2026-03-12T00:00:00.000Z"
    });

    expect(outcome.result.status).toBe("suppressed");
    expect(outcome.result.draft).toBeNull();
  });

  it("assembles aaliyah prompts for email drafting mode", () => {
    const prompt = assembleAaliyahPrompt("email_drafting");
    expect(prompt.mode).toBe("email_drafting");
    expect(prompt.systemPrompt).toContain("Aaliyah");
    expect(prompt.sourceFiles.length).toBeGreaterThan(3);
  });

  it("processes eligible threads through an injected gmail connector", async () => {
    const repository = buildRepository();
    const service = new EmailAssistantService(
      repository as never,
      undefined,
      undefined,
      undefined,
      undefined,
      loadEmailIntegrationConfig({}),
      buildGmailRuntime(buildThread())
    );
    const thread = buildThread();
    const connector = {
      listThreads: vi.fn(async () => ({ threads: [thread], nextPageToken: null })),
      getThread: vi.fn(async () => thread),
      normalizeMessage: vi.fn(),
      registerWatch: vi.fn()
    };

    const batch = await service.processEligibleThreads({
      connector: connector as never,
      tenantId: "11111111-1111-4111-8111-111111111111",
      actorId: "actor-1",
      correlationId: "corr-1",
      requestSource: "email-agent",
      maxResults: 5,
      createdAt: "2026-03-12T00:00:00.000Z"
    });

    expect(batch.outcomes).toHaveLength(1);
    expect(connector.listThreads).toHaveBeenCalledOnce();
  });

  it("starts oauth and persists a pending gmail account", async () => {
    const repository = buildRepository();
    const runtime = buildGmailRuntime(buildThread());
    const service = new EmailAssistantService(
      repository as never,
      undefined,
      undefined,
      undefined,
      undefined,
      loadEmailIntegrationConfig({
        GMAIL_INTEGRATION_ENABLED: "true",
        GMAIL_OAUTH_CLIENT_ID: "client-id",
        GMAIL_OAUTH_CLIENT_SECRET_REF: "secret:gmail-client",
        GMAIL_OAUTH_REDIRECT_URI: "https://example.com/oauth/callback"
      }),
      runtime
    );

    const start = await service.beginGmailOAuthConnection({
      tenantId: "11111111-1111-4111-8111-111111111111",
      actorId: "actor-1",
      principalId: "principal-1",
      accountEmailAddress: "ops@zbestmedia.com",
      createdAt: "2026-03-12T00:00:00.000Z"
    });

    expect(start.account.connectionStatus).toBe("oauth_pending");
    expect(start.authorizationUrl).toContain("accounts.google.com");
    expect(repository.createEmailAccountConnection).toHaveBeenCalledOnce();
  });

  it("processes a connected account through the gmail runtime", async () => {
    const repository = buildRepository();
    const runtime = buildGmailRuntime(buildThread());
    const service = new EmailAssistantService(
      repository as never,
      undefined,
      undefined,
      undefined,
      undefined,
      loadEmailIntegrationConfig({
        GMAIL_INTEGRATION_ENABLED: "true",
        GMAIL_OAUTH_CLIENT_ID: "client-id",
        GMAIL_OAUTH_CLIENT_SECRET_REF: "secret:gmail-client",
        GMAIL_OAUTH_REDIRECT_URI: "https://example.com/oauth/callback"
      }),
      runtime
    );

    const batch = await service.processEligibleInboxThreads({
      tenantId: "11111111-1111-4111-8111-111111111111",
      actorId: "actor-1",
      correlationId: "corr-1",
      requestSource: "email-agent",
      accountId: "email-account:1",
      maxThreads: 5,
      createdAt: "2026-03-12T00:00:00.000Z"
    });

    expect(batch.processedCount).toBe(1);
    expect(batch.outcomes[0]?.blockedAutoSend).toBe(true);
  });

  it("rejects disabled account processing before connector work begins", async () => {
    const repository = buildRepository();
    repository.getEmailAccountConnection = vi.fn(async () => ({
      tenantId: "11111111-1111-4111-8111-111111111111",
      accountId: "email-account:1",
      provider: "gmail",
      principalId: "principal-1",
      accountEmailAddress: "ops@zbestmedia.com",
      connectionStatus: "connected",
      grantedScopes: [
        "https://www.googleapis.com/auth/gmail.readonly",
        "https://www.googleapis.com/auth/gmail.compose",
        "https://www.googleapis.com/auth/calendar.readonly",
        "https://www.googleapis.com/auth/calendar.events"
      ],
      tokenReference: "secret:gmail:ops",
      externalAccountId: "gmail-user-1",
      draftOnlyMode: true,
      processingEnabled: false,
      processingMode: "poll",
      maxBatchThreads: 10,
      allowedLabelIds: ["INBOX", "UNREAD"],
      oauthState: null,
      oauthStateExpiresAt: null,
      lastProcessedAt: null,
      lastError: null,
      createdAt: "2026-03-12T00:00:00.000Z",
      updatedAt: "2026-03-12T00:00:00.000Z"
    }));
    const service = new EmailAssistantService(
      repository as never,
      undefined,
      undefined,
      undefined,
      undefined,
      loadEmailIntegrationConfig({}),
      buildGmailRuntime(buildThread())
    );

    await expect(
      service.processEligibleInboxThreads({
        tenantId: "11111111-1111-4111-8111-111111111111",
        actorId: "actor-1",
        correlationId: "corr-1",
        requestSource: "email-agent",
        accountId: "email-account:1"
      })
    ).rejects.toThrow("email_processing_disabled");
  });
});
