import { describe, expect, it } from "vitest";
import type { AgentManifest } from "@zbest/agent-lifecycle";
import { runBrandTrinityRotationJob } from "../src/agents/rotationJob";

function manifest(overrides: Partial<AgentManifest> = {}): AgentManifest {
  return {
    agentId: "brandyn-v1",
    role: "Brand Trinity: Brandyn",
    version: "v1",
    ownerDomain: "brand-trinity",
    createdAt: new Date("2026-02-01T00:00:00.000Z").toISOString(),
    expiresAt: new Date("2026-02-02T00:00:00.000Z").toISOString(),
    status: "ACTIVE",
    memoryNamespace: "brand-trinity/brandyn",
    ...overrides
  };
}

describe("rotation job (brand-trinity)", () => {
  it("rotates an expired agent", async () => {
    const created: AgentManifest[] = [];
    const statuses: Array<{ id: string; status: string }> = [];
    const handoffs: any[] = [];

    const store = {
      listActiveManifests: async () => [manifest()],
      createManifest: async (m: AgentManifest) => created.push(m),
      updateStatus: async (id: string, status: AgentManifest["status"]) => statuses.push({ id, status }),
      writeHandoffSnapshot: async (s: any) => handoffs.push(s),
      appendAuditEvent: async () => {}
    };

    const res = await runBrandTrinityRotationJob({
      store,
      now: new Date("2026-02-05T00:00:00.000Z")
    });

    expect(res.rotated).toBe(1);
    expect(created[0]?.agentId).toMatch(/brandyn-v2$/);
    expect(statuses.some((s) => s.id === "brandyn-v1" && s.status === "RETIRED")).toBe(true);
    expect(handoffs.length).toBeGreaterThan(0);
  });
});
