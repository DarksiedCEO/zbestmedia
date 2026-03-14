import { randomUUID } from "node:crypto";

import { AALIYAH_REGISTRY_VERSION } from "./registry-types.js";
import { AaliyahFounderBriefingService } from "./briefing.js";
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
  "preview_routing"
]);

const DEFAULT_MODE: AaliyahRuntimeMode = "founder";

export class AaliyahRuntimeService {
  private readonly runtime = new AaliyahRuntimeEnforcementService();

  constructor(
    private readonly org: AgentOrgService,
    private readonly briefing: AaliyahFounderBriefingService,
    private readonly email: EmailAssistantService,
    private readonly telemetry: AgentTelemetryService,
    private readonly admin: AgentAdminService
  ) {}

  async execute(args: AaliyahRuntimeRequestContext & { request: AaliyahRuntimeRequestInput }): Promise<AaliyahRuntimeResult> {
    const runtimeRequestId = `aaliyah-runtime:${randomUUID()}`;
    const generatedAt = new Date().toISOString();
    const activeMode = args.request.mode ?? DEFAULT_MODE;
    const resolvedIntent = this.resolveIntent(args.request.intent);
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
      return this.buildFallback({
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
      });
    }

    if (!enforcement.allowed) {
      return this.buildFallback({
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
      });
    }

    try {
      switch (resolvedIntent) {
      case "get_founder_briefing": {
        const payload = await this.briefing.generateBriefing({
          tenantId: args.tenantId,
          mode: activeMode
        });
        return this.buildSuccess({
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
        return this.buildSuccess({
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
      }
      case "approve_email_review_item": {
        const reviewItemId = this.requireStringParam(args.request.parameters, "reviewItemId", "approve_email_review_item");
        const item = await this.email.approveReviewItem({
          tenantId: args.tenantId,
          reviewItemId,
          actorId: args.actorId,
          note: this.readOptionalString(args.request.parameters, "note")
        });
        return this.buildSuccess({
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
      }
      case "reject_email_review_item": {
        const reviewItemId = this.requireStringParam(args.request.parameters, "reviewItemId", "reject_email_review_item");
        const item = await this.email.rejectReviewItem({
          tenantId: args.tenantId,
          reviewItemId,
          actorId: args.actorId,
          note: this.readOptionalString(args.request.parameters, "note")
        });
        return this.buildSuccess({
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
      }
      case "request_email_revision": {
        const reviewItemId = this.requireStringParam(args.request.parameters, "reviewItemId", "request_email_revision");
        const note = this.requireStringParam(args.request.parameters, "note", "request_email_revision");
        const item = await this.email.requestReviewRevision({
          tenantId: args.tenantId,
          reviewItemId,
          actorId: args.actorId,
          note
        });
        return this.buildSuccess({
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
      }
      case "dispatch_approved_email": {
        const reviewItemId = this.requireStringParam(args.request.parameters, "reviewItemId", "dispatch_approved_email");
        const payload = await this.email.dispatchApprovedReviewItem({
          tenantId: args.tenantId,
          actorId: args.actorId,
          reviewItemId
        });
        return this.buildSuccess({
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
      }
      case "get_ops_status": {
        const payload = await this.telemetry.getOpsStatusSummary({ tenantId: args.tenantId });
        return this.buildSuccess({
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
      }
      case "get_incident_summary": {
        const payload = await this.telemetry.getIncidentSummary({ tenantId: args.tenantId });
        return this.buildSuccess({
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
      }
      case "switch_mode": {
        const targetMode = this.requireModeParam(args.request.parameters, activeMode);
        return this.buildSuccess({
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
      }
      case "preview_routing": {
        const category = this.requireRoutingCategory(args.request.parameters);
        const jingleMode = this.readOptionalJingleMode(args.request.parameters?.jingleMode);
        const decision = this.admin.previewRoutingDecision({
          category,
          ...(jingleMode ? { jingleMode } : {})
        });
        return this.buildSuccess({
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
      }
      }
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("aaliyah_runtime_")) {
        const fallbackOutcome =
          error.message === "aaliyah_runtime_invalid_target_mode" ? "deny_due_to_mode_boundary" : "escalate_for_clarification";
        return this.buildFallback({
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
        });
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
      | "approval_queue"
      | "email_review_queue"
      | "email_review_action"
      | "email_dispatch_result"
      | "ops_status"
      | "incident_summary"
      | "mode_switch"
      | "routing_preview";
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
}
