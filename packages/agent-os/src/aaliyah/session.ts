import { randomUUID } from "node:crypto";

import { AaliyahMemoryBoundaryService } from "./memory-boundary.js";
import type { AaliyahDiagnosticsService } from "./diagnostics.js";
import { assertAaliyahSessionIntegrity } from "./session-guards.js";
import {
  appendIntentTrail,
  buildSessionSnapshotView,
  clearPendingDisambiguation,
  closeWorkingItemContext,
  createBoundaryViolation,
  createInitialAaliyahSession,
  hardResetSession,
  invalidateReviewContext,
  isHardExpired,
  isIdleExpired,
  setPendingDisambiguation,
  setReviewApprovalContext,
  setWorkingItemContext,
  softResetSession,
  switchSessionMode
} from "./session-state.js";
import type {
  AaliyahBoundaryViolationResult,
  AaliyahIntentTrailEntry,
  AaliyahReviewApprovalContext,
  AaliyahSessionContext,
  AaliyahSessionResetReason,
  AaliyahSessionResetResult,
  AaliyahSessionSnapshotView,
  AaliyahWorkingItemContext
} from "./session-types.js";
import type { FounderBriefingMode } from "./briefing-types.js";
import type { AaliyahFounderQueueItem } from "./review-queue-types.js";
import type {
  AaliyahRuntimeIntent,
  AaliyahRuntimeRequestContext,
  AaliyahRuntimeRequestInput,
  AaliyahRuntimeResult,
  AaliyahRuntimeMode
} from "./runtime-types.js";
import type { AgentOsRepository } from "../persistence/repository.js";
import type { EmailDraftReviewRecord } from "../email/review-types.js";
import type { VoiceCallRecord, VoiceProcessingResult } from "../voice/types.js";

const DEFAULT_COMPANY = "zbestmedia";

export class AaliyahSessionContextService {
  private readonly boundary: AaliyahMemoryBoundaryService;

  constructor(
    private readonly repository: AgentOsRepository,
    boundary?: AaliyahMemoryBoundaryService,
    private readonly diagnostics?: AaliyahDiagnosticsService
  ) {
    this.boundary = boundary ?? new AaliyahMemoryBoundaryService();
  }

  async resolveSession(args: {
    tenantId: string;
    actorId: string;
    principalContext: "founder" | "operator";
    requestedMode?: AaliyahRuntimeMode;
    generatedAt?: string;
  }): Promise<{
    session: AaliyahSessionContext;
    activeMode: AaliyahRuntimeMode;
    boundaryViolation: AaliyahBoundaryViolationResult | null;
  }> {
    const generatedAt = args.generatedAt ?? new Date().toISOString();
    let session = await this.repository.getAaliyahSessionContext({
      tenantId: args.tenantId,
      actorId: args.actorId,
      principalContext: args.principalContext
    });

    let resetTelemetry: { resetReason: string; resetScope: "soft" | "hard"; expiredPendingDisambiguation: boolean } | null = null;

    if (!session) {
      session = createInitialAaliyahSession({
        tenantId: args.tenantId,
        actorId: args.actorId,
        principalContext: args.principalContext,
        activeMode: args.requestedMode ?? "founder",
        generatedAt
      });
    }

    if (isHardExpired(session, generatedAt)) {
      const expiredPendingDisambiguation = Boolean(session.interactionState.pendingDisambiguation);
      session = hardResetSession(session, "hard_expired", generatedAt);
      resetTelemetry = { resetReason: "hard_expired", resetScope: "hard", expiredPendingDisambiguation };
    } else if (isIdleExpired(session, generatedAt)) {
      const expiredPendingDisambiguation = Boolean(session.interactionState.pendingDisambiguation);
      session = softResetSession(session, "idle_expired", generatedAt, "expired");
      resetTelemetry = { resetReason: "idle_expired", resetScope: "soft", expiredPendingDisambiguation };
    }

    let boundaryViolation: AaliyahBoundaryViolationResult | null = null;
    if (args.requestedMode && args.requestedMode !== session.activeModeState.activeMode) {
      const decision = this.boundary.validate({
        activeMode: session.activeModeState.activeMode,
        requestedMode: args.requestedMode,
        requestedCompanies: [args.requestedMode === "founder" ? DEFAULT_COMPANY : args.requestedMode],
        detailLevel: args.requestedMode === "founder" ? "summary" : "detail"
      });
      if (decision.access === "denied") {
        const expiredPendingDisambiguation = Boolean(session.interactionState.pendingDisambiguation);
        session = softResetSession(session, "boundary_violation", generatedAt, "boundary_denied");
        resetTelemetry = { resetReason: "boundary_violation", resetScope: "soft", expiredPendingDisambiguation };
        boundaryViolation = createBoundaryViolation({
          activeMode: session.activeModeState.activeMode,
          requestedMode: args.requestedMode,
          requestedCompanies: [args.requestedMode === "founder" ? DEFAULT_COMPANY : args.requestedMode],
          access: decision.access,
          reasonCodes: decision.reasonCodes,
          enforcedReset: true,
          createdAt: generatedAt
        });
      } else {
        session = switchSessionMode(session, {
          targetMode: args.requestedMode,
          switchedAt: generatedAt,
          switchReason: "explicit_request",
          boundaryDecisionId: decision.decisionId
        });
      }
    }

    assertAaliyahSessionIntegrity(session);
    await this.repository.upsertAaliyahSessionContext({ session });
    if (resetTelemetry && this.diagnostics) {
      await this.diagnostics.recordEvent({
        tenantId: session.tenantId,
        actorId: session.actorId,
        principalContext: session.principalContext,
        activeMode: session.activeModeState.activeMode,
        eventType: "session_reset",
        eventSource: "aaliyah_session",
        signalKey: `session_reset:${resetTelemetry.resetReason}`,
        payload: resetTelemetry,
        createdAt: generatedAt
      });
    }

    return {
      session,
      activeMode: session.activeModeState.activeMode,
      boundaryViolation
    };
  }

