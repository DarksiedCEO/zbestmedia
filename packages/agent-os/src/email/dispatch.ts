import type { AgentOsRepository } from "../persistence/repository.js";
import { AgentIncidentService } from "../incidents/service.js";
import type { EmailAccountConnectionRecord, EmailIntentCategory } from "./types.js";
import type { GmailConnectorFactory, GmailSendDraftResult } from "./gmail.js";
import type { EmailDraftReviewRecord } from "./review-types.js";
import type { EmailDispatchPolicyResult, EmailDispatchRecord, EmailDispatchRequest, EmailDispatchResult } from "./dispatch-types.js";

const HARD_BLOCKED_INTENTS: EmailIntentCategory[] = [
  "legal_or_sensitive",
  "billing_question",
  "technical_issue"
];

export class EmailDispatchError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export class EmailDraftDispatchService {
  constructor(
    private readonly repository: AgentOsRepository,
    private readonly incidents: AgentIncidentService,
    private readonly gmailRuntime: GmailConnectorFactory
  ) {}

  async getDispatchRecord(args: { tenantId: string; dispatchId: string }): Promise<EmailDispatchRecord | null> {
    return this.repository.getEmailDispatchRecord(args);
  }

  async dispatchApprovedReviewItem(args: EmailDispatchRequest): Promise<EmailDispatchResult> {
    const requestedAt = args.requestedAt ?? new Date().toISOString();
    const reviewItem = await this.repository.getEmailDraftReviewItem({
      tenantId: args.tenantId,
      reviewItemId: args.reviewItemId
    });
    if (!reviewItem) {
      throw new EmailDispatchError("email_dispatch_review_item_not_found");
    }

    const account = await this.repository.getEmailAccountConnection({
      tenantId: args.tenantId,
      accountId: reviewItem.accountId
    });
    if (!account) {
      throw new EmailDispatchError("email_dispatch_account_not_found");
    }

    const policy = this.evaluateDispatchPolicy(reviewItem, account);
    let dispatch = await this.repository.createEmailDispatchRecord({
      tenantId: args.tenantId,
      reviewItemId: reviewItem.reviewItemId,
      draftId: reviewItem.draftId,
      accountId: reviewItem.accountId,
      threadId: reviewItem.threadId,
      assignmentRecordId: reviewItem.assignmentRecordId,
      runRecordId: reviewItem.runRecordId,
      dispatchStatus: "dispatch_pending",
      dispatchPolicy: policy,
      requestedAt,
      auditMetadata: {
        actorId: args.actorId,
        ...args.auditMetadata
      },
      createdAt: requestedAt
    });

    if (!policy.allowed) {
      dispatch = await this.repository.updateEmailDispatchRecord({
        tenantId: args.tenantId,
        dispatchId: dispatch.dispatchId,
        dispatchStatus: "dispatch_blocked",
        dispatchPolicy: policy,
        failureCategory: "dispatch_policy_blocked",
        failureMessage: policy.reason,
        updatedAt: requestedAt
      });
      await this.appendDispatchExecutionStep({
        tenantId: args.tenantId,
        reviewItem,
        stepName: "email_draft_dispatch_blocked",
        status: "FAILED",
        payload: { reason: policy.reason, reviewStatus: reviewItem.reviewStatus, dispatchId: dispatch.dispatchId },
        createdAt: requestedAt
      });

      if (this.shouldCreatePolicyIncident(policy.reason)) {
        await this.incidents.createFromExecutionFailure({
          tenantId: args.tenantId,
          actorId: args.actorId,
          failure: {
            incidentType: "execution_policy_failure",
            sourceSystem: "email-dispatch-service",
            message: policy.reason,
            details: {
              reviewItemId: reviewItem.reviewItemId,
              draftId: reviewItem.draftId,
              accountId: reviewItem.accountId
            },
            relatedAssignmentRecordId: reviewItem.assignmentRecordId,
            relatedRunRecordId: reviewItem.runRecordId,
            releaseBlocking: false
          },
          createdAt: requestedAt
        });
      }

      return { dispatch, sent: false };
    }

    try {
      const connector = await this.gmailRuntime.createConnector({ account });
      await this.appendDispatchExecutionStep({
        tenantId: args.tenantId,
        reviewItem,
        stepName: "email_draft_dispatch_started",
        status: "COMPLETED",
        payload: { dispatchId: dispatch.dispatchId, accountId: account.accountId },
        createdAt: requestedAt
      });
      const sent = await connector.sendApprovedDraft({
        threadId: reviewItem.threadId,
        subject: reviewItem.proposedReplySubject,
        body: reviewItem.proposedReplyBody
      });
      dispatch = await this.repository.updateEmailDispatchRecord({
        tenantId: args.tenantId,
        dispatchId: dispatch.dispatchId,
        dispatchStatus: "dispatch_succeeded",
        dispatchPolicy: policy,
        dispatchedAt: requestedAt,
        gmailMessageId: sent.providerMessageId,
        gmailThreadId: sent.providerThreadId,
        auditMetadata: {
          ...dispatch.auditMetadata,
          connectorResult: sent
        },
        updatedAt: requestedAt
      });
      await this.appendDispatchExecutionStep({
        tenantId: args.tenantId,
        reviewItem,
        stepName: "email_draft_dispatch_succeeded",
        status: "COMPLETED",
        payload: {
          dispatchId: dispatch.dispatchId,
          providerMessageId: sent.providerMessageId,
          providerThreadId: sent.providerThreadId
        },
        createdAt: requestedAt
      });
      return { dispatch, sent: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : "email_dispatch_failed";
      dispatch = await this.repository.updateEmailDispatchRecord({
        tenantId: args.tenantId,
        dispatchId: dispatch.dispatchId,
        dispatchStatus: "dispatch_failed",
        dispatchPolicy: policy,
        failureCategory: "gmail_dispatch_failure",
        failureMessage: message,
        updatedAt: requestedAt
      });
      await this.appendDispatchExecutionStep({
        tenantId: args.tenantId,
        reviewItem,
        stepName: "email_draft_dispatch_failed",
        status: "FAILED",
        payload: { dispatchId: dispatch.dispatchId, error: message },
        createdAt: requestedAt
      });
      await this.incidents.createFromExecutionFailure({
        tenantId: args.tenantId,
        actorId: args.actorId,
        failure: {
          incidentType: "execution_runtime_failure",
          sourceSystem: "email-dispatch-service",
          message,
          details: {
            reviewItemId: reviewItem.reviewItemId,
            accountId: reviewItem.accountId,
            dispatchId: dispatch.dispatchId
          },
          relatedAssignmentRecordId: reviewItem.assignmentRecordId,
          relatedRunRecordId: reviewItem.runRecordId,
          releaseBlocking: false
        },
        createdAt: requestedAt
      });
      return { dispatch, sent: false };
    }
  }

  private evaluateDispatchPolicy(
    reviewItem: EmailDraftReviewRecord,
    account: EmailAccountConnectionRecord
  ): EmailDispatchPolicyResult {
    if (reviewItem.reviewStatus !== "approved") {
      return {
        allowed: false,
        hardBlocked: true,
        reason: `email_dispatch_requires_approved_review:${reviewItem.reviewStatus}`
      };
    }
    if (reviewItem.requiredApproval !== true || reviewItem.blockedAutoSend !== true) {
      return {
        allowed: false,
        hardBlocked: true,
        reason: "email_dispatch_review_invariant_violation"
      };
    }
    if (!account.processingEnabled) {
      return {
        allowed: false,
        hardBlocked: false,
        reason: "email_dispatch_account_processing_disabled"
      };
    }
    if (account.connectionStatus !== "connected") {
      return {
        allowed: false,
        hardBlocked: false,
        reason: `email_dispatch_account_not_connected:${account.connectionStatus}`
      };
    }
    if (!account.draftOnlyMode) {
      return {
        allowed: false,
        hardBlocked: true,
        reason: "email_dispatch_requires_draft_only_account"
      };
    }
    if (!account.tokenReference) {
      return {
        allowed: false,
        hardBlocked: false,
        reason: "email_dispatch_missing_token_reference"
      };
    }
    if (HARD_BLOCKED_INTENTS.includes(reviewItem.intentCategory)) {
      return {
        allowed: false,
        hardBlocked: true,
        reason: `email_dispatch_category_blocked:${reviewItem.intentCategory}`
      };
    }
    if (reviewItem.riskLevel === "high" || reviewItem.riskLevel === "critical") {
      return {
        allowed: false,
        hardBlocked: true,
        reason: `email_dispatch_risk_blocked:${reviewItem.riskLevel}`
      };
    }
    return {
      allowed: true,
      hardBlocked: false,
      reason: "email_dispatch_policy_approved"
    };
  }

  private shouldCreatePolicyIncident(reason: string): boolean {
    return (
      reason.startsWith("email_dispatch_requires_approved_review") ||
      reason === "email_dispatch_review_invariant_violation" ||
      reason === "email_dispatch_account_processing_disabled" ||
      reason.startsWith("email_dispatch_account_not_connected") ||
      reason === "email_dispatch_missing_token_reference"
    );
  }

  private async appendDispatchExecutionStep(args: {
    tenantId: string;
    reviewItem: EmailDraftReviewRecord;
    stepName: string;
    status: "COMPLETED" | "FAILED";
    payload: Record<string, unknown>;
    createdAt: string;
  }): Promise<void> {
    if (!args.reviewItem.runRecordId) {
      return;
    }
    const run = await this.repository.getExecutionRunRecord({
      tenantId: args.tenantId,
      runRecordId: args.reviewItem.runRecordId
    });
    if (!run?.executionId) {
      return;
    }
    await this.repository.appendExecutionStep({
      tenantId: args.tenantId,
      executionId: run.executionId,
      stepName: args.stepName,
      stepOrder: args.status === "COMPLETED" ? 90 : 91,
      status: args.status,
      payload: args.payload,
      createdAt: args.createdAt
    });
  }
}

export type { GmailSendDraftResult };
