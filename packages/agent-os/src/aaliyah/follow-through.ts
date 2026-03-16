import { randomUUID } from "node:crypto";

import { AaliyahAccessControlService } from "./access.js";
import { AaliyahMemoryBoundaryService } from "./memory-boundary.js";
import type { AaliyahDiagnosticsService } from "./diagnostics.js";
import { AaliyahIdempotencyService, stableRequestFingerprint } from "./idempotency.js";
import { AaliyahSessionContextService } from "./session.js";
import { assertAaliyahSessionIntegrity } from "./session-guards.js";
import {
  clearPendingDisambiguation,
  closeWorkingItemContext,
  invalidateReviewContext
} from "./session-state.js";
import type { AaliyahFounderQueueItem } from "./review-queue-types.js";
import type {
  AaliyahReviewApprovalContext,
  AaliyahSessionContext,
  AaliyahWorkingItemClosureReason
} from "./session-types.js";
import type {
  FollowThroughActionRequest,
  FollowThroughActionResult,
  FollowThroughEligibilityResult,
  FollowThroughHistoryEntry,
  FollowThroughRecord,
  FollowThroughStatus,
  NextGovernedAction,
  WorkingItemClosureEvent,
  WorkingItemClosureReason,
  WorkingItemClosureState
} from "./follow-through-types.js";
import type { AgentOsRepository } from "../persistence/repository.js";

const DEFAULT_COMPANY = "zbestmedia";

export class AaliyahFollowThroughService {
  private readonly boundary: AaliyahMemoryBoundaryService;
  private readonly access: AaliyahAccessControlService;

  constructor(
    private readonly repository: AgentOsRepository,
    private readonly sessions: AaliyahSessionContextService,
    boundary?: AaliyahMemoryBoundaryService,
    private readonly diagnostics?: AaliyahDiagnosticsService,
    private readonly idempotency: AaliyahIdempotencyService = new AaliyahIdempotencyService(repository)
  ) {
    this.boundary = boundary ?? new AaliyahMemoryBoundaryService();
    this.access = new AaliyahAccessControlService(this.boundary);
  }

  async getActiveFollowThrough(args: {
    tenantId: string;
    actorId: string;
    principalContext: "founder" | "operator";
    generatedAt?: string;
  }): Promise<FollowThroughRecord | null> {
    this.access.assertFounderPrincipal(args.principalContext);
    const generatedAt = args.generatedAt ?? new Date().toISOString();
    const { session } = await this.sessions.resolveSession({
      tenantId: args.tenantId,
      actorId: args.actorId,
      principalContext: args.principalContext,
      generatedAt
    });
    if (!session.interactionState.workingItem || session.interactionState.workingItem.closureState !== "open") {
      return null;
    }
    return this.ensureRecord(session, generatedAt);
  }

  async getFollowThroughHistory(args: {
    tenantId: string;
    actorId: string;
    principalContext: "founder" | "operator";
    limit?: number;
  }): Promise<FollowThroughHistoryEntry[]> {
    this.access.assertFounderPrincipal(args.principalContext);
    return this.repository.listAaliyahFollowThroughHistory({
      tenantId: args.tenantId,
      actorId: args.actorId,
      principalContext: args.principalContext,
      limit: args.limit ?? 25
    });
  }