  async getSessionSnapshot(args: {
    tenantId: string;
    actorId: string;
    principalContext: "founder" | "operator";
  }): Promise<AaliyahSessionSnapshotView> {
    const { session } = await this.resolveSession(args);
    return buildSessionSnapshotView(session);
  }

  async resetSession(args: {
    tenantId: string;
    actorId: string;
    principalContext: "founder" | "operator";
    resetReason?: AaliyahSessionResetReason;
    hardReset?: boolean;
    generatedAt?: string;
  }): Promise<AaliyahSessionResetResult> {
    const generatedAt = args.generatedAt ?? new Date().toISOString();
    const { session } = await this.resolveSession({
      tenantId: args.tenantId,
      actorId: args.actorId,
      principalContext: args.principalContext,
      generatedAt
    });

    const resetReason = args.resetReason ?? "manual_reset";
    const updated = args.hardReset
      ? hardResetSession(session, resetReason, generatedAt)
      : softResetSession(session, resetReason, generatedAt, "manual_reset");

    assertAaliyahSessionIntegrity(updated);
    await this.repository.upsertAaliyahSessionContext({ session: updated });
    if (this.diagnostics) {
      await this.diagnostics.recordEvent({
        tenantId: updated.tenantId,
        actorId: updated.actorId,
        principalContext: updated.principalContext,
        activeMode: updated.activeModeState.activeMode,
        eventType: "session_reset",
        eventSource: "aaliyah_session",
        signalKey: `session_reset:${resetReason}`,
        payload: {
          resetReason,
          resetScope: args.hardReset ? "hard" : "soft",
          expiredPendingDisambiguation: Boolean(session.interactionState.pendingDisambiguation)
        },
        createdAt: generatedAt
      });
    }
    return {
      session: buildSessionSnapshotView(updated),
      resetReason
    };
  }

