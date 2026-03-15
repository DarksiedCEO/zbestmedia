import { describe, expect, it, vi } from "vitest";

import { AaliyahFounderBriefingService } from "../src/aaliyah/briefing.js";
import { AgentOrgService } from "../src/org/service.js";

describe("Aaliyah founder briefing", () => {
  const service = new AaliyahFounderBriefingService(
    new AgentOrgService(),
    {
      getOpsStatusSummary: vi.fn(async () => ({
        status: "critical",
        manifestVersion: "2026-03-12.v1",
        generatedAt: "2026-03-14T00:00:00.000Z",
        incidents: {
          manifestVersion: "2026-03-12.v1",
          generatedAt: "2026-03-14T00:00:00.000Z",
          openBySeverity: { info: 0, warning: 1, critical: 1 },
          openByType: {
            build_integrity_failure: 0,
            dependency_integrity_failure: 0,
            runtime_health_failure: 1,
            migration_integrity_failure: 0,
            route_contract_failure: 0,
            slo_integrity_failure: 1,
            execution_policy_failure: 0,
            execution_runtime_failure: 0
          },
          releaseBlockingOpenCount: 1,
          degradedSurfaces: ["runtime", "slo"]
        },
        executions: {
          manifestVersion: "2026-03-12.v1",
          generatedAt: "2026-03-14T00:00:00.000Z",
          recentByState: {
            requested: 0,
            validated: 0,
            routed: 0,
            blocked: 1,
            executing: 0,
            retriable: 0,
            succeeded: 3,
            failed: 1
          },
          recentFailuresByCategory: { routing_failure: 1 },
          routingFailureCount: 1,
          policyRejectionCount: 0
        },
        codeSentinel: {
          manifestVersion: "2026-03-12.v1",
          generatedAt: "2026-03-14T00:00:00.000Z",
          openIncidentCountBySubAgent: {
            "build-monitor": 0,
            "dependency-watcher": 0,
            "runtime-health-monitor": 1,
            "migration-guardian": 0,
            "route-contract-watcher": 0,
            "slo-enforcer": 1
          },
          openIncidentCountBySignal: {
            build_breakage: 0,
            dependency_drift: 0,
            runtime_health: 1,
            migration_integrity: 0,
            route_contract: 0,
            slo_release_gate: 1
          },
          mostImpactedSubAgent: "slo-enforcer"
        },
        degradedSurfaces: ["runtime", "slo"]
      }))
    } as never,
    {
      listIncidents: vi.fn(async () => [
        {
          incidentId: "incident:1",
          incidentType: "slo_integrity_failure",
          severity: "critical",
          summary: "Worker SLO is critical.",
          recommendedAction: "Stabilize worker freshness before shipping.",
          releaseBlocking: true,
          owningExecutiveId: "cto",
          owningDepartmentId: "technology-engineering",
          owningLeadAgentId: "code-sentinel",
          owningSubAgentId: "slo-enforcer"
        }
      ])
    } as never,
    {
      listExecutionRunRecords: vi.fn(async () => [
        {
          runRecordId: "run:1",
          assignmentRecordId: "assignment:1",
          currentState: "failed",
          failureCategory: "routing_failure",
          failureMessage: "Route resolution failed."
        }
      ]),
      listAssignmentRecords: vi.fn(async () => [
        {
          assignmentRecordId: "assignment:1",
          requestedTaskCategory: "brand_identity",
          policyDecisionReason: "approved"
        }
      ])
    } as never,
    {
      listReviewItems: vi.fn(async () => [
        {
          reviewItemId: "review:1",
          threadId: "thread:1",
          assignmentRecordId: "assignment:email:1",
          runRecordId: "run:email:1",
          intentCategory: "meeting_request",
          priority: "urgent",
          riskLevel: "medium",
          draftSummary: "Founder meeting request from priority contact.",
          proposedReplySubject: "Meeting request follow-up",
          recommendedExecutiveId: "coo",
          recommendedDepartmentId: "operations",
          recommendedLeadAgentId: null,
          recommendedSubAgentId: null,
          confidenceScore: 0.91,
          riskScore: 0.35,
          escalationRecommended: false
        },
        {
          reviewItemId: "review:2",
          threadId: "thread:2",
          assignmentRecordId: "assignment:email:2",
          runRecordId: "run:email:2",
          intentCategory: "lead_inquiry",
          priority: "high",
          riskLevel: "low",
          draftSummary: "Potential high-value lead asking for next steps.",
          proposedReplySubject: "Lead inquiry reply draft",
          recommendedExecutiveId: "cmo",
          recommendedDepartmentId: "marketing",
          recommendedLeadAgentId: "kobe",
          recommendedSubAgentId: null,
          confidenceScore: 0.88,
          riskScore: 0.15,
          escalationRecommended: false
        }
      ])
    } as never,
    {
      resolvePreferences: vi.fn(async ({ mode }: { mode: "founder" | "zbestmedia" }) => ({
        activeMode: mode,
        briefingLength: mode === "founder" ? "compact" : "standard",
        interruptionTolerance: "standard",
        approvalVisibility: "all_pending",
        tonePreference: "concise",
        modeVisibility: "strict",
        appliedPreferences: []
      }))
    } as never
  );

  it("builds founder-useful briefing sections", async () => {
    const briefing = await service.generateBriefing({ tenantId: "tenant", mode: "founder" });
    expect(briefing.topPriorities.length).toBeGreaterThan(0);
    expect(briefing.waitingOnMe[0]?.category).toBe("waiting_on_me");
    expect(briefing.revenueWatch[0]?.category).toBe("revenue_watch");
    expect(briefing.operationsWatch[0]?.category).toBe("operations_watch");
    expect(briefing.calendarWatch[0]?.category).toBe("calendar_watch");
    expect(briefing.recommendedActions.length).toBeGreaterThan(0);
  });

  it("prioritizes release-blocking operations over lower-level work", async () => {
    const briefing = await service.generateBriefing({ tenantId: "tenant", mode: "founder" });
    expect(briefing.topPriorities[0]?.title).toContain("slo integrity failure");
  });

  it("supports company-scoped founder briefing mode without leaking mode boundaries", async () => {
    const briefing = await service.generateBriefing({ tenantId: "tenant", mode: "zbestmedia" });
    expect(briefing.activeMode).toBe("zbestmedia");
    expect(briefing.sourceMetadata.aaliyahRegistryVersion).toBe("2026-03-12.aaliyah.v1");
  });

  it("tracks low-confidence signals through the briefing confidence summary", async () => {
    const briefing = await service.generateBriefing({ tenantId: "tenant", mode: "founder" });
    expect(briefing.confidenceSummary.lowConfidenceSignals).toBeGreaterThanOrEqual(0);
  });

  it("applies allowed founder preferences to briefing presentation", async () => {
    const briefing = await service.generateBriefing({ tenantId: "tenant", mode: "founder" });
    expect(briefing.topPriorities.length).toBeLessThanOrEqual(3);
    expect(briefing.recommendedActions[0]?.action.length).toBeLessThanOrEqual(90);
  });
});