  async applyAction(args: FollowThroughActionRequest): Promise<FollowThroughActionResult> {
    this.access.assertFounderPrincipal(args.principalContext);
    const generatedAt = args.generatedAt ?? new Date().toISOString();
    return this.idempotency.execute({
      tenantId: args.tenantId,
      actorId: args.actorId,
      principalContext: args.principalContext,
      operationName: "follow_through_action",
      idempotencyKey: args.idempotencyKey ?? null,
      requestFingerprint: stableRequestFingerprint([
        args.mode,
        args.action,
        args.queueItemId ?? null,
        args.closureReason,
        args.founderDeclaredCompletion === true,
        args.downstreamActionRef ?? null,
        args.escalationTarget ?? null,
        args.escalationClass ?? null,
        args.escalationRationale ?? null,
        args.escalationProvenance ?? null
      ]),
      startedAt: generatedAt,
      serializeResult: (result) => ({
        record: result.record,
        historyEntry: result.historyEntry,
        nextGovernedAction: result.nextGovernedAction
      }),
      deserializeResult: (payload) => payload as unknown as FollowThroughActionResult,
      execute: async () => {
        const { session } = await this.sessions.resolveSession({
          tenantId: args.tenantId,
          actorId: args.actorId,
          principalContext: args.principalContext,
          requestedMode: args.mode,
          generatedAt
        });

        const eligibility = await this.getEligibility({ ...args, generatedAt }, session);
        if (!eligibility.allowed) {
          await this.recordInvalidAction(args, session, eligibility.reason, generatedAt);
          throw new Error(eligibility.reason);
        }

        const current = await this.repository.createOrGetAaliyahFollowThroughRecord({
          record: this.buildRecord(session, generatedAt)
        });
        if (current.status !== "active") {
          await this.recordInvalidAction(args, session, "aaliyah_follow_through_terminal_immutable", generatedAt);
          throw new Error("aaliyah_follow_through_terminal_immutable");
        }

        const transition = this.resolveTransition(args);
        const nextGovernedAction = this.resolveNextAction(transition.status);

        const record: FollowThroughRecord = {
          ...current,
          version: current.version + 1,
          activeMode: session.activeModeState.activeMode,
          status: transition.status,
          closureState: transition.closureState,
          closureReason: args.closureReason,
          nextGovernedAction,
          founderDeclaredCompletion: Boolean(args.founderDeclaredCompletion),
          downstreamActionRef: args.downstreamActionRef ?? null,
          escalationTarget: args.escalationTarget ?? null,
          escalationClass: args.escalationClass ?? null,
          escalationRationale: args.escalationRationale ?? null,
          escalationProvenance: args.escalationProvenance ?? null,
          note: args.closureNote ?? null,
          updatedAt: generatedAt,
          closedAt: generatedAt
        };

        const historyEntry: WorkingItemClosureEvent = {
          tenantId: args.tenantId,
          eventId: `follow-through-event:${randomUUID()}`,
          followThroughId: record.followThroughId,
          action: args.action,
          previousStatus: current.status,
          resultingStatus: record.status,
          closureState: record.closureState,
          closureReason: args.closureReason,
          nextGovernedAction,
          founderDeclaredCompletion: Boolean(args.founderDeclaredCompletion),
          downstreamActionRef: args.downstreamActionRef ?? null,
          escalationTarget: args.escalationTarget ?? null,
          escalationClass: args.escalationClass ?? null,
          escalationRationale: args.escalationRationale ?? null,
          escalationProvenance: args.escalationProvenance ?? null,
          note: args.closureNote ?? null,
          actorId: args.actorId,
          createdAt: generatedAt
        };

        const updatedSession = this.applySessionClosure(session, args.closureReason, transition.closureState, generatedAt);
        assertAaliyahSessionIntegrity(updatedSession);

        const committed = await this.repository.commitAaliyahFollowThroughTransition({
          session: updatedSession,
          expectedSessionVersion: session.version,
          record,
          expectedFollowThroughVersion: current.version,
          historyEntry
        });

        return {
          record: committed.record,
          historyEntry: committed.historyEntry,
          nextGovernedAction
        };
      }
    });
  }

  async getEligibility(
    args: FollowThroughActionRequest & { generatedAt: string },
    existingSession?: AaliyahSessionContext
  ): Promise<FollowThroughEligibilityResult> {
    this.access.assertFounderPrincipal(args.principalContext);
    const session = existingSession
      ?? (await this.sessions.resolveSession({
        tenantId: args.tenantId,
        actorId: args.actorId,
        principalContext: args.principalContext,
        requestedMode: args.mode,
        generatedAt: args.generatedAt
      })).session;

    const decision = this.boundary.validate({
      activeMode: session.activeModeState.activeMode,
      requestedMode: args.mode,
      requestedCompanies: [args.mode === "founder" ? DEFAULT_COMPANY : args.mode],
      detailLevel: args.mode === "founder" ? "summary" : "detail"
    });
    if (decision.access === "denied") {
      return this.denied("aaliyah_follow_through_mode_boundary_denied", session, null, null);
    }

    const workingItem = this.resolveWorkingItem(session, args.queueItemId ?? null);
    if (!workingItem) {
      return this.denied("aaliyah_follow_through_missing_active_item", session, null, null);
    }

    if (workingItem.closureState !== "open") {
      return this.denied("aaliyah_follow_through_item_not_active", session, workingItem.contextId, null);
    }

    if (workingItem.queueItemId && args.queueItemId && workingItem.queueItemId !== args.queueItemId) {
      return this.denied("aaliyah_follow_through_target_mismatch", session, workingItem.contextId, null);
    }

    if (args.action === "complete") {
      if (!args.downstreamActionRef && !args.founderDeclaredCompletion) {
        return this.denied("aaliyah_follow_through_completed_requires_proof", session, workingItem.contextId, null);
      }
    }

    if (args.action === "escalate") {
      if (!args.escalationTarget && !args.escalationClass) {
        return this.denied("aaliyah_follow_through_escalation_target_required", session, workingItem.contextId, null);
      }
      if (!args.escalationRationale) {
        return this.denied("aaliyah_follow_through_escalation_rationale_required", session, workingItem.contextId, null);
      }
    }

    if (args.action === "complete" && args.closureReason === "email_dispatched" && !workingItem.reviewItemId) {
      return this.denied("aaliyah_follow_through_dispatch_without_review_context", session, workingItem.contextId, null);
    }

    return {
      allowed: true,
      reason: "allowed",
      sessionId: session.sessionId,
      activeMode: session.activeModeState.activeMode,
      workingItemId: workingItem.contextId,
      followThroughId: existingSession ? null : null,
      nextGovernedAction: this.resolveNextAction(this.resolveTransition(args).status)
    };
  }

