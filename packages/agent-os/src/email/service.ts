import { randomUUID } from "node:crypto";

import type { ExecutionRecord, EmailAccountConnectionRecord } from "../persistence/contracts.js";
import type { AgentOsRepository } from "../persistence/repository.js";
import { AgentExecutionLedgerService } from "../execution/ledger.js";
import { AgentIncidentService } from "../incidents/service.js";
import { EmailThreadClassifier } from "./classifier.js";
import { loadEmailIntegrationConfig, type EmailIntegrationConfig } from "./config.js";
import { buildEmailDraftSuggestion } from "./drafts.js";
import { EmailDraftDispatchService } from "./dispatch.js";
import type { EmailDispatchRecord, EmailDispatchResult } from "./dispatch-types.js";
import { EmailDraftReviewService } from "./review.js";
import type { EmailDraftReviewRecord } from "./review-types.js";
import {
  buildGmailOauthState,
  GmailOauthConfigurationError,
  GmailRuntimeScaffold,
  type GmailConnector,
  type GmailOAuthExchangeResult,
  type GmailRuntimeGateway
} from "./gmail.js";
import { EmailRoutingService } from "./routing.js";
import { assembleAaliyahPrompt, type AaliyahPromptAssembly } from "./prompts.js";
import type {
  EmailAccountOAuthStartResult,
  EmailAssignmentIntegrationRequest,
  EmailDraftSuggestion,
  EmailEligibleThreadSummary,
  EmailIncidentIntegrationRequest,
  EmailProcessingResult,
  EmailThreadClassification,
  EmailThreadProcessingOutcomeSummary,
  NormalizedEmailThread
} from "./types.js";

export type ProcessEmailThreadArgs = {
  tenantId: string;
  actorId: string;
  correlationId: string;
  requestSource: string;
  thread: NormalizedEmailThread;
  createdAt?: string;
};

export type EmailThreadProcessingOutcome = {
  assignmentRecordId: string;
  runRecordId: string;
  execution: ExecutionRecord;
  result: EmailProcessingResult;
  promptAssembly: AaliyahPromptAssembly;
  reviewItem: EmailDraftReviewRecord | null;
};

export type BeginGmailOAuthConnectionArgs = {
  tenantId: string;
  actorId: string;
  principalId: string;
  accountEmailAddress?: string | null;
  processingEnabled?: boolean;
  maxBatchThreads?: number;
  allowedLabelIds?: string[];
  createdAt?: string;
};

export type CompleteGmailOAuthConnectionArgs = {
  tenantId: string;
  actorId: string;
  state: string;
  code: string;
  createdAt?: string;
};

export type EmailAccountProcessingArgs = {
  tenantId: string;
  actorId: string;
  correlationId: string;
  requestSource: string;
  accountId: string;
  maxThreads?: number;
  createdAt?: string;
};

export type EmailAccountThreadProcessingArgs = EmailAccountProcessingArgs & {
  threadId: string;
};

export class EmailProcessingError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export class EmailAccountConfigurationError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export class EmailAssistantService {
  private readonly gmailRuntime: GmailRuntimeGateway;
  private readonly reviewQueue: EmailDraftReviewService;
  private readonly dispatchQueue: EmailDraftDispatchService;

  constructor(
    private readonly repository: AgentOsRepository,
    private readonly ledger: AgentExecutionLedgerService = new AgentExecutionLedgerService(repository),
    private readonly incidents: AgentIncidentService = new AgentIncidentService(repository),
    private readonly classifier: EmailThreadClassifier = new EmailThreadClassifier(),
    private readonly routing: EmailRoutingService = new EmailRoutingService(),
    private readonly config: EmailIntegrationConfig = loadEmailIntegrationConfig(),
    gmailRuntime?: GmailRuntimeGateway,
    reviewQueue?: EmailDraftReviewService
  ) {
    this.gmailRuntime = gmailRuntime ?? new GmailRuntimeScaffold(this.config);
    this.reviewQueue = reviewQueue ?? new EmailDraftReviewService(repository);
    this.dispatchQueue = new EmailDraftDispatchService(repository, incidents, this.gmailRuntime);
  }

