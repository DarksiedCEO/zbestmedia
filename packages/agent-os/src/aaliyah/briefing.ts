import { randomUUID } from "node:crypto";

import { AALIYAH_REGISTRY_VERSION } from "./registry-types.js";
import { AaliyahConfidenceControlService } from "./confidence.js";
import { AaliyahRuntimeEnforcementService } from "./runtime-enforcement.js";
import type {
  FounderAssignmentSource,
  FounderBriefing,
  FounderBriefingContext,
  FounderBriefingItem,
  FounderBriefingMode,
  FounderExecutionFailureSource,
  FounderIncidentSource,
  FounderReviewSource,
  FounderRecommendedAction,
  FounderInterruptClass
} from "./briefing-types.js";
import type { DepartmentId, ExecutiveId, LeadAgentId, SubAgentId } from "../org/types.js";
import type { EmailPriority } from "../email/types.js";
import type { AgentExecutionLedgerService } from "../execution/ledger.js";
import type { AgentIncidentService } from "../incidents/service.js";
import { AgentOrgService } from "../org/service.js";
import type { EmailDraftReviewService } from "../email/review.js";
import type { AgentTelemetryService } from "../telemetry/service.js";

const PRIORITY_SCORE: Record<FounderBriefingItem["urgency"], number> = {
  low: 10,
  normal: 25,
  high: 55,
  urgent: 90
};

const INTERRUPT_SCORE: Record<FounderInterruptClass, number> = {
  interrupt_now: 50,
  review_soon: 20,
  can_wait: 0
};

export class AaliyahFounderBriefingService {
  private readonly runtime = new AaliyahRuntimeEnforcementService();
  private readonly confidence = new AaliyahConfidenceControlService();

  constructor(
    private readonly org: AgentOrgService,
    private readonly telemetry: AgentTelemetryService,
    private readonly incidents: AgentIncidentService,
    private readonly ledger: AgentExecutionLedgerService,
    private readonly reviews: EmailDraftReviewService
  ) {}

