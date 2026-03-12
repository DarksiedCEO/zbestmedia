import { describe, expect, it, vi } from "vitest";

import { AgentTelemetryService } from "../src/telemetry/service.js";

describe("AgentTelemetryService", () => {
  const org = {
    getManifestVersion: vi.fn(() => "2026-03-12.v1")
  } as never;

  it("classifies critical when release-blocking critical incidents are open", async () => {
    const service = new AgentTelemetryService(
      {
        listExecutionRunRecords: vi.fn(async () => [
          {
            tenantId: "tenant-1",
            runRecordId: "run:1",
            assignmentRecordId: "assignment:1",
            executionId: "execution:1",
            currentState: "failed",
            requestedAt: "2026-03-12T00:00:00.000Z",
            validatedAt: null,
            routedAt: null,
            blockedAt: null,
            executionStartedAt: null,
            retriableAt: null,
            executionEndedAt: "2026-03-12T00:00:05.000Z",
            failureCategory: "routing_failure",
            failureMessage: "Route failed",
            retryable: false,
            metadata: {},
            createdAt: "2026-03-12T00:00:00.000Z",
            updatedAt: "2026-03-12T00:00:05.000Z"
          }
        ])
      } as never,
      {
        listIncidents: vi.fn(async () => [
          {
            tenantId: "tenant-1",
            incidentId: "incident:1",
            incidentType: "slo_integrity_failure",
            severity: "critical",
            status: "open",
            owningExecutiveId: "cto",
            owningDepartmentId: "technology-engineering",
            owningLeadAgentId: "code-sentinel",
            owningSubAgentId: "slo-enforcer",
            sourceSystem: "ops-smoke",
            relatedSignalType: "slo_release_gate",
            relatedAssignmentRecordId: null,
            relatedRunRecordId: null,
            title: "SLO integrity failure",
            summary: "Workers stale",
            details: {},
            recommendedAction: "Fix workers",
            releaseBlocking: true,
            createdAt: "2026-03-12T00:00:00.000Z",
            updatedAt: "2026-03-12T00:00:00.000Z",
            acknowledgedAt: null,
            acknowledgedBy: null,
            resolvedAt: null,
            resolvedBy: null,
            resolutionNote: null
          }
        ])
      } as never,
      org
    );

    const summary = await service.getOpsStatusSummary({ tenantId: "tenant-1" });

    expect(summary.status).toBe("critical");
    expect(summary.incidents.releaseBlockingOpenCount).toBe(1);
    expect(summary.codeSentinel.openIncidentCountBySubAgent["slo-enforcer"]).toBe(1);
    expect(summary.degradedSurfaces).toContain("slo");
  });

  it("classifies warning when non-blocking failures accumulate", async () => {
    const service = new AgentTelemetryService(
      {
        listExecutionRunRecords: vi.fn(async () => [
          {
            tenantId: "tenant-1",
            runRecordId: "run:2",
            assignmentRecordId: "assignment:2",
            executionId: "execution:2",
            currentState: "failed",
            requestedAt: "2026-03-12T00:00:00.000Z",
            validatedAt: null,
            routedAt: null,
            blockedAt: null,
            executionStartedAt: null,
            retriableAt: null,
            executionEndedAt: "2026-03-12T00:00:05.000Z",
            failureCategory: "policy_rejection",
            failureMessage: "Rejected",
            retryable: false,
            metadata: {},
            createdAt: "2026-03-12T00:00:00.000Z",
            updatedAt: "2026-03-12T00:00:05.000Z"
          }
        ])
      } as never,
      {
        listIncidents: vi.fn(async () => [
          {
            tenantId: "tenant-1",
            incidentId: "incident:2",
            incidentType: "execution_runtime_failure",
            severity: "warning",
            status: "open",
            owningExecutiveId: "cto",
            owningDepartmentId: "technology-engineering",
            owningLeadAgentId: "code-sentinel",
            owningSubAgentId: "runtime-health-monitor",
            sourceSystem: "runtime",
            relatedSignalType: "runtime_health",
            relatedAssignmentRecordId: null,
            relatedRunRecordId: null,
            title: "Execution runtime failure",
            summary: "Runtime degraded",
            details: {},
            recommendedAction: "Inspect runtime",
            releaseBlocking: false,
            createdAt: "2026-03-12T00:00:00.000Z",
            updatedAt: "2026-03-12T00:00:00.000Z",
            acknowledgedAt: null,
            acknowledgedBy: null,
            resolvedAt: null,
            resolvedBy: null,
            resolutionNote: null
          }
        ])
      } as never,
      org
    );

    const summary = await service.getOpsStatusSummary({ tenantId: "tenant-1" });

    expect(summary.status).toBe("warning");
    expect(summary.executions.policyRejectionCount).toBe(1);
  });

  it("classifies healthy when there are no incidents or failures", async () => {
    const service = new AgentTelemetryService(
      { listExecutionRunRecords: vi.fn(async () => []) } as never,
      { listIncidents: vi.fn(async () => []) } as never,
      org
    );

    const summary = await service.getOpsStatusSummary({ tenantId: "tenant-1" });

    expect(summary.status).toBe("healthy");
    expect(summary.degradedSurfaces).toEqual([]);
  });
});
