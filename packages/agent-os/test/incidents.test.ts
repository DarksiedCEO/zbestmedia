import { describe, expect, it, vi } from "vitest";

import { AgentIncidentService } from "../src/index.js";

describe("agent incident service", () => {
  it("creates incidents from operational signals with Code Sentinel ownership", async () => {
    const repository = {
      createIncidentRecord: vi.fn(async (args) => ({
        incidentId: "incident:signal:1",
        ...args
      }))
    } as never;

    const service = new AgentIncidentService(repository);
    const incident = await service.createFromOperationalSignal({
      tenantId: "11111111-1111-4111-8111-111111111111",
      actorId: "actor-1",
      signal: {
        signalType: "migration_integrity",
        status: "critical",
        sourceSystem: "verify-migrations",
        message: "Missing required tables."
      }
    });

    expect(incident.incidentType).toBe("migration_integrity_failure");
    expect(incident.severity).toBe("critical");
    expect(incident.owningLeadAgentId).toBe("code-sentinel");
    expect(incident.owningSubAgentId).toBe("migration-guardian");
    expect(incident.releaseBlocking).toBe(true);
  });

  it("creates incidents from execution failures with runtime defaults", async () => {
    const repository = {
      createIncidentRecord: vi.fn(async (args) => ({
        incidentId: "incident:exec:1",
        ...args
      }))
    } as never;

    const service = new AgentIncidentService(repository);
    const incident = await service.createFromExecutionFailure({
      tenantId: "11111111-1111-4111-8111-111111111111",
      actorId: "actor-1",
      failure: {
        incidentType: "execution_runtime_failure",
        sourceSystem: "agent-execution-service",
        message: "Prompt executor failed.",
        relatedAssignmentRecordId: "assignment:1",
        relatedRunRecordId: "run:1"
      }
    });

    expect(incident.incidentType).toBe("execution_runtime_failure");
    expect(incident.relatedAssignmentRecordId).toBe("assignment:1");
    expect(incident.relatedRunRecordId).toBe("run:1");
    expect(incident.releaseBlocking).toBe(false);
    expect(incident.owningSubAgentId).toBe("runtime-health-monitor");
  });

  it("acknowledges and resolves incidents through the repository seam", async () => {
    const repository = {
      acknowledgeIncidentRecord: vi.fn(async (args) => ({
        incidentId: args.incidentId,
        status: "acknowledged",
        acknowledgedBy: args.acknowledgedBy
      })),
      resolveIncidentRecord: vi.fn(async (args) => ({
        incidentId: args.incidentId,
        status: "resolved",
        resolvedBy: args.resolvedBy,
        resolutionNote: args.resolutionNote
      }))
    } as never;

    const service = new AgentIncidentService(repository);
    const acknowledged = await service.acknowledgeIncident({
      tenantId: "11111111-1111-4111-8111-111111111111",
      incidentId: "incident:1",
      actorId: "actor-1"
    });
    const resolved = await service.resolveIncident({
      tenantId: "11111111-1111-4111-8111-111111111111",
      incidentId: "incident:1",
      actorId: "actor-1",
      resolutionNote: "fixed"
    });

    expect(acknowledged.status).toBe("acknowledged");
    expect(resolved.status).toBe("resolved");
  });
});
