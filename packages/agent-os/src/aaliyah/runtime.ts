import { randomUUID } from "node:crypto";

import { AALIYAH_REGISTRY_VERSION } from "./registry-types.js";
import { AaliyahFounderBriefingService } from "./briefing.js";
import { AaliyahCommandSurfaceService } from "./command-surface.js";
import { AaliyahMemoryBoundaryService } from "./memory-boundary.js";
import { AaliyahPreferenceService } from "./preferences.js";
import { AaliyahFounderReviewQueueService } from "./review-queue.js";
import { AaliyahSessionContextService } from "./session.js";
import { AaliyahFollowThroughService } from "./follow-through.js";
import { AaliyahFounderInboxTriageService } from "./triage.js";
import { AaliyahRuntimeEnforcementService } from "./runtime-enforcement.js";
import type {
  AaliyahRuntimeDecisionTrace,
  AaliyahRuntimeFallback,
  AaliyahRuntimeIntent,
  AaliyahRuntimeMode,
  AaliyahRuntimeRequestContext,
  AaliyahRuntimeRequestInput,
  AaliyahRuntimeResult
} from "./runtime-types.js";
import { AgentOrgService } from "../org/service.js";
import { AgentTelemetryService } from "../telemetry/service.js";
import { AgentAdminService } from "../admin/service.js";
import { EmailAssistantService } from "../email/service.js";
import { VoiceRuntimeService } from "../voice/service.js";
import { VoiceIntakeValidationError } from "../voice/intake.js";
import type { VoiceIntakePayload } from "../voice/types.js";

const SUPPORTED_INTENTS = new Set<AaliyahRuntimeIntent>([
  "get_founder_briefing",
  "get_waiting_approvals",
  "get_email_review_queue",
  "approve_email_review_item",
  "reject_email_review_item",
  "request_email_revision",
  "dispatch_approved_email",
  "get_ops_status",
  "get_incident_summary",
  "switch_mode",
  "preview_routing",
  "process_voice_intake",
  "get_voice_call_summary",
  "get_pending_voice_escalations",
  "get_founder_command_surface",
  "get_quick_actions",
  "execute_quick_action",
  "get_interrupt_queue",
  "get_confidence_summary",
  "get_founder_preferences",
  "get_memory_boundary_summary",
  "get_founder_review_queue",
  "get_founder_queue_item",
  "get_founder_queue_summary",
  "get_session_snapshot",
  "reset_session_context",
  "complete_active_item",
  "abandon_active_item",
  "escalate_active_item",
  "invalidate_active_item",
  "get_active_follow_through",
  "get_follow_through_history",
  "get_prioritized_founder_inbox",
  "get_blocked_founder_items",
  "get_stale_founder_items"
]);

const DEFAULT_MODE: AaliyahRuntimeMode = "founder";

export class AaliyahRuntimeService {
  private readonly runtime = new AaliyahRuntimeEnforcementService();
  private readonly boundary: AaliyahMemoryBoundaryService;

  constructor(
    private readonly org: AgentOrgService,
    private readonly briefing: AaliyahFounderBriefingService,
    private readonly commandSurface: AaliyahCommandSurfaceService,
    private readonly email: EmailAssistantService,
    private readonly voice: VoiceRuntimeService,
    private readonly telemetry: AgentTelemetryService,
    private readonly admin: AgentAdminService,
    private readonly reviewQueue: AaliyahFounderReviewQueueService,
    private readonly sessions: AaliyahSessionContextService,
    private readonly followThrough: AaliyahFollowThroughService,
    private readonly triage: AaliyahFounderInboxTriageService,
    private readonly preferences?: AaliyahPreferenceService,
    boundary?: AaliyahMemoryBoundaryService
  ) {
    this.boundary = boundary ?? new AaliyahMemoryBoundaryService();
  }