  async applyRuntimeResult(args: {
    session: AaliyahSessionContext;
    request: AaliyahRuntimeRequestInput;
    result: AaliyahRuntimeResult;
    generatedAt: string;
  }): Promise<AaliyahSessionSnapshotView> {
    let session = appendIntentTrail(
      args.session,
      this.buildIntentTrailEntry({ request: args.request, result: args.result, generatedAt: args.generatedAt }),
      args.generatedAt
    );

    if (args.result.outcomeType === "fallback") {
      if (this.isAmbiguousFallback(args.result.fallback.reason)) {
        session = setPendingDisambiguation(session, args.result.fallback.reason, args.request.intent, args.generatedAt);
      } else {
        session = clearPendingDisambiguation(session, args.generatedAt);
      }
      assertAaliyahSessionIntegrity(session);
      await this.repository.upsertAaliyahSessionContext({ session });
      if (this.diagnostics) {
        await this.diagnostics.recordEvent({
          tenantId: session.tenantId,
          actorId: session.actorId,
          principalContext: session.principalContext,
          activeMode: session.activeModeState.activeMode,
          eventType: "runtime_result",
          eventSource: "aaliyah_runtime",
          signalKey: `runtime_fallback:${args.result.fallback.reason}`,
          payload: {
            requestIntent: args.request.intent,
            resolvedIntent: args.result.resolvedIntent,
            outcomeType: args.result.outcomeType,
            confidenceLevel: args.result.provenance.enforcement.confidence,
            fallbackOutcome: args.result.fallback.outcome,
            fallbackReason: args.result.fallback.reason,
            payloadType: null
          },
          createdAt: args.generatedAt
        });
      }
      return buildSessionSnapshotView(session);
    }

    session = clearPendingDisambiguation(session, args.generatedAt);

    switch (args.result.payloadType) {
      case "mode_switch": {
        session = switchSessionMode(session, {
          targetMode: args.result.payload.activeMode,
          switchedAt: args.generatedAt,
          switchReason: "runtime_switch_intent",
          boundaryDecisionId: null
        });
        break;
      }
      case "founder_queue_item": {
        session = this.applyQueueItem(session, args.result.payload, args.result.resolvedIntent, args.generatedAt);
        break;
      }
      case "voice_call_summary": {
        session = setWorkingItemContext(session, this.workingItemFromVoice(args.result.payload, args.result.resolvedIntent), args.generatedAt);
        break;
      }
      case "voice_call_result": {
        session = setWorkingItemContext(session, this.workingItemFromVoiceResult(args.result.payload, args.result.resolvedIntent), args.generatedAt);
        break;
      }
      case "email_review_action": {
        session = this.applyReviewAction(session, args.result.payload.item, args.result.payload.action, args.result.resolvedIntent, args.generatedAt);
        break;
      }
      case "email_dispatch_result": {
        session = this.applyDispatchResult(session, args.result.payload.dispatch, args.result.resolvedIntent, args.generatedAt);
        break;
      }
      default:
        break;
    }

    assertAaliyahSessionIntegrity(session);
    await this.repository.upsertAaliyahSessionContext({ session });
    if (this.diagnostics) {
      await this.diagnostics.recordEvent({
        tenantId: session.tenantId,
        actorId: session.actorId,
        principalContext: session.principalContext,
        activeMode: session.activeModeState.activeMode,
        eventType: "runtime_result",
        eventSource: "aaliyah_runtime",
        signalKey: `runtime_completed:${args.result.payloadType}`,
        payload: {
          requestIntent: args.request.intent,
          resolvedIntent: args.result.resolvedIntent,
          outcomeType: args.result.outcomeType,
          confidenceLevel: args.result.provenance.enforcement.confidence,
          fallbackOutcome: null,
          fallbackReason: null,
          payloadType: args.result.payloadType
        },
        createdAt: args.generatedAt
      });
    }
    return buildSessionSnapshotView(session);
  }

  resolveQueueItemId(parameters: Record<string, unknown> | undefined, session: AaliyahSessionContext): string | null {
    const direct = this.readOptionalString(parameters, "queueItemId");
    if (direct) {
      return direct;
    }
    const current = session.interactionState.workingItem;
    return current?.workingItemType === "founder_queue_item" ? current.queueItemId : null;
  }

  resolveReviewItemId(parameters: Record<string, unknown> | undefined, session: AaliyahSessionContext): string | null {
    const direct = this.readOptionalString(parameters, "reviewItemId");
    if (direct) {
      return direct;
    }
    return session.interactionState.reviewApprovalContext?.reviewItemId ?? session.interactionState.workingItem?.reviewItemId ?? null;
  }

  resolveVoiceCallId(parameters: Record<string, unknown> | undefined, session: AaliyahSessionContext): string | null {
    const direct = this.readOptionalString(parameters, "callId");
    if (direct) {
      return direct;
    }
    return session.interactionState.workingItem?.callId ?? null;
  }

  private applyQueueItem(
    session: AaliyahSessionContext,
    item: AaliyahFounderQueueItem,
    resolvedIntent: AaliyahRuntimeIntent,
    generatedAt: string
  ): AaliyahSessionContext {
    let updated = setWorkingItemContext(session, this.workingItemFromQueue(item, resolvedIntent), generatedAt);
    const reviewItemId = this.extractReviewItemId(item.sourceItemId);
    if (reviewItemId && (item.itemType === "approval_required" || item.itemType === "dispatch_action")) {
      updated = setReviewApprovalContext(
        updated,
        {
          reviewItemId,
          draftId: null,
          accountId: null,
          threadId: null,
          reviewStatus: item.itemType === "dispatch_action" ? "approved" : "pending_review",
          dispatchReady: item.itemType === "dispatch_action",
          setAt: generatedAt,
          updatedAt: generatedAt,
          invalidatedAt: null,
          invalidationReason: null
        },
        generatedAt
      );
    }
    return updated;
  }