  async listAccounts(args: { tenantId: string; limit?: number }) {
    return this.repository.listEmailAccountConnections(args);
  }

  async getAccount(args: { tenantId: string; accountId: string }) {
    return this.repository.getEmailAccountConnection(args);
  }
  async listReviewItems(args: {
    tenantId: string;
    status?: EmailDraftReviewRecord["reviewStatus"];
    accountId?: string;
    priority?: EmailDraftReviewRecord["priority"];
    limit?: number;
  }) {
    return this.reviewQueue.listReviewItems(args);
  }

  async getReviewItem(args: { tenantId: string; reviewItemId: string }) {
    return this.reviewQueue.getReviewItem(args);
  }

  async approveReviewItem(args: { tenantId: string; reviewItemId: string; actorId: string; note?: string; reviewedAt?: string }) {
    return this.reviewQueue.approveReviewItem(args);
  }

  async rejectReviewItem(args: { tenantId: string; reviewItemId: string; actorId: string; note?: string; reviewedAt?: string }) {
    return this.reviewQueue.rejectReviewItem(args);
  }

  async requestReviewRevision(args: { tenantId: string; reviewItemId: string; actorId: string; note: string; reviewedAt?: string }) {
    return this.reviewQueue.requestRevision(args);
  }

  async getDispatchRecord(args: { tenantId: string; dispatchId: string }): Promise<EmailDispatchRecord | null> {
    return this.dispatchQueue.getDispatchRecord(args);
  }

  async dispatchApprovedReviewItem(args: {
    tenantId: string;
    actorId: string;
    reviewItemId: string;
    requestedAt?: string;
  }): Promise<EmailDispatchResult> {
    return this.dispatchQueue.dispatchApprovedReviewItem({
      tenantId: args.tenantId,
      actorId: args.actorId,
      reviewItemId: args.reviewItemId,
      requestedAt: args.requestedAt,
      auditMetadata: {
        source: "email-assistant-service"
      }
    });
  }


  async beginGmailOAuthConnection(args: BeginGmailOAuthConnectionArgs): Promise<EmailAccountOAuthStartResult> {
    if (!this.config.enabled) {
      throw new EmailAccountConfigurationError("gmail_integration_disabled");
    }
    const now = args.createdAt ?? new Date().toISOString();
    const state = buildGmailOauthState();
    const oauthStateExpiresAt = new Date(Date.parse(now) + 15 * 60_000).toISOString();
    const accountId = `email-account:${randomUUID()}`;
    const maxBatchThreads = this.resolveBatchLimit(args.maxBatchThreads);
    const account = await this.repository.createEmailAccountConnection({
      tenantId: args.tenantId,
      accountId,
      provider: "gmail",
      principalId: args.principalId,
      accountEmailAddress: args.accountEmailAddress ?? null,
      connectionStatus: "oauth_pending",
      grantedScopes: [],
      tokenReference: null,
      externalAccountId: null,
      draftOnlyMode: true,
      processingEnabled: args.processingEnabled ?? this.config.processing.processingEnabledDefault,
      processingMode: this.config.processing.processingMode,
      maxBatchThreads,
      allowedLabelIds: args.allowedLabelIds ?? [...this.config.processing.allowedLabelIds],
      oauthState: state,
      oauthStateExpiresAt,
      lastError: null,
      createdAt: now
    });

    try {
      const start = await this.gmailRuntime.beginAuthorization({
        state,
        loginHint: args.accountEmailAddress ?? null
      });
      return {
        account,
        authorizationUrl: start.authorizationUrl,
        state: start.state,
        redirectUri: start.redirectUri,
        scopes: start.scopes
      };
    } catch (error) {
      await this.repository.updateEmailAccountConnection({
        tenantId: args.tenantId,
        accountId,
        connectionStatus: "error",
        lastError: error instanceof Error ? error.message : "gmail_oauth_start_failed",
        updatedAt: now
      });
      throw error;
    }
  }