  async generateBriefing(args: FounderBriefingContext): Promise<FounderBriefing> {
    this.assertRuntimeBoundary(args.mode);

    const generatedAt = args.generatedAt ?? new Date().toISOString();
    const [ops, openIncidents, pendingReviews, recentRuns, assignmentRecords] = await Promise.all([
      this.telemetry.getOpsStatusSummary({ tenantId: args.tenantId }),
      this.incidents.listIncidents({ tenantId: args.tenantId, status: "open", limit: 50 }),
      this.reviews.listReviewItems({ tenantId: args.tenantId, status: "pending_review", limit: 50 }),
      this.ledger.listExecutionRunRecords({ tenantId: args.tenantId, limit: 50 }),
      this.ledger.listAssignmentRecords({ tenantId: args.tenantId, limit: 50 })
    ]);

    const incidentSources = openIncidents.map((incident) => ({
      incidentId: incident.incidentId,
      incidentType: incident.incidentType,
      severity: incident.severity,
      summary: incident.summary,
      recommendedAction: incident.recommendedAction,
      releaseBlocking: incident.releaseBlocking,
      owningExecutiveId: incident.owningExecutiveId as ExecutiveId,
      owningDepartmentId: incident.owningDepartmentId as DepartmentId,
      owningLeadAgentId: incident.owningLeadAgentId as LeadAgentId,
      owningSubAgentId: incident.owningSubAgentId as SubAgentId
    } satisfies FounderIncidentSource));

    const reviewSources = pendingReviews.map((item) => ({
      reviewItemId: item.reviewItemId,
      threadId: item.threadId,
      assignmentRecordId: item.assignmentRecordId,
      runRecordId: item.runRecordId,
      intentCategory: item.intentCategory,
      priority: item.priority,
      riskLevel: item.riskLevel,
      draftSummary: item.draftSummary,
      proposedReplySubject: item.proposedReplySubject,
      recommendedExecutiveId: item.recommendedExecutiveId,
      recommendedDepartmentId: item.recommendedDepartmentId,
      recommendedLeadAgentId: item.recommendedLeadAgentId,
      recommendedSubAgentId: item.recommendedSubAgentId,
      confidenceScore: item.confidenceScore,
      riskScore: item.riskScore,
      escalationRecommended: item.escalationRecommended
    } satisfies FounderReviewSource));

    const executionFailures = recentRuns
      .filter((run) => run.currentState === "failed" || run.currentState === "blocked")
      .map((run) => ({
        runRecordId: run.runRecordId,
        assignmentRecordId: run.assignmentRecordId,
        failureCategory: run.failureCategory,
        failureMessage: run.failureMessage
      } satisfies FounderExecutionFailureSource));

    const assignmentSources = assignmentRecords.map((record) => ({
      assignmentRecordId: record.assignmentRecordId,
      requestedTaskCategory: record.requestedTaskCategory,
      policyDecisionReason: record.policyDecisionReason
    } satisfies FounderAssignmentSource));

    const waitingOnMe = reviewSources
      .map((review) => this.reviewToBriefingItem(review, "waiting_on_me"))
      .sort((a, b) => this.scoreItem(b) - this.scoreItem(a));

    const revenueWatch = reviewSources
      .filter((review) => review.intentCategory === "lead_inquiry" || review.intentCategory === "partnership_inquiry")
      .map((review) => this.reviewToBriefingItem(review, "revenue_watch"))
      .sort((a, b) => this.scoreItem(b) - this.scoreItem(a));

    const calendarWatch = reviewSources
      .filter((review) => review.intentCategory === "meeting_request")
      .map((review) => this.reviewToBriefingItem(review, "calendar_watch"))
      .sort((a, b) => this.scoreItem(b) - this.scoreItem(a));

    const relationshipWatch = reviewSources
      .filter((review) => ["client_request", "vendor_outreach", "partnership_inquiry", "legal_or_sensitive"].includes(review.intentCategory))
      .map((review) => this.reviewToBriefingItem(review, "relationship_watch"))
      .sort((a, b) => this.scoreItem(b) - this.scoreItem(a));

    const degradedSurfaceItems: FounderBriefingItem[] = ops.degradedSurfaces.map((surface, index) => ({
      itemId: `degraded:${surface}:${index}`,
      category: "operations_watch",
      title: `Degraded ${surface.replace(/_/g, " ")}`,
      summary: `The ${surface.replace(/_/g, " ")} surface is currently degraded.`,
      urgency: (surface === "slo" || surface === "runtime" ? "urgent" : "high") as EmailPriority,
      owner: {
        executiveId: "cto",
        departmentId: "technology-engineering",
        leadAgentId: "code-sentinel",
        subAgentId: null,
        sourceLane: "code-sentinel"
      },
      recommendedAction: `Inspect ${surface.replace(/_/g, " ")} and clear the degradation before it compounds.`,
      interruptionClass: (surface === "slo" || surface === "runtime" ? "interrupt_now" : "review_soon") as FounderInterruptClass,
      requiresFounderAttention: surface === "slo",
      provenanceReferences: [`surface:${surface}`]
    }));

    const operationsWatch = [
      ...incidentSources.map((incident) => this.incidentToBriefingItem(incident)),
      ...executionFailures.map((failure) => this.executionFailureToBriefingItem(failure, assignmentSources)),
      ...degradedSurfaceItems
    ].sort((a, b) => this.scoreItem(b) - this.scoreItem(a));

    const topPriorities = [...waitingOnMe, ...revenueWatch, ...operationsWatch, ...calendarWatch, ...relationshipWatch]
      .sort((a, b) => this.scoreItem(b) - this.scoreItem(a))
      .slice(0, 5);

    const recommendedActions = topPriorities.slice(0, 5).map((item, index) => ({
      actionId: `briefing-action:${index + 1}`,
      title: item.title,
      action: item.recommendedAction,
      urgency: item.urgency,
      sourceItemId: item.itemId
    } satisfies FounderRecommendedAction));

    const interruptSummary = this.buildInterruptSummary(topPriorities);
    const confidenceEvaluations = [...waitingOnMe, ...revenueWatch, ...operationsWatch, ...calendarWatch, ...relationshipWatch].map((item) =>
      this.confidence.evaluate({
        sourceSubsystem: item.owner.sourceLane === "code-sentinel" ? "ops" : "briefing",
        assessedItemType: "briefing_item",
        sourceItemId: item.itemId,
        urgency: item.urgency,
        risk: item.urgency === "urgent" ? "critical" : item.urgency === "high" ? "high" : "medium",
        founderRelevance: item.requiresFounderAttention || item.category === "waiting_on_me" || item.category === "top_priorities",
        founderApprovalRequired: item.category === "waiting_on_me",
        releaseBlocking: item.owner.sourceLane === "code-sentinel" && item.requiresFounderAttention,
        timeSensitivity:
          item.interruptionClass === "interrupt_now"
            ? "immediate"
            : item.interruptionClass === "review_soon"
              ? "same_day"
              : "routine",
        dataComplete: item.summary.trim().length > 0 && item.recommendedAction.trim().length > 0,
        routingCertain: item.owner.sourceLane !== "aaliyah-founder-review",
        policyCertain: true,
        modeCertain: true,
        sourceReliability: item.owner.sourceLane === "code-sentinel" ? "high" : "medium"
      })
    );

    return {
      briefingId: `briefing:${randomUUID()}`,
      generatedAt,
      activeMode: args.mode,
      manifestVersion: this.org.getManifestVersion(),
      topPriorities,
      waitingOnMe: waitingOnMe.slice(0, 5),
      revenueWatch: revenueWatch.slice(0, 5),
      operationsWatch: operationsWatch.slice(0, 5),
      calendarWatch: calendarWatch.slice(0, 5),
      relationshipWatch: relationshipWatch.slice(0, 5),
      recommendedActions,
      interruptSummary,
      confidenceSummary: {
        status: ops.status,
        lowConfidenceSignals: confidenceEvaluations.filter((evaluation) => evaluation.assessment.confidenceLevel === "low").length,
        degradedSurfaces: ops.degradedSurfaces
      },
      sourceMetadata: {
        orgManifestVersion: this.org.getManifestVersion(),
        aaliyahRegistryVersion: AALIYAH_REGISTRY_VERSION,
        generatedFrom: {
          pendingReviewCount: reviewSources.length,
          openIncidentCount: incidentSources.length,
          releaseBlockingIncidentCount: incidentSources.filter((incident) => incident.releaseBlocking).length,
          recentExecutionFailureCount: executionFailures.length
        }
      }
    };
  }