  private applyReviewAction(
    session: AaliyahSessionContext,
    item: EmailDraftReviewRecord,
    action: "approve" | "reject" | "request_revision",
    resolvedIntent: AaliyahRuntimeIntent,
    generatedAt: string
  ): AaliyahSessionContext {
    let updated = session;
    if (action === "approve") {
      updated = setReviewApprovalContext(
        updated,
        this.reviewContextFromRecord(item, true, generatedAt),
        generatedAt
      );
      updated = setWorkingItemContext(
        updated,
        {
          contextId: `working-item:${randomUUID()}`,
          workingItemType: "dispatch_candidate",
          sourceSubsystem: "email_dispatch_queue",
          sourceItemId: `review:${item.reviewItemId}`,
          queueItemId: null,
          reviewItemId: item.reviewItemId,
          callId: null,
          incidentId: null,
          dispatchId: null,
          title: `Dispatch approved draft: ${item.proposedReplySubject}`,
          summary: item.draftSummary,
          founderAttentionRequired: item.priority === "urgent" || item.priority === "high",
          confidenceLevel: this.scoreToConfidence(item.confidenceScore),
          interruptionClass: item.priority === "urgent" ? "same_day_briefing" : "passive_queue",
          setByIntent: resolvedIntent,
          setAt: generatedAt,
          updatedAt: generatedAt,
          closureState: "open",
          closureReason: null,
          closedAt: null,
          closedByIntent: null
        },
        generatedAt
      );
      return updated;
    }

    updated = {
      ...updated,
      interactionState: {
        ...updated.interactionState,
        workingItem: closeWorkingItemContext(
          updated.interactionState.workingItem,
          action === "reject" ? "completed" : "invalidated",
          action === "reject" ? "review_rejected" : "revision_requested",
          generatedAt,
          resolvedIntent
        ),
        reviewApprovalContext: invalidateReviewContext(
          updated.interactionState.reviewApprovalContext,
          action === "reject" ? "review_rejected" : "revision_requested",
          generatedAt
        )
      },
      updatedAt: generatedAt,
      version: updated.version + 1
    };
    return updated;
  }

  private applyDispatchResult(
    session: AaliyahSessionContext,
    dispatch: { dispatchId: string; reviewItemId: string },
    resolvedIntent: AaliyahRuntimeIntent,
    generatedAt: string
  ): AaliyahSessionContext {
    return {
      ...session,
      interactionState: {
        ...session.interactionState,
        workingItem: closeWorkingItemContext(
          session.interactionState.workingItem,
          "completed",
          "email_dispatched",
          generatedAt,
          resolvedIntent
        ),
        reviewApprovalContext: invalidateReviewContext(
          session.interactionState.reviewApprovalContext,
          "email_dispatched",
          generatedAt
        )
      },
      updatedAt: generatedAt,
      version: session.version + 1
    };
  }

  private buildIntentTrailEntry(args: {
    request: AaliyahRuntimeRequestInput;
    result: AaliyahRuntimeResult;
    generatedAt: string;
  }): AaliyahIntentTrailEntry {
    return {
      entryId: `aaliyah-intent:${randomUUID()}`,
      sourceSurface: "aaliyah_runtime",
      requestId: args.result.provenance.requestId,
      requestedIntent: args.request.intent,
      resolvedIntent: args.result.resolvedIntent,
      activeMode: args.result.activeMode,
      outcomeType: args.result.outcomeType,
      confidenceLevel: args.result.provenance.enforcement.confidence,
      fallbackOutcome: args.result.outcomeType === "fallback" ? args.result.fallback.outcome : null,
      parameterSummary: {
        queueItemId: this.readOptionalString(args.request.parameters, "queueItemId") ?? undefined,
        reviewItemId: this.readOptionalString(args.request.parameters, "reviewItemId") ?? undefined,
        callId: this.readOptionalString(args.request.parameters, "callId") ?? undefined,
        incidentId: this.readOptionalString(args.request.parameters, "incidentId") ?? undefined,
        targetMode: this.readOptionalMode(args.request.parameters) ?? undefined
      },
      createdAt: args.generatedAt
    };
  }