  async completeGmailOAuthConnection(args: CompleteGmailOAuthConnectionArgs): Promise<EmailAccountConnectionRecord> {
    const createdAt = args.createdAt ?? new Date().toISOString();
    const account = await this.repository.getEmailAccountConnectionByOauthState({
      tenantId: args.tenantId,
      oauthState: args.state
    });
    if (!account) {
      throw new EmailAccountConfigurationError("gmail_oauth_state_not_found");
    }
    if (account.oauthStateExpiresAt && Date.parse(account.oauthStateExpiresAt) < Date.parse(createdAt)) {
      await this.repository.updateEmailAccountConnection({
        tenantId: args.tenantId,
        accountId: account.accountId,
        connectionStatus: "error",
        oauthState: null,
        oauthStateExpiresAt: null,
        lastError: "gmail_oauth_state_expired",
        updatedAt: createdAt
      });
      throw new EmailAccountConfigurationError("gmail_oauth_state_expired");
    }

    try {
      const exchanged = await this.gmailRuntime.exchangeAuthorizationCode({
        code: args.code,
        state: args.state
      });
      this.gmailRuntime.validateGrantedScopes(exchanged.grantedScopes);
      return this.completeConnectedAccount(args.tenantId, account.accountId, exchanged, createdAt);
    } catch (error) {
      await this.repository.updateEmailAccountConnection({
        tenantId: args.tenantId,
        accountId: account.accountId,
        connectionStatus: "error",
        oauthState: null,
        oauthStateExpiresAt: null,
        lastError: error instanceof Error ? error.message : "gmail_oauth_callback_failed",
        updatedAt: createdAt
      });
      throw error;
    }
  }

  async listEligibleThreads(args: {
    tenantId: string;
    accountId: string;
    maxThreads?: number;
  }): Promise<{ account: EmailAccountConnectionRecord; nextPageToken: string | null; items: EmailEligibleThreadSummary[] }> {
    const account = await this.requireProcessableAccount(args.tenantId, args.accountId);
    const connector = await this.gmailRuntime.createConnector({ account });
    const maxThreads = this.resolveBatchLimit(args.maxThreads, account.maxBatchThreads);
    const listed = await connector.listThreads({
      labelIds: account.allowedLabelIds,
      maxResults: maxThreads
    });
    return {
      account,
      nextPageToken: listed.nextPageToken,
      items: listed.threads.map((thread) => ({
        accountId: account.accountId,
        threadId: thread.providerThreadId,
        subject: thread.subject,
        lastMessageAt: thread.lastMessageAt,
        labels: thread.labels,
        messageCount: thread.messages.length
      }))
    };
  }

  async processEligibleInboxThreads(args: EmailAccountProcessingArgs) {
    const account = await this.requireProcessableAccount(args.tenantId, args.accountId);
    const connector = await this.gmailRuntime.createConnector({ account });
    const maxThreads = this.resolveBatchLimit(args.maxThreads, account.maxBatchThreads);

    try {
      const batch = await this.processEligibleThreads({
        connector,
        tenantId: args.tenantId,
        actorId: args.actorId,
        correlationId: args.correlationId,
        requestSource: args.requestSource,
        labelIds: account.allowedLabelIds,
        maxResults: maxThreads,
        createdAt: args.createdAt
      });
      await this.repository.updateEmailAccountConnection({
        tenantId: args.tenantId,
        accountId: account.accountId,
        lastProcessedAt: args.createdAt ?? new Date().toISOString(),
        lastError: null,
        updatedAt: args.createdAt
      });
      return {
        account,
        processedCount: batch.outcomes.length,
        nextPageToken: batch.nextPageToken,
        outcomes: batch.outcomes.map(toOutcomeSummary)
      };
    } catch (error) {
      await this.handleAccountProcessingFailure({
        tenantId: args.tenantId,
        actorId: args.actorId,
        account,
        message: error instanceof Error ? error.message : "gmail_account_processing_failed",
        correlationId: args.correlationId,
        createdAt: args.createdAt
      });
      throw error;
    }
  }

