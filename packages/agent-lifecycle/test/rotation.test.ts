import { expect, it } from "vitest";
import type { AgentManifest } from "../src/manifest";
import { runRotation } from "../src/rotation";

function makeManifest(overrides: Partial<AgentManifest> = {}): AgentManifest {
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

it("rotates expired agents: creates successor + retires predecessor + writes handoff", async () => {
  const calls: string[] = [];
  const store = {
    listActiveManifests: async () => [makeManifest()],
    createManifest: async () => { calls.push("createManifest"); },
    updateStatus: async () => { calls.push("updateStatus"); },
    writeHandoffSnapshot: async () => { calls.push("writeHandoffSnapshot"); },
    appendAuditEvent: async () => { calls.push("appendAuditEvent"); }
  };

  const res = await runRotation(store, {
    policy: { rotateWindowMs: 0 },
    now: new Date("2026-02-05T00:00:00.000Z")
  });

  expect(res.rotated).toBe(1);
  expect(calls).toContain("createManifest");
  expect(calls).toContain("writeHandoffSnapshot");
  expect(calls).toContain("updateStatus");
});
