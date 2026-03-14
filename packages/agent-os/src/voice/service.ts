import { randomUUID } from "node:crypto";

import { AgentExecutionLedgerService } from "../execution/ledger.js";
import { AgentIncidentService } from "../incidents/service.js";
import type { AgentOsRepository } from "../persistence/repository.js";
import { VoiceCallClassifier } from "./classifier.js";
import { VoiceIntakeService, VoiceIntakeValidationError } from "./intake.js";
import { VoiceRoutingService } from "./routing.js";
import type {
  NormalizedVoiceCall,
  VoiceCallRecord,
  VoiceCallSummary,
  VoiceCompanyMode,
  VoiceIntakePayload,
  VoiceInterruptionClass,
  VoiceProcessingResult
} from "./types.js";

export class VoiceRuntimeError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export class VoiceRuntimeService {
  constructor(
    private readonly repository: AgentOsRepository,
    private readonly ledger: AgentExecutionLedgerService = new AgentExecutionLedgerService(repository),
    private readonly incidents: AgentIncidentService = new AgentIncidentService(repository),
    private readonly intake: VoiceIntakeService = new VoiceIntakeService(),
    private readonly classifier: VoiceCallClassifier = new VoiceCallClassifier(),
    private readonly routing: VoiceRoutingService = new VoiceRoutingService()
  ) {}

  async processInboundCall(args: {
    tenantId: string;
    actorId: string;
    correlationId: string;
    requestSource: string;
    payload: VoiceIntakePayload;
    createdAt?: string;
  }): Promise<VoiceProcessingResult> {
    const createdAt = args.createdAt ?? new Date().toISOString();
    let assignmentRecordId: string | null = null;
    let runRecordId: string | null = null;

    try {
      const normalized = this.intake.normalize(args.payload);
      const classification = this.classifier.classify(normalized);
      const routing = this.routing.resolve(classification);

      const assignment = await this.ledger.createAssignment({
        tenantId: args.tenantId,
        correlationId: args.correlationId,
        requestSource: args.requestSource,
        requestedBy: args.actorId,
        requestedTaskCategory: null,
        requestMetadata: this.buildAssignmentMetadata(normalized, classification, routing.trace),
        requestedExecutionTarget:
          routing.target.targetType === "lead_agent" ? routing.target.leadAgentId : routing.target.targetType === "founder_review" ? "aaliyah" : null,
        policyDecision: "approved",
        policyDecisionReason: "voice intake is governed through deterministic voice routing"
      });
      assignmentRecordId = assignment.assignmentRecordId;

      let run = await this.ledger.createRun({
        tenantId: args.tenantId,
        assignmentRecordId,
        metadata: {
          channel: "voice",
          sourceSystem: normalized.sourceSystem
        },
        requestedAt: createdAt
      });
      runRecordId = run.runRecordId;
      run = await this.ledger.transition({ tenantId: args.tenantId, runRecord: run, transition: "validate", transitionedAt: createdAt });
      run = await this.ledger.transition({ tenantId: args.tenantId, runRecord: run, transition: "route", transitionedAt: createdAt });

      const summary = this.buildSummary(normalized, classification.companyMode, classification, routing);
      const outcome = routing.target.targetType === "suppressed" ? "suppressed" : classification.escalationRecommended ? "escalated" : "routed";

      const call = await this.repository.createVoiceCallRecord({
        tenantId: args.tenantId,
        externalCallId: normalized.externalCallId,
        sourceSystem: normalized.sourceSystem,
        callerPhoneNumber: normalized.caller.phoneNumber,
        callerDisplayName: normalized.caller.displayName,
        callerOrganizationName: normalized.caller.organizationName,
        transcript: normalized.transcript,
        callSummaryText: normalized.callSummary,
        durationSeconds: normalized.durationSeconds,
        intent: classification.intent,
        urgency: classification.urgency,
        riskLevel: classification.riskLevel,
        companyMode: classification.companyMode,
        routingTarget: routing.target,
        assignmentRecordId,
        runRecordId,
        outcome,
        founderAttentionRequired: classification.founderAttentionRequired,
        escalationRecommended: classification.escalationRecommended,
        interruptionClass: summary.interruptionClass,
        recommendedNextAction: summary.recommendedNextAction,
        createdAt
      });

      run = await this.ledger.transition({ tenantId: args.tenantId, runRecord: run, transition: "succeed", transitionedAt: createdAt });

      return {
        call,
        summary
      };
    } catch (error) {
      if (assignmentRecordId && runRecordId) {
        const run = await this.ledger.getExecutionRunRecord({ tenantId: args.tenantId, runRecordId });
        if (run && run.currentState !== "failed" && run.currentState !== "succeeded") {
          await this.ledger.transition({
            tenantId: args.tenantId,
            runRecord: run,
            transition: "fail",
            failureCategory: "voice_runtime_failure",
            failureMessage: error instanceof Error ? error.message : "voice_runtime_failure",
            transitionedAt: createdAt
          });
        }
      }

      if (!(error instanceof VoiceIntakeValidationError)) {
        await this.incidents.createFromExecutionFailure({
          tenantId: args.tenantId,
          actorId: args.actorId,
          failure: {
            incidentType: "execution_runtime_failure",
            sourceSystem: "voice-runtime",
            message: error instanceof Error ? error.message : "voice_runtime_failure",
            details: {
              correlationId: args.correlationId,
              requestSource: args.requestSource
            },
            relatedAssignmentRecordId: assignmentRecordId,
            relatedRunRecordId: runRecordId
          },
          createdAt
        });
      }

      throw error;
    }
  }