  async processAccountThreadById(args: EmailAccountThreadProcessingArgs) {
    const account = await this.requireProcessableAccount(args.tenantId, args.accountId);
    const connector = await this.gmailRuntime.createConnector({ account });
    try {
      const outcome = await this.processThreadById({
        connector,
        tenantId: args.tenantId,
        actorId: args.actorId,
        correlationId: args.correlationId,
        requestSource: args.requestSource,
        threadId: args.threadId,
        createdAt: args.createdAt
      });
      await this.repository.updateEmailAccountConnection({
        tenantId: args.tenantId,
        accountId: account.accountId,
        lastProcessedAt: args.createdAt ?? new Date().toISOString(),
        lastError: null,
        updatedAt: args.createdAt
      });
      return {
        account,
        outcome: toOutcomeSummary(outcome)
      };
    } catch (error) {
      await this.handleAccountProcessingFailure({
        tenantId: args.tenantId,
        actorId: args.actorId,
        account,
        message: error instanceof Error ? error.message : "gmail_thread_processing_failed",
        correlationId: args.correlationId,
        createdAt: args.createdAt
      });
      throw error;
    }
  }

  async processThread(args: ProcessEmailThreadArgs): Promise<EmailThreadProcessingOutcome> {
    const createdAt = args.createdAt ?? new Date().toISOString();

    let classification: EmailThreadClassification | null = null;
    let assignmentRecordId: string | null = null;
    let runRecordId: string | null = null;

    try {
      classification = this.classifier.classifyThread(args.thread);
      const routingResolution = this.routing.resolveIntent(classification.intentCategory);
      const promptAssembly = assembleAaliyahPrompt(
        classification.escalationRequired ? "executive_assistant" : "email_drafting"
      );

      const assignment = await this.ledger.createAssignment({
        tenantId: args.tenantId,
        correlationId: args.correlationId,
        requestSource: args.requestSource,
        requestedBy: args.actorId,
        requestedTaskCategory: routingResolution.routingDecision?.requestedCategory ?? null,
        requestedResponsibilityKey: routingResolution.routingDecision?.responsibilityKey ?? null,
        requestMetadata: this.buildAssignmentMetadata(args.thread, classification, promptAssembly),
        requestedExecutionTarget: routingResolution.target.leadAgentId ?? routingResolution.target.executiveId,
        routingDecision: routingResolution.routingDecision,
        policyDecision: "approved",
        policyDecisionReason: "email_intake_policy_valid",
        createdAt
      });
      assignmentRecordId = assignment.assignmentRecordId;

      let run = await this.ledger.createRun({
        tenantId: args.tenantId,
        assignmentRecordId: assignment.assignmentRecordId,
        metadata: {
          threadId: args.thread.providerThreadId,
          intentCategory: classification.intentCategory
        },
        requestedAt: createdAt
      });
      runRecordId = run.runRecordId;

      run = await this.ledger.transition({
        tenantId: args.tenantId,
        runRecord: run,
        transition: "validate",
        metadata: { classification },
        transitionedAt: createdAt
      });
      run = await this.ledger.transition({
        tenantId: args.tenantId,
        runRecord: run,
        transition: "route",
        metadata: { routingResolution },
        transitionedAt: createdAt
      });
      run = await this.ledger.transition({
        tenantId: args.tenantId,
        runRecord: run,
        transition: "start_execution",
        metadata: { stage: "draft_generation" },
        transitionedAt: createdAt
      });

      const draft =
        routingResolution.target.targetType === "suppressed"
          ? null
          : this.generateDraft(args.thread, classification, routingResolution);

      let reviewItem: EmailDraftReviewRecord | null = null;
      if (draft) {
        reviewItem = await this.reviewQueue.createReviewItem({
          tenantId: args.tenantId,
          draft,
          accountId: args.thread.accountId,
          assignmentRecordId: assignment.assignmentRecordId,
          runRecordId: run.runRecordId,
          intentCategory: classification.intentCategory,
          priority: classification.priority,
          riskLevel: classification.riskLevel,
          manifestVersion: assignment.manifestVersion,
          routingProvenance: routingResolution,
          createdAt
        });
      }

      const result = this.buildProcessingResult(args, classification, routingResolution, draft, reviewItem);

      const execution = await this.repository.createExecution({
        tenantId: args.tenantId,
        agentId: "maestro",
        correlationId: args.correlationId,
        requestSource: args.requestSource,
        requestedBy: args.actorId,
        subjectType: "email_thread",
        subjectId: args.thread.providerThreadId,
        inputPayload: {
          threadId: args.thread.providerThreadId,
          subject: args.thread.subject,
          intentCategory: classification.intentCategory,
          priority: classification.priority,
          riskLevel: classification.riskLevel
        },
        status: "RUNNING",
        createdAt
      });

      await this.ledger.attachExecution({
        tenantId: args.tenantId,
        runRecordId: run.runRecordId,
        executionId: execution.executionId,
        currentState: run.currentState,
        metadata: { promptMode: promptAssembly.mode },
        transitionedAt: createdAt
      });

      await this.repository.appendExecutionStep({
        tenantId: args.tenantId,
        executionId: execution.executionId,
        stepName: "email_thread_classified",
        stepOrder: 1,
        status: "COMPLETED",
        payload: { classification, routing: routingResolution },
        createdAt
      });
      await this.repository.appendExecutionStep({
        tenantId: args.tenantId,
        executionId: execution.executionId,
        stepName: "email_draft_generated",
        stepOrder: 2,
        status: "COMPLETED",
        payload: { draftId: draft?.draftId ?? null, reviewItemId: reviewItem?.reviewItemId ?? null, approvalRequired: draft?.approvalRequired ?? false },
        createdAt
      });
      await this.repository.completeExecution({
        tenantId: args.tenantId,
        executionId: execution.executionId,
        outputPayload: {
          result,
          promptAssembly: {
            mode: promptAssembly.mode,
            sourceFiles: promptAssembly.sourceFiles
          }
        },
        completedAt: createdAt
      });

      const completedRun = await this.ledger.getExecutionRunRecord({ tenantId: args.tenantId, runRecordId: run.runRecordId });
      if (!completedRun) {
        throw new EmailProcessingError(`execution_run_not_found:${run.runRecordId}`);
      }

      run = await this.ledger.transition({
        tenantId: args.tenantId,
        runRecord: completedRun,
        transition: "succeed",
        metadata: {
          draftId: draft?.draftId ?? null,
          approvalRequired: draft?.approvalRequired ?? false,
          blockedAutoSend: draft?.blockedAutoSend ?? true
        },
        transitionedAt: createdAt
      });

      return {
        assignmentRecordId: assignment.assignmentRecordId,
        runRecordId: run.runRecordId,
        execution: {
          ...execution,
          status: "COMPLETED",
          outputPayload: {
            result,
            promptAssembly: {
              mode: promptAssembly.mode,
              sourceFiles: promptAssembly.sourceFiles
            }
          },
          completedAt: createdAt,
          updatedAt: createdAt
        },
        result,
        promptAssembly,
        reviewItem
      };
    } catch (error) {
      const failureMessage = error instanceof Error ? error.message : "email_processing_failed";
      const incidentInput: EmailIncidentIntegrationRequest = {
        tenantId: args.tenantId,
        correlationId: args.correlationId,
        source: "email-assistant-service",
        threadId: args.thread.providerThreadId,
        intentCategory: classification?.intentCategory ?? "technical_issue",
        message: failureMessage,
        metadata: {
          subject: args.thread.subject,
          requestSource: args.requestSource
        }
      };

      if (runRecordId) {
        const currentRun = await this.ledger.getExecutionRunRecord({ tenantId: args.tenantId, runRecordId });
        if (!currentRun) {
          throw new EmailProcessingError(`execution_run_not_found:${runRecordId}`);
        }
        await this.ledger.transition({
          tenantId: args.tenantId,
          runRecord: currentRun,
          transition: "fail",
          failureCategory: "email_processing_error",
          failureMessage,
          retryable: false,
          transitionedAt: createdAt
        });
      }

      await this.incidents.createFromExecutionFailure({
        tenantId: args.tenantId,
        actorId: args.actorId,
        failure: {
          incidentType: "execution_runtime_failure",
          sourceSystem: "email-assistant-service",
          message: failureMessage,
          details: incidentInput.metadata ?? {},
          relatedAssignmentRecordId: assignmentRecordId,
          relatedRunRecordId: runRecordId,
          releaseBlocking: false
        },
        createdAt
      });

      throw error;
    }
  }

