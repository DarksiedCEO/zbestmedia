import { describe, expect, it, vi } from "vitest";

import { AgentAdminService } from "../src/admin/service.js";

describe("AgentAdminService", () => {
  it("builds a control-plane summary from integrity and telemetry", async () => {
    const service = new AgentAdminService(
      {
        getManifestVersion: vi.fn(() => "2026-03-12.v1")
      } as never,
      {
        resolve: vi.fn()
      } as never,
      {
        listAssignmentRecords: vi.fn(async () => []),
        getAssignmentRecord: vi.fn(async () => null),
        listExecutionRunRecords: vi.fn(async () => []),
        getExecutionRunRecord: vi.fn(async () => null)
      } as never,
      {
        listIncidents: vi.fn(async () => []),
        getIncident: vi.fn(async () => null)
      } as never,
      {
        getOpsStatusSummary: vi.fn(async () => ({
          status: "warning",
          manifestVersion: "2026-03-12.v1",
          generatedAt: "2026-03-12T00:00:00.000Z",
          incidents: {
            manifestVersion: "2026-03-12.v1",
            generatedAt: "2026-03-12T00:00:00.000Z",
            openBySeverity: { info: 0, warning: 2, critical: 0 },
            openByType: {
              build_integrity_failure: 0,
              dependency_integrity_failure: 0,
              runtime_health_failure: 0,
              migration_integrity_failure: 0,
              route_contract_failure: 1,
              slo_integrity_failure: 0,
              execution_policy_failure: 1,
              execution_runtime_failure: 0
            },
            releaseBlockingOpenCount: 0,
            degradedSurfaces: ["route_contracts", "policy_routing"]
          },
          executions: {
            manifestVersion: "2026-03-12.v1",
            generatedAt: "2026-03-12T00:00:00.000Z",
            recentByState: {
              requested: 0,
              validated: 0,
              routed: 0,
              blocked: 0,
              executing: 0,
              retriable: 0,
              succeeded: 1,
              failed: 2
            },
            recentFailuresByCategory: {
              routing_failure: 1,
              policy_rejection: 1
            },
            routingFailureCount: 1,
            policyRejectionCount: 1
          },
          codeSentinel: {
            manifestVersion: "2026-03-12.v1",
            generatedAt: "2026-03-12T00:00:00.000Z",
            openIncidentCountBySubAgent: {
              "build-monitor": 0,
              "dependency-watcher": 0,
              "runtime-health-monitor": 0,
              "migration-guardian": 0,
              "route-contract-watcher": 1,
              "slo-enforcer": 0
            },
            openIncidentCountBySignal: {
              build_breakage: 0,
              dependency_drift: 0,
              runtime_health: 0,
              migration_integrity: 0,
              route_contract: 1,
              slo_release_gate: 0
            },
            mostImpactedSubAgent: "route-contract-watcher"
          },
          degradedSurfaces: ["route_contracts", "policy_routing"]
        }))
      } as never
    );

    const summary = await service.getControlPlaneSummary({ tenantId: "tenant-1" });

    expect(summary.manifestVersion).toBe("2026-03-12.v1");
    expect(summary.integrity.valid).toBe(true);
    expect(summary.ops.status).toBe("warning");
    expect(summary.openIncidentCount).toBe(2);
    expect(summary.recentExecutionFailureCount).toBe(2);
    expect(summary.degradedSurfaces).toEqual(["route_contracts", "policy_routing"]);
  });
});