  async execute(args: AaliyahRuntimeRequestContext & { request: AaliyahRuntimeRequestInput }): Promise<AaliyahRuntimeResult> {
    const runtimeRequestId = `aaliyah-runtime:${randomUUID()}`;
    const generatedAt = new Date().toISOString();
    const sessionResolution = await this.sessions.resolveSession({
      tenantId: args.tenantId,
      actorId: args.actorId,
      principalContext: args.principalContext ?? "founder",
      requestedMode: args.request.mode,
      generatedAt
    });
    const activeMode = sessionResolution.activeMode ?? DEFAULT_MODE;
    const resolvedIntent = this.resolveIntent(args.request.intent);
    if (sessionResolution.boundaryViolation) {
      return this.finalizeRuntimeResult(sessionResolution.session, args.request, generatedAt, this.buildFallback({
        runtimeRequestId,
        activeMode,
        generatedAt,
        requestId: args.requestId ?? null,
        resolvedIntent,
        invokedSurface: "aaliyah-session",
        enforcement: {
          requestedAgentId: "aaliyah",
          requestedAtomicTaskId: "executive_orchestration_founder_protection",
          resolvedAgentId: "aaliyah",
          resolvedAtomicTaskId: "executive_orchestration_founder_protection",
          confidence: "low",
          company: "zbestmedia",
          mode: "executive_assistant",
          principalContext: args.principalContext ?? "founder",
          approvalState: "not_required",
          approvalClass: "orchestration_only",
          reason: sessionResolution.boundaryViolation.reasonCodes.join(",")
        },
        fallback: {
          outcome: "deny_due_to_mode_boundary",
          reason: sessionResolution.boundaryViolation.reasonCodes.join(","),
          delegateToAgentId: null
        }
      }));
    }
    const enforcement = this.runtime.evaluate({
      requestedAgentId: "aaliyah",
      requestedAtomicTaskId: "executive_orchestration_founder_protection",
      confidence: this.resolveConfidence(resolvedIntent, args.request.parameters),
      company: "zbestmedia",
      mode: "executive_assistant",
      principalContext: args.principalContext ?? "founder",
      approvalState: "not_required",
      memoryRequest: {
        companies: ["zbestmedia"],
        modes: ["executive_assistant"]
      }
    });

    if (!resolvedIntent) {
      return this.finalizeRuntimeResult(sessionResolution.session, args.request, generatedAt, this.buildFallback({
        runtimeRequestId,
        activeMode,
        generatedAt,
        requestId: args.requestId ?? null,
        resolvedIntent: null,
        invokedSurface: "aaliyah-runtime",
        enforcement: {
          ...enforcement.trace,
          reason: "unsupported founder runtime intent"
        },
        fallback: {
          outcome: "escalate_for_clarification",
          reason: "unsupported founder runtime intent",
          delegateToAgentId: null
        }
      }));
    }

    if (!enforcement.allowed) {
      return this.finalizeRuntimeResult(sessionResolution.session, args.request, generatedAt, this.buildFallback({
        runtimeRequestId,
        activeMode,
        generatedAt,
        requestId: args.requestId ?? null,
        resolvedIntent,
        invokedSurface: "aaliyah-runtime",
        enforcement: enforcement.trace,
        fallback: {
          outcome: enforcement.fallbackOutcome === "proceed_with_orchestration"
            ? "escalate_for_clarification"
            : enforcement.fallbackOutcome,
          reason: enforcement.trace.reason,
          delegateToAgentId: enforcement.delegateToAgentId
        }
      }));
    }

    try {
      let result: AaliyahRuntimeResult;
      switch (resolvedIntent) {
      case "get_founder_briefing": {
        const payload = await this.briefing.generateBriefing({
          tenantId: args.tenantId,
          mode: activeMode
        });
        result = this.buildSuccess({
          runtimeRequestId,
          activeMode,
          resolvedIntent,
          generatedAt,
          requestId: args.requestId ?? null,
          invokedSurface: "aaliyah-founder-briefing",
          enforcement: enforcement.trace,
          payloadType: "founder_briefing",
          payload
        });
        break;
      }
      case "get_founder_command_surface": {
        const payload = await this.commandSurface.generateCommandSurface({
          tenantId: args.tenantId,
          actorId: args.actorId,
          mode: activeMode
        });
        result = this.buildSuccess({
          runtimeRequestId,
          activeMode,
          resolvedIntent,
          generatedAt,
          requestId: args.requestId ?? null,
          invokedSurface: "aaliyah-command-surface",
          enforcement: enforcement.trace,
          payloadType: "founder_command_surface",
          payload
        });
        break;
      }
      case "get_quick_actions": {
        const items = this.commandSurface.listQuickActions({
          tenantId: args.tenantId,
          mode: activeMode
        });
        result = this.buildSuccess({
          runtimeRequestId,
          activeMode,
          resolvedIntent,
          generatedAt,
          requestId: args.requestId ?? null,
          invokedSurface: "aaliyah-quick-actions",
          enforcement: enforcement.trace,
          payloadType: "quick_actions",
          payload: { items }
        });
        break;
      }
      case "get_interrupt_queue": {
        const payload = await this.commandSurface.getInterruptionQueue({
          tenantId: args.tenantId,
          mode: activeMode
        });
        result = this.buildSuccess({
          runtimeRequestId,
          activeMode,
          resolvedIntent,
          generatedAt,
          requestId: args.requestId ?? null,
          invokedSurface: "aaliyah-interruptions",
          enforcement: enforcement.trace,
          payloadType: "interrupt_queue",
          payload
        });
        break;
      }
      case "get_confidence_summary": {
        const payload = await this.commandSurface.getConfidenceSummary({
          tenantId: args.tenantId,
          mode: activeMode
        });
        result = this.buildSuccess({
          runtimeRequestId,
          activeMode,
          resolvedIntent,
          generatedAt,
          requestId: args.requestId ?? null,
          invokedSurface: "aaliyah-confidence-summary",
          enforcement: enforcement.trace,
          payloadType: "confidence_summary",
          payload
        });
        break;
      }
      case "get_founder_preferences": {
        if (!this.preferences) {
          throw new Error("aaliyah_runtime_preferences_unavailable");
        }
        const payload = await this.preferences.listPreferences({
          tenantId: args.tenantId,
          mode: activeMode
        });
        result = this.buildSuccess({
          runtimeRequestId,
          activeMode,
          resolvedIntent,
          generatedAt,
          requestId: args.requestId ?? null,
          invokedSurface: "aaliyah-preferences",
          enforcement: enforcement.trace,
          payloadType: "founder_preferences",
          payload
        });
        break;
      }
      case "get_memory_boundary_summary": {
        const payload = this.boundary.getSummary({
          activeMode,
          generatedAt
        });
        result = this.buildSuccess({
          runtimeRequestId,
          activeMode,
          resolvedIntent,
          generatedAt,
          requestId: args.requestId ?? null,
          invokedSurface: "aaliyah-memory-boundaries",
          enforcement: enforcement.trace,
          payloadType: "memory_boundary_summary",
          payload
        });
        break;
      }
      case "get_founder_review_queue": {
        const payload = await this.reviewQueue.getQueue({
          tenantId: args.tenantId,
          mode: activeMode,
          generatedAt
        });
        result = this.buildSuccess({
          runtimeRequestId,
          activeMode,
          resolvedIntent,
          generatedAt,
          requestId: args.requestId ?? null,
          invokedSurface: "aaliyah-review-queue",
          enforcement: enforcement.trace,
          payloadType: "founder_review_queue",
          payload
        });
        break;
      }
      case "get_founder_queue_item": {
        const queueItemId = this.sessions.resolveQueueItemId(args.request.parameters, sessionResolution.session);
        if (!queueItemId) {
          result = this.buildFallback({
            runtimeRequestId,
            activeMode,
            generatedAt,
            requestId: args.requestId ?? null,
            resolvedIntent,
            invokedSurface: "aaliyah-review-queue",
            enforcement: {
              ...enforcement.trace,
              reason: "aaliyah_runtime_missing_current_queue_item"
            },
            fallback: {
              outcome: "escalate_for_clarification",
              reason: "aaliyah_runtime_missing_current_queue_item",
              delegateToAgentId: null
            }
          });
          break;
        }
        const payload = await this.reviewQueue.getQueueItem({
          tenantId: args.tenantId,
          mode: activeMode,
          queueItemId
        });
        if (!payload) {
          result = this.buildFallback({
            runtimeRequestId,
            activeMode,
            generatedAt,
            requestId: args.requestId ?? null,
            resolvedIntent,
            invokedSurface: "aaliyah-review-queue",
            enforcement: {
              ...enforcement.trace,
              reason: "founder_queue_item_not_found"
            },
            fallback: {
              outcome: "escalate_for_clarification",
              reason: "founder_queue_item_not_found",
              delegateToAgentId: null
            }
          });
          break;
        }
        result = this.buildSuccess({
          runtimeRequestId,
          activeMode,
          resolvedIntent,
          generatedAt,
          requestId: args.requestId ?? null,
          invokedSurface: "aaliyah-review-queue",
          enforcement: enforcement.trace,
          payloadType: "founder_queue_item",
          payload
        });
        break;
      }
      case "get_founder_queue_summary": {
        const payload = await this.reviewQueue.getQueueSummary({
          tenantId: args.tenantId,
          mode: activeMode,
          generatedAt
        });
        result = this.buildSuccess({
          runtimeRequestId,
          activeMode,
          resolvedIntent,
          generatedAt,
          requestId: args.requestId ?? null,
          invokedSurface: "aaliyah-review-queue",
          enforcement: enforcement.trace,
          payloadType: "founder_queue_summary",
          payload
        });
        break;
      }
      case "get_prioritized_founder_inbox": {
        const payload = await this.triage.getPrioritizedInbox({
          tenantId: args.tenantId,
          actorId: args.actorId,
          principalContext: args.principalContext ?? "founder",
          mode: activeMode,
          generatedAt
        });
        result = this.buildSuccess({
          runtimeRequestId,
          activeMode,
          resolvedIntent,
          generatedAt,
          requestId: args.requestId ?? null,
          invokedSurface: "aaliyah-founder-inbox",
          enforcement: enforcement.trace,
          payloadType: "founder_inbox",
          payload
        });
        break;
      }
      case "get_blocked_founder_items": {
        const items = await this.triage.getBlockedItems({
          tenantId: args.tenantId,
          actorId: args.actorId,
          principalContext: args.principalContext ?? "founder",
          mode: activeMode,
          generatedAt
        });
        result = this.buildSuccess({
          runtimeRequestId,
          activeMode,
          resolvedIntent,
          generatedAt,
          requestId: args.requestId ?? null,
          invokedSurface: "aaliyah-founder-inbox",
          enforcement: enforcement.trace,
          payloadType: "blocked_founder_items",
          payload: { items, total: items.length }
        });
        break;
      }
      case "get_stale_founder_items": {
        const items = await this.triage.getStaleItems({
          tenantId: args.tenantId,
          actorId: args.actorId,
          principalContext: args.principalContext ?? "founder",
          mode: activeMode,
          generatedAt
        });
        result = this.buildSuccess({
          runtimeRequestId,
          activeMode,
          resolvedIntent,
          generatedAt,
          requestId: args.requestId ?? null,
          invokedSurface: "aaliyah-founder-inbox",
          enforcement: enforcement.trace,
          payloadType: "stale_founder_items",
          payload: { items, total: items.length }
        });
        break;
      }
      case "get_session_snapshot": {
        const payload = await this.sessions.getSessionSnapshot({
          tenantId: args.tenantId,
          actorId: args.actorId,
          principalContext: args.principalContext ?? "founder"
        });
        result = this.buildSuccess({
          runtimeRequestId,
          activeMode,
          resolvedIntent,
          generatedAt,
          requestId: args.requestId ?? null,
          invokedSurface: "aaliyah-session",
          enforcement: enforcement.trace,
          payloadType: "session_snapshot",
          payload
        });
        break;
      }
      case "reset_session_context": {
        const payload = await this.sessions.resetSession({
          tenantId: args.tenantId,
          actorId: args.actorId,
          principalContext: args.principalContext ?? "founder",
          resetReason: "manual_reset",
          hardReset: args.request.parameters?.scope === "hard",
          generatedAt
        });
        result = this.buildSuccess({
          runtimeRequestId,
          activeMode: payload.session.activeModeState.activeMode,
          resolvedIntent,
          generatedAt,
          requestId: args.requestId ?? null,
          invokedSurface: "aaliyah-session",
          enforcement: enforcement.trace,
          payloadType: "session_reset",
          payload
        });
        break;
      }
      case "get_active_follow_through": {
        const payload = await this.followThrough.getActiveFollowThrough({
          tenantId: args.tenantId,
          actorId: args.actorId,
          principalContext: args.principalContext ?? "founder",
          generatedAt
        });
        result = this.buildSuccess({
          runtimeRequestId,
          activeMode,
          resolvedIntent,
          generatedAt,
          requestId: args.requestId ?? null,
          invokedSurface: "aaliyah-follow-through",
          enforcement: enforcement.trace,
          payloadType: "follow_through_active",
          payload
        });
        break;
      }
      case "get_follow_through_history": {
        const limit = this.readOptionalLimit(args.request.parameters?.limit) ?? 25;
        const items = await this.followThrough.getFollowThroughHistory({
          tenantId: args.tenantId,
          actorId: args.actorId,
          principalContext: args.principalContext ?? "founder",
          limit
        });
        result = this.buildSuccess({
          runtimeRequestId,
          activeMode,
          resolvedIntent,
          generatedAt,
          requestId: args.requestId ?? null,
          invokedSurface: "aaliyah-follow-through",
          enforcement: enforcement.trace,
          payloadType: "follow_through_history",
          payload: {
            items,
            total: items.length
          }
        });
        break;
      }
      case "complete_active_item":
      case "abandon_active_item":
      case "escalate_active_item":
      case "invalidate_active_item": {
        const payload = await this.followThrough.applyAction({
          tenantId: args.tenantId,
          actorId: args.actorId,
          principalContext: args.principalContext ?? "founder",
          mode: activeMode,
          action:
            resolvedIntent === "complete_active_item"
              ? "complete"
              : resolvedIntent === "abandon_active_item"
                ? "abandon"
                : resolvedIntent === "escalate_active_item"
                  ? "escalate"
                  : "invalidate",
          generatedAt,
          queueItemId: this.readOptionalString(args.request.parameters, "queueItemId"),
          founderDeclaredCompletion: args.request.parameters?.founderDeclaredCompletion === true,
          closureReason: this.requireStringParam(args.request.parameters, "closureReason", resolvedIntent) as never,
          closureNote: this.readOptionalString(args.request.parameters, "closureNote"),
          downstreamActionRef: this.readOptionalString(args.request.parameters, "downstreamActionRef"),
          escalationTarget: this.readOptionalString(args.request.parameters, "escalationTarget"),
          escalationClass: this.readOptionalString(args.request.parameters, "escalationClass") as never,
          escalationRationale: this.readOptionalString(args.request.parameters, "escalationRationale"),
          escalationProvenance: this.readOptionalRecord(args.request.parameters, "escalationProvenance")
        });
        result = this.buildSuccess({
          runtimeRequestId,
          activeMode,
          resolvedIntent,
          generatedAt,
          requestId: args.requestId ?? null,
          invokedSurface: "aaliyah-follow-through",
          enforcement: enforcement.trace,
          payloadType: "follow_through_action",
          payload
        });
        break;
      }
      case "execute_quick_action": {
        const actionId = this.requireStringParam(args.request.parameters, "actionId", "execute_quick_action");
        const action = this.commandSurface.getQuickActionById({
          tenantId: args.tenantId,
          mode: activeMode,
          actionId
        });
        if (!action) {
          return this.buildFallback({
            runtimeRequestId,
            activeMode,
            generatedAt,
            requestId: args.requestId ?? null,
            resolvedIntent,
            invokedSurface: "aaliyah-quick-action",
            enforcement: {
              ...enforcement.trace,
              reason: "quick_action_not_found"
            },
            fallback: {
              outcome: "escalate_for_clarification",
              reason: "quick_action_not_found",
              delegateToAgentId: null
            }
          });
        }
        if (action.availabilityStatus !== "available") {
          return this.buildFallback({
            runtimeRequestId,
            activeMode,
            generatedAt,
            requestId: args.requestId ?? null,
            resolvedIntent,
            invokedSurface: "aaliyah-quick-action",
            enforcement: {
              ...enforcement.trace,
              reason: action.availabilityReason ?? "quick_action_unavailable"
            },
            fallback: {
              outcome: action.availabilityStatus === "requires_parameters" ? "defer_due_to_low_confidence" : "escalate_for_clarification",
              reason: action.availabilityReason ?? "quick_action_unavailable",
              delegateToAgentId: null
            }
          });
        }

        const delegatedParameters = {
          ...action.defaultParameters,
          ...(args.request.parameters ?? {})
        };
        delete delegatedParameters.actionId;

        return this.execute({
          tenantId: args.tenantId,
          actorId: args.actorId,
          requestId: args.requestId,
          principalContext: args.principalContext,
          request: {
            intent: action.targetIntent,
            mode: activeMode,
            parameters: delegatedParameters
          }
        });
      }
      case "get_waiting_approvals":
      case "get_email_review_queue": {
        const limit = this.readOptionalLimit(args.request.parameters?.limit);
        const items = await this.email.listReviewItems({
          tenantId: args.tenantId,
          status: "pending_review",
          accountId: this.readOptionalString(args.request.parameters, "accountId"),
          priority: this.readOptionalPriority(args.request.parameters?.priority),
          limit
        });
        result = this.buildSuccess({
          runtimeRequestId,
          activeMode,
          resolvedIntent,
          generatedAt,
          requestId: args.requestId ?? null,
          invokedSurface: "email-review-queue",
          enforcement: enforcement.trace,
          payloadType: resolvedIntent === "get_waiting_approvals" ? "approval_queue" : "email_review_queue",
          payload: {
            items,
            totalPending: items.length
          }
        });
        break;
      }
      case "approve_email_review_item": {
        const reviewItemId = this.sessions.resolveReviewItemId(args.request.parameters, sessionResolution.session);
        if (!reviewItemId) {
          result = this.buildFallback({
            runtimeRequestId,
            activeMode,
            generatedAt,
            requestId: args.requestId ?? null,
            resolvedIntent,
            invokedSurface: "email-review-approve",
            enforcement: {
              ...enforcement.trace,
              reason: "aaliyah_runtime_missing_current_review_item"
            },
            fallback: {
              outcome: "escalate_for_clarification",
              reason: "aaliyah_runtime_missing_current_review_item",
              delegateToAgentId: null
            }
          });
          break;
        }
        const item = await this.email.approveReviewItem({
          tenantId: args.tenantId,
          reviewItemId,
          actorId: args.actorId,
          note: this.readOptionalString(args.request.parameters, "note")
        });
        result = this.buildSuccess({
          runtimeRequestId,
          activeMode,
          resolvedIntent,
          generatedAt,
          requestId: args.requestId ?? null,
          invokedSurface: "email-review-approve",
          enforcement: enforcement.trace,
          payloadType: "email_review_action",
          payload: {
            action: "approve",
            item
          }
        });
        break;
      }
      case "reject_email_review_item": {
        const reviewItemId = this.sessions.resolveReviewItemId(args.request.parameters, sessionResolution.session);
        if (!reviewItemId) {
          result = this.buildFallback({
            runtimeRequestId,
            activeMode,
            generatedAt,
            requestId: args.requestId ?? null,
            resolvedIntent,
            invokedSurface: "email-review-reject",
            enforcement: {
              ...enforcement.trace,
              reason: "aaliyah_runtime_missing_current_review_item"
            },
            fallback: {
              outcome: "escalate_for_clarification",
              reason: "aaliyah_runtime_missing_current_review_item",
              delegateToAgentId: null
            }
          });
          break;
        }
        const item = await this.email.rejectReviewItem({
          tenantId: args.tenantId,
          reviewItemId,
          actorId: args.actorId,
          note: this.readOptionalString(args.request.parameters, "note")
        });
        result = this.buildSuccess({
          runtimeRequestId,
          activeMode,
          resolvedIntent,
          generatedAt,
          requestId: args.requestId ?? null,
          invokedSurface: "email-review-reject",
          enforcement: enforcement.trace,
          payloadType: "email_review_action",
          payload: {
            action: "reject",
            item
          }
        });
        break;
      }
      case "request_email_revision": {
        const reviewItemId = this.sessions.resolveReviewItemId(args.request.parameters, sessionResolution.session);
        if (!reviewItemId) {
          result = this.buildFallback({
            runtimeRequestId,
            activeMode,
            generatedAt,
            requestId: args.requestId ?? null,
            resolvedIntent,
            invokedSurface: "email-review-request-revision",
            enforcement: {
              ...enforcement.trace,
              reason: "aaliyah_runtime_missing_current_review_item"
            },
            fallback: {
              outcome: "escalate_for_clarification",
              reason: "aaliyah_runtime_missing_current_review_item",
              delegateToAgentId: null
            }
          });
          break;
        }
        const note = this.requireStringParam(args.request.parameters, "note", "request_email_revision");
        const item = await this.email.requestReviewRevision({
          tenantId: args.tenantId,
          reviewItemId,
          actorId: args.actorId,
          note
        });
        result = this.buildSuccess({
          runtimeRequestId,
          activeMode,
          resolvedIntent,
          generatedAt,
          requestId: args.requestId ?? null,
          invokedSurface: "email-review-request-revision",
          enforcement: enforcement.trace,
          payloadType: "email_review_action",
          payload: {
            action: "request_revision",
            item
          }
        });
        break;
      }
      case "dispatch_approved_email": {
        const reviewItemId = this.sessions.resolveReviewItemId(args.request.parameters, sessionResolution.session);
        if (!reviewItemId) {
          result = this.buildFallback({
            runtimeRequestId,
            activeMode,
            generatedAt,
            requestId: args.requestId ?? null,
            resolvedIntent,
            invokedSurface: "email-approved-dispatch",
            enforcement: {
              ...enforcement.trace,
              reason: "aaliyah_runtime_missing_current_review_item"
            },
            fallback: {
              outcome: "escalate_for_clarification",
              reason: "aaliyah_runtime_missing_current_review_item",
              delegateToAgentId: null
            }
          });
          break;
        }
        const payload = await this.email.dispatchApprovedReviewItem({
          tenantId: args.tenantId,
          actorId: args.actorId,
          reviewItemId
        });
        result = this.buildSuccess({
          runtimeRequestId,
          activeMode,
          resolvedIntent,
          generatedAt,
          requestId: args.requestId ?? null,
          invokedSurface: "email-approved-dispatch",
          enforcement: enforcement.trace,
          payloadType: "email_dispatch_result",
          payload
        });
        break;
      }
      case "get_ops_status": {
        const payload = await this.telemetry.getOpsStatusSummary({ tenantId: args.tenantId });
        result = this.buildSuccess({
          runtimeRequestId,
          activeMode,
          resolvedIntent,
          generatedAt,
          requestId: args.requestId ?? null,
          invokedSurface: "ops-status-summary",
          enforcement: enforcement.trace,
          payloadType: "ops_status",
          payload
        });
        break;
      }
      case "get_incident_summary": {
        const payload = await this.telemetry.getIncidentSummary({ tenantId: args.tenantId });
        result = this.buildSuccess({
          runtimeRequestId,
          activeMode,
          resolvedIntent,
          generatedAt,
          requestId: args.requestId ?? null,
          invokedSurface: "incident-summary",
          enforcement: enforcement.trace,
          payloadType: "incident_summary",
          payload
        });
        break;
      }
      case "switch_mode": {
        const targetMode = this.requireModeParam(args.request.parameters, activeMode);
        const boundaryDecision = this.boundary.validate({
          activeMode,
          requestedMode: targetMode,
          requestedCompanies: [targetMode === "founder" ? "zbestmedia" : targetMode],
          detailLevel: targetMode === "founder" ? "summary" : "detail"
        });
        if (boundaryDecision.access === "denied") {
          throw new Error("aaliyah_runtime_invalid_target_mode");
        }
        result = this.buildSuccess({
          runtimeRequestId,
          activeMode: targetMode,
          resolvedIntent,
          generatedAt,
          requestId: args.requestId ?? null,
          invokedSurface: "mode-switch",
          enforcement: enforcement.trace,
          payloadType: "mode_switch",
          payload: {
            previousMode: activeMode,
            activeMode: targetMode,
            supportedCategories: this.admin.getSupportedRoutingCategories()
          }
        });
        break;
      }
      case "preview_routing": {
        const category = this.requireRoutingCategory(args.request.parameters);
        const jingleMode = this.readOptionalJingleMode(args.request.parameters?.jingleMode);
        const decision = this.admin.previewRoutingDecision({
          category,
          ...(jingleMode ? { jingleMode } : {})
        });
        result = this.buildSuccess({
          runtimeRequestId,
          activeMode,
          resolvedIntent,
          generatedAt,
          requestId: args.requestId ?? null,
          invokedSurface: "routing-preview",
          enforcement: enforcement.trace,
          payloadType: "routing_preview",
          payload: {
            category,
            ...(jingleMode ? { jingleMode } : {}),
            decision
          }
        });
        break;
      }
      case "process_voice_intake": {
        const payload = await this.voice.processInboundCall({
          tenantId: args.tenantId,
          actorId: args.actorId,
          correlationId: args.requestId ?? runtimeRequestId,
          requestSource: "aaliyah-runtime",
          payload: this.requireVoicePayload(args.request.parameters)
        });
        result = this.buildSuccess({
          runtimeRequestId,
          activeMode,
          resolvedIntent,
          generatedAt,
          requestId: args.requestId ?? null,
          invokedSurface: "voice-intake-runtime",
          enforcement: enforcement.trace,
          payloadType: "voice_call_result",
          payload
        });
        break;
      }
      case "get_voice_call_summary": {
        const callId = this.sessions.resolveVoiceCallId(args.request.parameters, sessionResolution.session);
        if (!callId) {
          result = this.buildFallback({
            runtimeRequestId,
            activeMode,
            generatedAt,
            requestId: args.requestId ?? null,
            resolvedIntent,
            invokedSurface: "voice-call-lookup",
            enforcement: {
              ...enforcement.trace,
              reason: "aaliyah_runtime_missing_current_voice_call"
            },
            fallback: {
              outcome: "escalate_for_clarification",
              reason: "aaliyah_runtime_missing_current_voice_call",
              delegateToAgentId: null
            }
          });
          break;
        }
        const payload = await this.voice.getCall({ tenantId: args.tenantId, callId });
        if (!payload) {
          result = this.buildFallback({
            runtimeRequestId,
            activeMode,
            generatedAt,
            requestId: args.requestId ?? null,
            resolvedIntent,
            invokedSurface: "voice-call-lookup",
            enforcement: {
              ...enforcement.trace,
              reason: "voice_call_not_found"
            },
            fallback: {
              outcome: "escalate_for_clarification",
              reason: "voice_call_not_found",
              delegateToAgentId: null
            }
          });
          break;
        }
        result = this.buildSuccess({
          runtimeRequestId,
          activeMode,
          resolvedIntent,
          generatedAt,
          requestId: args.requestId ?? null,
          invokedSurface: "voice-call-lookup",
          enforcement: enforcement.trace,
          payloadType: "voice_call_summary",
          payload
        });
        break;
      }
      case "get_pending_voice_escalations": {
        const items = await this.voice.listPendingEscalations({
          tenantId: args.tenantId,
          limit: this.readOptionalLimit(args.request.parameters?.limit)
        });
        result = this.buildSuccess({
          runtimeRequestId,
          activeMode,
          resolvedIntent,
          generatedAt,
          requestId: args.requestId ?? null,
          invokedSurface: "voice-escalations",
          enforcement: enforcement.trace,
          payloadType: "voice_escalations",
          payload: {
            items,
            totalPending: items.length
          }
        });
        break;
      }
      }
      return this.finalizeRuntimeResult(sessionResolution.session, args.request, generatedAt, result);
    } catch (error) {
      if (error instanceof VoiceIntakeValidationError) {
        const message = error.message;
        return this.finalizeRuntimeResult(sessionResolution.session, args.request, generatedAt, this.buildFallback({
          runtimeRequestId,
          activeMode,
          generatedAt,
          requestId: args.requestId ?? null,
          resolvedIntent,
          invokedSurface: "voice-intake-runtime",
          enforcement: {
            ...enforcement.trace,
            reason: message
          },
          fallback: {
            outcome: "escalate_for_clarification",
            reason: message,
            delegateToAgentId: null
          }
        }));
      }
      if (error instanceof Error && error.message.startsWith("aaliyah_runtime_")) {
        const fallbackOutcome =
          error.message === "aaliyah_runtime_invalid_target_mode" ? "deny_due_to_mode_boundary" : "escalate_for_clarification";
        return this.finalizeRuntimeResult(sessionResolution.session, args.request, generatedAt, this.buildFallback({
          runtimeRequestId,
          activeMode,
          generatedAt,
          requestId: args.requestId ?? null,
          resolvedIntent,
          invokedSurface: "aaliyah-runtime",
          enforcement: {
            ...enforcement.trace,
            reason: error.message
          },
          fallback: {
            outcome: fallbackOutcome,
            reason: error.message,
            delegateToAgentId: null
          }
        }));
      }
      throw error;
    }
  }

