import { describe, expect, it } from "vitest";
import type { AgentManifest, RotationStore } from "@zbest/agent-lifecycle";
import { ensureBrandTrinityAgentsActive } from "../src/agents/boot";
import { BrandTrinityAgentSpecs, buildSeedManifests } from "../src/agents/registry";
import { assertBrandTrinityAgentsActive } from "../src/agents/gate";

// In-memory RotationStore honoring the real contract, so the boot flow under
// test is the genuine seed -> rotate -> assert pipeline.
function memoryStore(initial: AgentManifest[] = []) {
  const manifests = new Map(initial.map((m) => [m.agentId, { ...m }]));
  const audits: Array<{ type: string }> = [];

  const store: RotationStore = {
    listActiveManifests: async (opts) =>
      [...manifests.values()].filter(
        (m) =>
          m.status === "ACTIVE" && (!opts?.ownerDomain || m.ownerDomain === opts.ownerDomain)
      ),
    createManifest: async (m) => {
      manifests.set(m.agentId, { ...m });
    },
    updateStatus: async (agentId, status) => {
      const m = manifests.get(agentId);
      if (m) m.status = status;
    },
    writeHandoffSnapshot: async () => {},
    appendAuditEvent: async (e) => {
      audits.push({ type: e.type });
    }
  };

  return { store, manifests, audits };
}

const log = {
  info: () => {},
  warn: () => {},
  error: () => {}
} as any;

// The exact manifests production had hardcoded when the fuse was set:
// v2, created 2026-07-03, expiring 2026-10-01.
function productionV2Manifests(): AgentManifest[] {
  return BrandTrinityAgentSpecs.map((spec) => ({
    agentId: `${spec.baseAgentId}-v2`,
    role: spec.role,
    version: "v2",
    ownerDomain: "brand-trinity",
    createdAt: new Date("2026-07-03T00:00:00.000Z").toISOString(),
    expiresAt: new Date("2026-10-01T00:00:00.000Z").toISOString(),
    status: "ACTIVE",
    memoryNamespace: spec.memoryNamespace
  }));
}

describe("brand trinity boot — durable store, self-rotating (the defused bomb)", () => {
  it("first boot seeds every spec into an empty store and passes the gate", async () => {
    const { store, manifests } = memoryStore();

    const active = await ensureBrandTrinityAgentsActive({
      store,
      log,
      now: new Date("2026-07-04T00:00:00.000Z")
    });

    expect(active).toHaveLength(BrandTrinityAgentSpecs.length);
    for (const spec of BrandTrinityAgentSpecs) {
      const seeded = [...manifests.values()].find(
        (m) => m.memoryNamespace === spec.memoryNamespace && m.status === "ACTIVE"
      );
      expect(seeded, `spec ${spec.key} must be seeded`).toBeDefined();
      expect(new Date(seeded!.expiresAt).getTime()).toBeGreaterThan(
        new Date("2026-07-04T00:00:00.000Z").getTime()
      );
    }
  });

  it("THE BOMB, DEFUSED: on 2026-10-02 expired v2 manifests rotate to v3 and boot succeeds", async () => {
    const { store, manifests } = memoryStore(productionV2Manifests());
    const dayAfterTheFuse = new Date("2026-10-02T00:00:00.000Z");

    // Before the fix this scenario threw AGENT_EXPIRED and refused to boot.
    const active = await ensureBrandTrinityAgentsActive({ store, log, now: dayAfterTheFuse });

    expect(active).toHaveLength(BrandTrinityAgentSpecs.length);
    for (const spec of BrandTrinityAgentSpecs) {
      const successor = active.find((m) => m.memoryNamespace === spec.memoryNamespace);
      expect(successor, `spec ${spec.key} must have an active successor`).toBeDefined();
      expect(successor!.version).toBe("v3");
      expect(new Date(successor!.expiresAt).getTime()).toBeGreaterThan(dayAfterTheFuse.getTime());

      const predecessor = manifests.get(`${spec.baseAgentId}-v2`);
      expect(predecessor?.status, `${spec.key} v2 must be retired, not deleted`).toBe("RETIRED");
    }
  });

  it("fail-closed survives: when rotation cannot produce active manifests, boot still throws", async () => {
    const { store } = memoryStore(productionV2Manifests());
    const brokenStore: RotationStore = {
      ...store,
      createManifest: async () => {
        throw new Error("store write refused");
      }
    };

    await expect(
      ensureBrandTrinityAgentsActive({
        store: brokenStore,
        log,
        now: new Date("2026-10-02T00:00:00.000Z")
      })
    ).rejects.toThrow();
  });

  it("seed manifests are date-relative — the static gate carries no calendar bomb", () => {
    const farFuture = new Date("2031-01-01T00:00:00.000Z");
    const seeds = buildSeedManifests(farFuture);
    expect(() => assertBrandTrinityAgentsActive(log, seeds, farFuture)).not.toThrow();
  });
});