  private assertRuntimeBoundary(mode: FounderBriefingMode): void {
    const decision = this.runtime.evaluate({
      requestedAgentId: "aaliyah",
      requestedAtomicTaskId: "executive_orchestration_founder_protection",
      confidence: "high",
      company: "zbestmedia",
      mode: "executive_assistant",
      principalContext: "founder",
      approvalState: "not_required",
      memoryRequest: {
        companies: ["zbestmedia"],
        modes: ["executive_assistant"]
      }
    });

    if (!decision.allowed) {
      throw new Error(`[aaliyah-briefing] runtime boundary denied founder briefing: ${decision.trace.reason}`);
    }

    if (mode !== "founder" && mode !== "zbestmedia") {
      throw new Error("[aaliyah-briefing] unsupported founder briefing mode");
    }
  }

  private reviewToBriefingItem(review: FounderReviewSource, category: FounderBriefingItem["category"]): FounderBriefingItem {
    return {
      itemId: `review:${review.reviewItemId}`,
      category,
      title: review.proposedReplySubject || "Pending email review",
      summary: review.draftSummary,
      urgency: review.priority,
      owner: {
        executiveId: review.recommendedExecutiveId as FounderBriefingItem["owner"]["executiveId"],
        departmentId: review.recommendedDepartmentId as FounderBriefingItem["owner"]["departmentId"],
        leadAgentId: review.recommendedLeadAgentId as FounderBriefingItem["owner"]["leadAgentId"],
        subAgentId: review.recommendedSubAgentId as FounderBriefingItem["owner"]["subAgentId"],
        sourceLane: review.recommendedLeadAgentId ?? "aaliyah-email"
      },
      recommendedAction: review.escalationRecommended
        ? "Review this thread personally or route it to the recommended owner before responding."
        : "Review the draft and approve, reject, or request revision.",
      interruptionClass: review.priority === "urgent" || review.riskLevel === "critical" ? "interrupt_now" : review.priority === "high" ? "review_soon" : "can_wait",
      requiresFounderAttention: true,
      provenanceReferences: [
        `review:${review.reviewItemId}`,
        `thread:${review.threadId}`,
        ...(review.assignmentRecordId ? [`assignment:${review.assignmentRecordId}`] : []),
        ...(review.runRecordId ? [`run:${review.runRecordId}`] : [])
      ]
    };
  }