  private resolveIntent(intent: string): AaliyahRuntimeIntent | null {
    return SUPPORTED_INTENTS.has(intent as AaliyahRuntimeIntent) ? (intent as AaliyahRuntimeIntent) : null;
  }

  private resolveConfidence(intent: AaliyahRuntimeIntent | null, parameters?: Record<string, unknown>): "high" | "medium" | "low" {
    if (!intent) {
      return "low";
    }
    if (intent === "preview_routing" && parameters?.category === "jingle_music" && !parameters?.jingleMode) {
      return "low";
    }
    return "high";
  }

  private buildSuccess(args: {
    runtimeRequestId: string;
    activeMode: AaliyahRuntimeMode;
    resolvedIntent: AaliyahRuntimeIntent;
    generatedAt: string;
    requestId: string | null;
    invokedSurface: string;
    enforcement: AaliyahRuntimeDecisionTrace;
    payloadType:
      | "founder_briefing"
      | "founder_command_surface"
      | "quick_actions"
      | "interrupt_queue"
      | "confidence_summary"
      | "founder_preferences"
      | "memory_boundary_summary"
      | "founder_review_queue"
      | "founder_queue_item"
      | "founder_queue_summary"
      | "session_snapshot"
      | "session_reset"
      | "follow_through_active"
      | "follow_through_action"
      | "follow_through_history"
      | "founder_inbox"
      | "blocked_founder_items"
      | "stale_founder_items"
      | "approval_queue"
      | "email_review_queue"
      | "email_review_action"
      | "email_dispatch_result"
      | "ops_status"
      | "incident_summary"
      | "mode_switch"
      | "routing_preview"
      | "voice_call_result"
      | "voice_call_summary"
      | "voice_escalations";
    payload: unknown;
  }): AaliyahRuntimeResult {
    return {
      runtimeRequestId: args.runtimeRequestId,
      resolvedIntent: args.resolvedIntent,
      outcomeType: "completed",
      activeMode: args.activeMode,
      payloadType: args.payloadType,
      payload: args.payload,
      provenance: {
        manifestVersion: this.org.getManifestVersion(),
        aaliyahRegistryVersion: AALIYAH_REGISTRY_VERSION,
        requestId: args.requestId,
        generatedAt: args.generatedAt,
        invokedSurface: args.invokedSurface,
        enforcement: args.enforcement
      },
      fallback: null
    } as AaliyahRuntimeResult;
  }