  async processThreadById(args: {
    connector: GmailConnector;
    tenantId: string;
    actorId: string;
    correlationId: string;
    requestSource: string;
    threadId: string;
    createdAt?: string;
  }) {
    const thread = await args.connector.getThread(args.threadId);
    return this.processThread({
      tenantId: args.tenantId,
      actorId: args.actorId,
      correlationId: args.correlationId,
      requestSource: args.requestSource,
      thread,
      createdAt: args.createdAt
    });
  }

  async processEligibleThreads(args: {
    connector: GmailConnector;
    tenantId: string;
    actorId: string;
    correlationId: string;
    requestSource: string;
    labelIds?: string[];
    maxResults?: number;
    createdAt?: string;
  }) {
    const listed = await args.connector.listThreads({
      labelIds: args.labelIds,
      maxResults: args.maxResults
    });

    const outcomes: EmailThreadProcessingOutcome[] = [];
    for (const thread of listed.threads) {
      outcomes.push(
        await this.processThread({
          tenantId: args.tenantId,
          actorId: args.actorId,
          correlationId: args.correlationId,
          requestSource: args.requestSource,
          thread,
          createdAt: args.createdAt
        })
      );
    }

    return {
      nextPageToken: listed.nextPageToken,
      outcomes
    };
  }