  async getCall(args: { tenantId: string; callId: string }): Promise<VoiceCallRecord | null> {
    return this.repository.getVoiceCallRecord(args);
  }

  async listPendingEscalations(args: { tenantId: string; limit?: number }): Promise<VoiceCallRecord[]> {
    return this.repository.listVoiceCallRecords({
      tenantId: args.tenantId,
      founderAttentionRequired: true,
      limit: args.limit
    });
  }

  private buildSummary(
    normalized: NormalizedVoiceCall,
    companyMode: VoiceCompanyMode,
    classification: ReturnType<VoiceCallClassifier["classify"]>,
    routing: ReturnType<VoiceRoutingService["resolve"]>
  ): VoiceCallSummary {
    const callerDisplay = normalized.caller.displayName ?? normalized.caller.organizationName ?? normalized.caller.phoneNumber;
    const interruptionClass: VoiceInterruptionClass =
      classification.urgency === "critical" || classification.founderAttentionRequired
        ? "interrupt_now"
        : classification.urgency === "high"
          ? "review_soon"
          : "can_wait";

    const recommendedNextAction =
      routing.target.targetType === "suppressed"
        ? "No escalation needed. Keep a light audit trail and close safely."
        : routing.target.targetType === "founder_review"
          ? "Route this call summary into Aaliyah founder review before any response or commitment."
          : routing.target.targetType === "lead_agent"
            ? `Route this call to ${routing.target.leadAgentId} for governed follow-up.`
            : `Route this call into the ${routing.target.departmentId} executive lane for operator handling.`;

    return {
      callerDisplay,
      intent: classification.intent,
      urgency: classification.urgency,
      riskLevel: classification.riskLevel,
      companyMode,
      routingTarget: routing.target,
      recommendedNextAction,
      founderAttentionRequired: classification.founderAttentionRequired,
      interruptionClass
    };
  }

  private buildAssignmentMetadata(
    normalized: NormalizedVoiceCall,
    classification: ReturnType<VoiceCallClassifier["classify"]>,
    trace: string[]
  ) {
    return {
      channel: "voice",
      sourceSystem: normalized.sourceSystem,
      callerPhoneNumber: normalized.caller.phoneNumber,
      callerDisplayName: normalized.caller.displayName,
      callerOrganizationName: normalized.caller.organizationName,
      transcriptLength: normalized.transcript.length,
      intent: classification.intent,
      urgency: classification.urgency,
      riskLevel: classification.riskLevel,
      founderAttentionRequired: classification.founderAttentionRequired,
      trace
    };
  }
}