  private async finalizeRuntimeResult(
    session: import("./session-types.js").AaliyahSessionContext,
    request: AaliyahRuntimeRequestInput,
    generatedAt: string,
    result: AaliyahRuntimeResult
  ): Promise<AaliyahRuntimeResult> {
    await this.sessions.applyRuntimeResult({
      session,
      request,
      result,
      generatedAt
    });
    return result;
  }

  private buildFallback(args: {
    runtimeRequestId: string;
    activeMode: AaliyahRuntimeMode;
    generatedAt: string;
    requestId: string | null;
    resolvedIntent: AaliyahRuntimeIntent | null;
    invokedSurface: string;
    enforcement: AaliyahRuntimeDecisionTrace;
    fallback: AaliyahRuntimeFallback;
  }): AaliyahRuntimeResult {
    return {
      runtimeRequestId: args.runtimeRequestId,
      resolvedIntent: args.resolvedIntent,
      outcomeType: "fallback",
      activeMode: args.activeMode,
      payloadType: null,
      payload: null,
      provenance: {
        manifestVersion: this.org.getManifestVersion(),
        aaliyahRegistryVersion: AALIYAH_REGISTRY_VERSION,
        requestId: args.requestId,
        generatedAt: args.generatedAt,
        invokedSurface: args.invokedSurface,
        enforcement: args.enforcement
      },
      fallback: args.fallback
    };
  }