  private denied(
    reason: string,
    session: AaliyahSessionContext,
    workingItemId: string | null,
    nextGovernedAction: NextGovernedAction | null
  ): FollowThroughEligibilityResult {
    return {
      allowed: false,
      reason,
      sessionId: session.sessionId,
      activeMode: session.activeModeState.activeMode,
      workingItemId,
      followThroughId: null,
      nextGovernedAction
    };
  }

  private async recordInvalidAction(
    args: FollowThroughActionRequest,
    session: AaliyahSessionContext,
    signalKey: string,
    createdAt: string
  ): Promise<void> {
    if (!this.diagnostics) {
      return;
    }
    await this.diagnostics.recordEvent({
      tenantId: args.tenantId,
      actorId: args.actorId,
      principalContext: args.principalContext,
      activeMode: session.activeModeState.activeMode,
      eventType: "follow_through_invalid_action",
      eventSource: "aaliyah_follow_through",
      signalKey,
      payload: {
        action: args.action,
        queueItemId: args.queueItemId ?? null,
        closureReason: args.closureReason
      },
      createdAt
    });
  }

  private resolveTransition(args: FollowThroughActionRequest): {
    status: FollowThroughStatus;
    closureState: WorkingItemClosureState;
  } {
    switch (args.action) {
      case "complete":
        return { status: "completed", closureState: "completed" };
      case "abandon":
        return { status: "abandoned", closureState: "abandoned" };
      case "escalate":
        return { status: "escalated", closureState: "escalated" };
      case "invalidate":
        return { status: "invalidated", closureState: "invalidated" };
      default:
        throw new Error("aaliyah_follow_through_unsupported_action");
    }
  }

  private resolveNextAction(status: FollowThroughStatus): NextGovernedAction {
    switch (status) {
      case "active":
        return "await_founder_review";
      case "completed":
      case "abandoned":
      case "invalidated":
      case "reset":
        return "select_new_queue_item";
      case "escalated":
        return "refresh_briefing";
      default:
        return "none_terminal";
    }
  }

  private async ensureRecord(session: AaliyahSessionContext, generatedAt: string): Promise<FollowThroughRecord> {
    const record = this.buildRecord(session, generatedAt);
    return this.repository.createOrGetAaliyahFollowThroughRecord({ record });
  }

  private buildRecord(session: AaliyahSessionContext, generatedAt: string): FollowThroughRecord {
    const item = this.requireWorkingItem(session, null);
    return {
      tenantId: session.tenantId,
      followThroughId: `follow-through:${randomUUID()}`,
      version: 1,
      sessionId: session.sessionId,
      actorId: session.actorId,
      principalContext: session.principalContext,
      activeMode: session.activeModeState.activeMode,
      companyScope: session.companyScope,
      workingItemType: item.workingItemType,
      sourceSubsystem: item.sourceSubsystem,
      sourceItemId: item.sourceItemId,
      queueItemId: item.queueItemId,
      reviewItemId: item.reviewItemId,
      callId: item.callId,
      incidentId: item.incidentId,
      dispatchId: item.dispatchId,
      title: item.title,
      summary: item.summary,
      status: "active",
      closureState: "active",
      closureReason: null,
      nextGovernedAction: this.deriveActiveNextAction(item),
      founderDeclaredCompletion: false,
      downstreamActionRef: null,
      escalationTarget: null,
      escalationClass: null,
      escalationRationale: null,
      escalationProvenance: null,
      note: null,
      provenance: {
        queueItemId: item.queueItemId,
        reviewItemId: item.reviewItemId,
        callId: item.callId,
        incidentId: item.incidentId,
        dispatchId: item.dispatchId,
        sessionVersion: session.version
      },
      createdAt: generatedAt,
      updatedAt: generatedAt,
      closedAt: null
    };
  }