  private async completeConnectedAccount(
    tenantId: string,
    accountId: string,
    exchanged: GmailOAuthExchangeResult,
    updatedAt: string
  ): Promise<EmailAccountConnectionRecord> {
    return this.repository.updateEmailAccountConnection({
      tenantId,
      accountId,
      connectionStatus: "connected",
      accountEmailAddress: exchanged.accountEmailAddress,
      grantedScopes: exchanged.grantedScopes,
      tokenReference: exchanged.tokenReference,
      externalAccountId: exchanged.providerAccountId,
      oauthState: null,
      oauthStateExpiresAt: null,
      lastError: null,
      updatedAt
    });
  }

  private resolveBatchLimit(requested: number | undefined, accountCap?: number): number {
    const cap = Math.min(accountCap ?? this.config.processing.defaultBatchLimit, this.config.processing.hardBatchLimit);
    const requestedLimit = requested ?? cap;
    if (requestedLimit > this.config.processing.hardBatchLimit) {
      throw new EmailAccountConfigurationError(`email_batch_limit_exceeded:${requestedLimit}:${this.config.processing.hardBatchLimit}`);
    }
    if (requestedLimit > cap) {
      throw new EmailAccountConfigurationError(`email_account_batch_limit_exceeded:${requestedLimit}:${cap}`);
    }
    return requestedLimit;
  }

  private async requireProcessableAccount(tenantId: string, accountId: string): Promise<EmailAccountConnectionRecord> {
    const account = await this.repository.getEmailAccountConnection({ tenantId, accountId });
    if (!account) {
      throw new EmailAccountConfigurationError("email_account_not_found");
    }
    if (account.connectionStatus !== "connected") {
      throw new EmailAccountConfigurationError(`email_account_not_connected:${account.connectionStatus}`);
    }
    if (!account.processingEnabled) {
      throw new EmailAccountConfigurationError("email_processing_disabled");
    }
    if (!account.draftOnlyMode) {
      throw new EmailAccountConfigurationError("email_account_must_remain_draft_only");
    }
    return account;
  }

  private async handleAccountProcessingFailure(args: {
    tenantId: string;
    actorId: string;
    account: EmailAccountConnectionRecord;
    message: string;
    correlationId: string;
    createdAt?: string;
  }) {
    await this.repository.updateEmailAccountConnection({
      tenantId: args.tenantId,
      accountId: args.account.accountId,
      lastError: args.message,
      updatedAt: args.createdAt
    });
    await this.incidents.createFromOperationalSignal({
      tenantId: args.tenantId,
      actorId: args.actorId,
      signal: {
        signalType: "runtime_health",
        status: "warning",
        sourceSystem: "email-gmail-runtime",
        message: args.message,
        details: {
          accountId: args.account.accountId,
          principalId: args.account.principalId,
          provider: args.account.provider,
          correlationId: args.correlationId
        }
      },
      createdAt: args.createdAt
    });
  }