  private requireStringParam(parameters: Record<string, unknown> | undefined, key: string, intent: AaliyahRuntimeIntent): string {
    const value = parameters?.[key];
    if (typeof value !== "string" || value.trim().length === 0) {
      throw new Error(`aaliyah_runtime_missing_parameter:${intent}:${key}`);
    }
    return value;
  }

  private readOptionalString(parameters: Record<string, unknown> | undefined, key: string): string | undefined {
    const value = parameters?.[key];
    return typeof value === "string" && value.trim().length > 0 ? value : undefined;
  }

  private readOptionalRecord(parameters: Record<string, unknown> | undefined, key: string): Record<string, unknown> | undefined {
    const value = parameters?.[key];
    return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
  }

  private readOptionalLimit(value: unknown): number | undefined {
    return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined;
  }

  private readOptionalPriority(value: unknown): "low" | "normal" | "high" | "urgent" | undefined {
    return value === "low" || value === "normal" || value === "high" || value === "urgent" ? value : undefined;
  }

  private requireModeParam(parameters: Record<string, unknown> | undefined, fallbackMode: AaliyahRuntimeMode): AaliyahRuntimeMode {
    const mode = parameters?.targetMode;
    if (mode === undefined) {
      return fallbackMode;
    }
    if (mode === "founder" || mode === "zbestmedia") {
      return mode;
    }
    throw new Error("aaliyah_runtime_invalid_target_mode");
  }

  private requireRoutingCategory(parameters: Record<string, unknown> | undefined) {
    const category = parameters?.category;
    if (
      category === "brand_identity" ||
      category === "campaign_growth" ||
      category === "visual_design" ||
      category === "jingle_music" ||
      category === "build_integrity_monitoring" ||
      category === "dependency_integrity_monitoring" ||
      category === "runtime_health_monitoring" ||
      category === "migration_integrity_monitoring" ||
      category === "route_contract_monitoring" ||
      category === "slo_integrity_monitoring"
    ) {
      return category;
    }
    throw new Error("aaliyah_runtime_invalid_routing_category");
  }

  private readOptionalJingleMode(value: unknown) {
    return value === "composition" || value === "packaging" ? value : undefined;
  }

  private requireVoicePayload(parameters: Record<string, unknown> | undefined): VoiceIntakePayload {
    const payload = parameters?.payload;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new Error("aaliyah_runtime_missing_parameter:process_voice_intake:payload");
    }
    return payload as VoiceIntakePayload;
  }
}