  private deriveActiveNextAction(item: AaliyahSessionContext["interactionState"]["workingItem"]): NextGovernedAction {
    if (!item) {
      return "resolve_disambiguation";
    }
    switch (item.workingItemType) {
      case "founder_queue_item":
      case "email_review_item":
        return "await_founder_review";
      case "dispatch_candidate":
        return "dispatch_approved_email";
      case "voice_call":
        return "open_voice_escalation";
      default:
        return "refresh_briefing";
    }
  }

  private applySessionClosure(
    session: AaliyahSessionContext,
    closureReason: WorkingItemClosureReason,
    closureState: WorkingItemClosureState,
    generatedAt: string
  ): AaliyahSessionContext {
    const interactionState = session.interactionState;
    closeWorkingItemContext(
      interactionState.workingItem,
      closureState === "active" ? "reset" : closureState,
      this.mapSessionClosureReason(closureReason),
      generatedAt,
      null
    );
    const reviewReason = this.mapReviewInvalidationReason(closureReason);
    return {
      ...session,
      updatedAt: generatedAt,
      lastResetAt: generatedAt,
      lastResetReason: "working_item_closed",
      interactionState: {
        ...interactionState,
        lastResolvedIntent: interactionState.lastResolvedIntent,
        workingItem: null,
        reviewApprovalContext: reviewReason
          ? invalidateReviewContext(interactionState.reviewApprovalContext, reviewReason, generatedAt)
          : interactionState.reviewApprovalContext,
        pendingDisambiguation: clearPendingDisambiguation(session, generatedAt).interactionState.pendingDisambiguation
      },
      version: session.version + 1
    };
  }

  private mapSessionClosureReason(reason: WorkingItemClosureReason): AaliyahWorkingItemClosureReason {
    switch (reason) {
      case "review_approved":
      case "review_completed":
        return "review_approved";
      case "review_rejected":
        return "review_rejected";
      case "revision_requested":
        return "revision_requested";
      case "dispatch_confirmed":
      case "email_dispatched":
        return "email_dispatched";
      case "boundary_denied":
        return "boundary_denied";
      case "expired":
        return "expired";
      case "manual_reset":
        return "manual_reset";
      case "item_not_found":
        return "item_not_found";
      case "ambiguity":
        return "ambiguity";
      case "founder_declared_completed":
      case "founder_declared_abandoned":
      case "founder_declared_escalated":
      case "founder_declared_invalidated":
      case "voice_escalated":
      case "incident_acknowledged":
      case "incident_resolved":
        return "cleared_by_runtime";
      default:
        return "cleared_by_runtime";
    }
  }

  private mapReviewInvalidationReason(reason: WorkingItemClosureReason): AaliyahReviewApprovalContext["invalidationReason"] {
    switch (reason) {
      case "review_approved":
      case "review_completed":
        return "review_approved";
      case "review_rejected":
        return "review_rejected";
      case "revision_requested":
        return "revision_requested";
      case "dispatch_confirmed":
      case "email_dispatched":
        return "email_dispatched";
      case "item_not_found":
        return "item_not_found";
      case "manual_reset":
        return "manual_reset";
      case "expired":
        return "expired";
      default:
        return null;
    }
  }

  private resolveWorkingItem(session: AaliyahSessionContext, queueItemId: string | null) {
    const workingItem = session.interactionState.workingItem;
    if (!workingItem) {
      return null;
    }
    if (queueItemId && workingItem.queueItemId !== queueItemId) {
      return null;
    }
    return workingItem;
  }

  private requireWorkingItem(session: AaliyahSessionContext, queueItemId: string | null) {
    const workingItem = this.resolveWorkingItem(session, queueItemId);
    if (!workingItem) {
      throw new Error("aaliyah_follow_through_missing_active_item");
    }
    return workingItem;
  }
}
