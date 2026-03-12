import { randomUUID } from "node:crypto";

import type { ExecutionRecord } from "../persistence/contracts.js";
import type { AgentOsRepository } from "../persistence/repository.js";
import { AgentExecutionLedgerService } from "../execution/ledger.js";
import { AgentIncidentService } from "../incidents/service.js";
import { EmailThreadClassifier } from "./classifier.js";
import { buildEmailDraftSuggestion } from "./drafts.js";
import type { GmailConnector } from "./gmail.js";
import { EmailRoutingService } from "./routing.js";
import { assembleAaliyahPrompt, type AaliyahPromptAssembly } from "./prompts.js";
import type {
  EmailAssignmentIntegrationRequest,
  EmailDraftSuggestion,
  EmailIncidentIntegrationRequest,
  EmailProcessingResult,
  EmailThreadClassification,
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
};

export class EmailProcessingError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export class EmailAssistantService {
  constructor(
    private readonly repository: AgentOsRepository,
    private readonly ledger: AgentExecutionLedgerService = new AgentExecutionLedgerService(repository),
    private readonly incidents: AgentIncidentService = new AgentIncidentService(repository),
    private readonly classifier: EmailThreadClassifier = new EmailThreadClassifier(),
    private readonly routing: EmailRoutingService = new EmailRoutingService()
  ) {}

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
      const result = this.buildProcessingResult(args, classification, routingResolution, draft);

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
        payload: { draftId: draft?.draftId ?? null, approvalRequired: draft?.approvalRequired ?? false },
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
        promptAssembly
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

  private buildAssignmentMetadata(
    thread: NormalizedEmailThread,
    classification: EmailThreadClassification,
    promptAssembly: AaliyahPromptAssembly
  ) {
    return {
      channel: "email",
      provider: thread.provider,
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
        `Thank you for your message regarding \"${thread.subject}\".`,
        "We are reviewing this with the appropriate owner before providing a final response.",
        routingResolution.target.targetType === "lead_agent"
          ? `This has been escalated to ${routingResolution.target.leadAgentId} for review.`
          : `This has been escalated to the ${routingResolution.target.executiveId} lane for review.`
      ].join("\n\n");
    }

    return [
      `Thank you for reaching out about \"${thread.subject}\".`,
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
    draft: EmailDraftSuggestion | null
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