  private workingItemFromQueue(item: AaliyahFounderQueueItem, resolvedIntent: AaliyahRuntimeIntent): AaliyahWorkingItemContext {
    return {
      contextId: `working-item:${randomUUID()}`,
      workingItemType: this.queueItemType(item.itemType),
      sourceSubsystem: item.sourceSubsystem,
      sourceItemId: item.sourceItemId,
      queueItemId: item.queueItemId,
      reviewItemId: this.extractReviewItemId(item.sourceItemId),
      callId: item.sourceSubsystem === "voice_intake" ? this.stripPrefix(item.sourceItemId, "voice:") : null,
      incidentId: item.sourceSubsystem === "incident_pipeline" ? this.stripPrefix(item.sourceItemId, "incident:") : null,
      dispatchId: null,
      title: item.title,
      summary: item.summary,
      founderAttentionRequired: item.founderAttentionRequired,
      confidenceLevel: item.confidenceLevel,
      interruptionClass: item.interruptionClass,
      setByIntent: resolvedIntent,
      setAt: item.updatedAt,
      updatedAt: item.updatedAt,
      closureState: "open",
      closureReason: null,
      closedAt: null,
      closedByIntent: null
    };
  }

  private workingItemFromVoice(call: VoiceCallRecord, resolvedIntent: AaliyahRuntimeIntent): AaliyahWorkingItemContext {
    return {
      contextId: `working-item:${randomUUID()}`,
      workingItemType: "voice_call",
      sourceSubsystem: "voice_intake",
      sourceItemId: `voice:${call.callId}`,
      queueItemId: null,
      reviewItemId: null,
      callId: call.callId,
      incidentId: null,
      dispatchId: null,
      title: `Voice call: ${call.callerDisplayName ?? call.callerPhoneNumber}`,
      summary: call.callSummaryText ?? call.recommendedNextAction,
      founderAttentionRequired: call.founderAttentionRequired,
      confidenceLevel: "high",
      interruptionClass: call.interruptionClass === "review_soon" ? "same_day_briefing" : call.interruptionClass === "can_wait" ? "passive_queue" : "interrupt_now",
      setByIntent: resolvedIntent,
      setAt: call.updatedAt,
      updatedAt: call.updatedAt,
      closureState: "open",
      closureReason: null,
      closedAt: null,
      closedByIntent: null
    };
  }

  private workingItemFromVoiceResult(result: VoiceProcessingResult, resolvedIntent: AaliyahRuntimeIntent): AaliyahWorkingItemContext {
    return this.workingItemFromVoice(result.call, resolvedIntent);
  }

  private reviewContextFromRecord(item: EmailDraftReviewRecord, dispatchReady: boolean, generatedAt: string): AaliyahReviewApprovalContext {
    return {
      reviewItemId: item.reviewItemId,
      draftId: item.draftId,
      accountId: item.accountId,
      threadId: item.threadId,
      reviewStatus: item.reviewStatus,
      dispatchReady,
      setAt: generatedAt,
      updatedAt: generatedAt,
      invalidatedAt: null,
      invalidationReason: null
    };
  }

  private queueItemType(itemType: AaliyahFounderQueueItem["itemType"]): AaliyahWorkingItemContext["workingItemType"] {
    switch (itemType) {
      case "approval_required":
        return "email_review_item";
      case "dispatch_action":
        return "dispatch_candidate";
      case "voice_escalation":
        return "voice_call";
      case "incident_attention":
        return "incident";
      case "routing_preview_action":
        return "routing_preview";
      default:
        return "founder_queue_item";
    }
  }

  private extractReviewItemId(sourceItemId: string): string | null {
    return sourceItemId.startsWith("review:") ? this.stripPrefix(sourceItemId, "review:") : null;
  }

  private stripPrefix(value: string, prefix: string): string | null {
    return value.startsWith(prefix) ? value.slice(prefix.length) : null;
  }

  private isAmbiguousFallback(reason: string): boolean {
    return reason.includes("missing_parameter") || reason.includes("not_found") || reason.includes("unsupported founder runtime intent");
  }

  private readOptionalString(parameters: Record<string, unknown> | undefined, key: string): string | null {
    const value = parameters?.[key];
    return typeof value === "string" && value.trim().length > 0 ? value : null;
  }

  private readOptionalMode(parameters: Record<string, unknown> | undefined): FounderBriefingMode | null {
    const value = parameters?.targetMode;
    return value === "founder" || value === "zbestmedia" ? value : null;
  }

  private scoreToConfidence(score: number): "high" | "medium" | "low" {
    if (score >= 0.85) {
      return "high";
    }
    if (score >= 0.6) {
      return "medium";
    }
    return "low";
  }
}