  private incidentToBriefingItem(incident: FounderIncidentSource): FounderBriefingItem {
    return {
      itemId: `incident:${incident.incidentId}`,
      category: "operations_watch",
      title: incident.incidentType.replace(/_/g, " "),
      summary: incident.summary,
      urgency: incident.severity === "critical" ? "urgent" : incident.severity === "warning" ? "high" : "normal",
      owner: {
        executiveId: incident.owningExecutiveId,
        departmentId: incident.owningDepartmentId,
        leadAgentId: incident.owningLeadAgentId,
        subAgentId: incident.owningSubAgentId,
        sourceLane: incident.owningLeadAgentId
      },
      recommendedAction: incident.recommendedAction,
      interruptionClass: incident.releaseBlocking || incident.severity === "critical" ? "interrupt_now" : "review_soon",
      requiresFounderAttention: incident.releaseBlocking,
      provenanceReferences: [`incident:${incident.incidentId}`]
    };
  }

  private executionFailureToBriefingItem(
    failure: FounderExecutionFailureSource,
    assignments: FounderAssignmentSource[]
  ): FounderBriefingItem {
    const assignment = assignments.find((item) => item.assignmentRecordId === failure.assignmentRecordId);
    return {
      itemId: `run:${failure.runRecordId}`,
      category: "operations_watch",
      title: failure.failureCategory ?? "execution_failure",
      summary: failure.failureMessage ?? assignment?.policyDecisionReason ?? "Execution failure requires investigation.",
      urgency: failure.failureCategory === "routing_failure" || failure.failureCategory === "policy_rejection" ? "high" : "normal",
      owner: {
        executiveId: "cto",
        departmentId: "technology-engineering",
        leadAgentId: "code-sentinel",
        subAgentId: failure.failureCategory === "routing_failure" ? "route-contract-watcher" : "runtime-health-monitor",
        sourceLane: "code-sentinel"
      },
      recommendedAction: failure.failureCategory === "policy_rejection"
        ? "Inspect the rejected routing or policy condition before retrying."
        : "Inspect the failed execution path and clear the underlying runtime issue.",
      interruptionClass: failure.failureCategory === "routing_failure" ? "review_soon" : "can_wait",
      requiresFounderAttention: false,
      provenanceReferences: [
        `run:${failure.runRecordId}`,
        `assignment:${failure.assignmentRecordId}`
      ]
    };
  }

  private scoreItem(item: FounderBriefingItem): number {
    let score = PRIORITY_SCORE[item.urgency] + INTERRUPT_SCORE[item.interruptionClass];
    if (item.requiresFounderAttention) score += 60;
    if (item.category === "revenue_watch") score += 25;
    if (item.category === "waiting_on_me") score += 35;
    if (item.category === "operations_watch") score += 30;
    if (item.category === "operations_watch" && item.requiresFounderAttention) score += 25;
    if (item.category === "relationship_watch") score += 20;
    if (item.category === "calendar_watch") score += 10;
    return score;
  }

  private buildInterruptSummary(items: FounderBriefingItem[]) {
    return {
      interruptNowCount: items.filter((item) => item.interruptionClass === "interrupt_now").length,
      reviewSoonCount: items.filter((item) => item.interruptionClass === "review_soon").length,
      canWaitCount: items.filter((item) => item.interruptionClass === "can_wait").length
    };
  }
}
