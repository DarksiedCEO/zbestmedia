import { createHash } from "crypto";
import type { PrismaClient } from "../generated/prisma/index.js";
import type { AgentManifest, RotationStore } from "@zbest/agent-lifecycle";
import type { AgentStatus, AuditEvent, HandoffSnapshot } from "@zbest/agent-lifecycle";

export function createPrismaRotationStore(
  prisma: PrismaClient,
  tenantId: string,
  options: { serializeGraphEventPayload?: boolean } = {}
): RotationStore {
  const serializeGraphEventPayload = options.serializeGraphEventPayload ?? false;

  return {
    async listActiveManifests(opts) {
      const rows = await prisma.agentManifest.findMany({
        where: {
          tenantId,
          status: "ACTIVE",
          ...(opts?.ownerDomain ? { ownerDomain: opts.ownerDomain } : {}),
        },
        orderBy: [{ expiresAt: "asc" }, { agentId: "asc" }],
      });

      return rows.map((row) => ({
        agentId: row.agentId,
        role: row.role,
        version: row.version,
        ownerDomain: row.ownerDomain,
        createdAt: row.createdAt.toISOString(),
        expiresAt: row.expiresAt.toISOString(),
        status: row.status,
        memoryNamespace: row.memoryNamespace,
        successorAgentId: row.successorAgentId ?? undefined
      }));
    },

    async createManifest(m: AgentManifest) {
      await prisma.agentManifest.upsert({
        where: { agentId: m.agentId },
        update: {
          tenantId,
          ownerDomain: m.ownerDomain,
          role: m.role,
          version: m.version,
          status: m.status as AgentStatus,
          expiresAt: new Date(m.expiresAt),
          memoryNamespace: m.memoryNamespace,
          successorAgentId: m.successorAgentId ?? null,
        },
        create: {
          agentId: m.agentId,
          tenantId,
          ownerDomain: m.ownerDomain,
          role: m.role,
          version: m.version,
          status: m.status as AgentStatus,
          createdAt: new Date(m.createdAt),
          expiresAt: new Date(m.expiresAt),
          memoryNamespace: m.memoryNamespace,
          successorAgentId: m.successorAgentId ?? null,
        },
      });
    },

    async updateStatus(agentId: string, status: AgentManifest["status"]) {
      await prisma.agentManifest.update({
        where: { agentId },
        data: { status: status as AgentStatus },
      });
    },

    async writeHandoffSnapshot(snapshot: HandoffSnapshot) {
      const id = createHash("sha256")
        .update(JSON.stringify(snapshot))
        .digest("hex")
        .substring(0, 24);
      const payloadValue = serializeGraphEventPayload ? JSON.stringify(snapshot) : snapshot;

      await prisma.graphEvent.create({
        data: {
          id,
          tenantId,
          brandId: null,
          eventType: "AGENT_HANDOFF_WRITTEN",
          payload: payloadValue as any,
        },
      });
    },

    async appendAuditEvent(event: AuditEvent) {
      const agentId = event.fromAgentId ?? event.toAgentId;
      if (!agentId) {
        throw new Error("AUDIT_EVENT_MISSING_AGENT");
      }

      const { fromStatus, toStatus } = mapStatuses(event);

      await prisma.rotationAudit.create({
        data: {
          tenantId,
          agentId,
          fromStatus,
          toStatus,
          successorAgentId: event.toAgentId ?? null,
          reason: event.reason ?? event.type,
        },
      });
    },
  };
}

function mapStatuses(event: AuditEvent): { fromStatus: AgentStatus; toStatus: AgentStatus } {
  switch (event.type) {
    case "AGENT_RETIRED":
      return { fromStatus: "ACTIVE", toStatus: "RETIRED" };
    case "AGENT_ROTATION_FAILED":
    case "AGENT_ROTATION_SKIPPED":
    case "AGENT_HANDOFF_WRITTEN":
    case "AGENT_SUCCESSOR_CREATED":
    case "AGENT_ROTATION_PLANNED":
    default:
      return { fromStatus: "ACTIVE", toStatus: "ACTIVE" };
  }
}