  private buildAssignmentMetadata(
    thread: NormalizedEmailThread,
    classification: EmailThreadClassification,
    promptAssembly: AaliyahPromptAssembly
  ) {
    return {
      channel: "email",
      provider: thread.provider,
      accountId: thread.accountId,
      threadId: thread.providerThreadId,
      subject: thread.subject,
      messageCount: thread.messages.length,
      intentCategory: classification.intentCategory,
      priority: classification.priority,
      riskLevel: classification.riskLevel,
      rationale: classification.rationale,
      promptMode: promptAssembly.mode
    };
  }

  private generateDraft(
    thread: NormalizedEmailThread,
    classification: EmailThreadClassification,
    routingResolution: ReturnType<EmailRoutingService["resolveIntent"]>
  ): EmailDraftSuggestion {
    const body = this.composeDraftBody(thread, classification, routingResolution);
    return buildEmailDraftSuggestion({
      threadId: thread.providerThreadId,
      intentCategory: classification.intentCategory,
      summary: `Thread classified as ${classification.intentCategory} with ${classification.riskLevel} risk.`,
      proposedReplySubject: thread.subject.startsWith("Re:") ? thread.subject : `Re: ${thread.subject}`,
      proposedReplyBody: body,
      confidenceScore: classification.intentCategory === "general_inquiry" ? 0.62 : 0.78,
      riskScore: classification.riskLevel === "critical" ? 0.95 : classification.riskLevel === "high" ? 0.8 : 0.35,
      riskLevel: classification.riskLevel,
      routingProvenance: routingResolution
    });
  }

  private composeDraftBody(
    thread: NormalizedEmailThread,
    classification: EmailThreadClassification,
    routingResolution: ReturnType<EmailRoutingService["resolveIntent"]>
  ): string {
    if (classification.escalationRequired) {
      return [
        `Thank you for your message regarding "${thread.subject}".`,
        "We are reviewing this with the appropriate owner before providing a final response.",
        routingResolution.target.targetType === "lead_agent"
          ? `This has been escalated to ${routingResolution.target.leadAgentId} for review.`
          : `This has been escalated to the ${routingResolution.target.executiveId} lane for review.`
      ].join("\n\n");
    }

    return [
      `Thank you for reaching out about "${thread.subject}".`,
      "We have reviewed your message and are preparing the right next step.",
      routingResolution.target.targetType === "lead_agent"
        ? `Your thread is being routed to ${routingResolution.target.leadAgentId} for follow-up.`
        : `Your thread is being routed to the ${routingResolution.target.executiveId} operations lane for follow-up.`
    ].join("\n\n");
  }

  private buildProcessingResult(
    args: ProcessEmailThreadArgs,
    classification: EmailThreadClassification,
    routingResolution: ReturnType<EmailRoutingService["resolveIntent"]>,
    draft: EmailDraftSuggestion | null,
    reviewItem: EmailDraftReviewRecord | null
  ): EmailProcessingResult {
    const assignmentIntegration: EmailAssignmentIntegrationRequest = {
      tenantId: args.tenantId,
      requestedBy: args.actorId,
      correlationId: args.correlationId,
      thread: args.thread,
      intentCategory: classification.intentCategory,
      routing: routingResolution
    };

    return {
      reviewItemId: reviewItem?.reviewItemId ?? null,
      status:
        routingResolution.target.targetType === "suppressed"
          ? "suppressed"
          : draft?.escalationRecommended
            ? "escalated"
            : "drafted",
      threadId: args.thread.providerThreadId,
      intentCategory: classification.intentCategory,
      priority: classification.priority,
      riskLevel: classification.riskLevel,
      classification,
      routing: routingResolution,
      draft,
      assignmentIntegration,
      incidentIntegration: null
    };
  }
}

function toOutcomeSummary(outcome: EmailThreadProcessingOutcome): EmailThreadProcessingOutcomeSummary {
  return {
    reviewItemId: outcome.result.reviewItemId,
    threadId: outcome.result.threadId,
    assignmentRecordId: outcome.assignmentRecordId,
    runRecordId: outcome.runRecordId,
    status: outcome.result.status,
    intentCategory: outcome.result.intentCategory,
    approvalRequired: outcome.result.draft?.approvalRequired ?? true,
    blockedAutoSend: true
  };
}
