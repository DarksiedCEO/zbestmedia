import { AgentLifecycleError, assertAgentActive } from "@zbest/agent-lifecycle";
import type { AgentManifest, RotationStore } from "@zbest/agent-lifecycle";
import { runBrandTrinityRotationJob } from "./rotationJob.js";
import { BrandTrinityAgentSpecs, buildSeedManifest } from "./registry.js";

type BootLogger = {
  info: (obj: Record<string, unknown>, msg?: string) => void;
  warn: (obj: Record<string, unknown>, msg?: string) => void;
  error: (obj: Record<string, unknown>, msg?: string) => void;
};

export type EnsureAgentsArgs = {
  store: RotationStore;
  log?: BootLogger;
  now?: Date;
};

// The defused boot sequence — durable store as the single authority:
//   1. SEED  — any spec with no ACTIVE manifest gets one (first boot,
//              or a spec added later).
//   2. ROTATE — the audited rotation job renews anything EXPIRED or
//              EXPIRING_SOON: successor created, handoff written,
//              predecessor RETIRED. Renewal is an operation, not an edit.
//   3. ASSERT — fail-closed stays: every spec must end with an ACTIVE,
//              unexpired manifest or boot throws.
export async function ensureBrandTrinityAgentsActive(
  args: EnsureAgentsArgs
): Promise<AgentManifest[]> {
  const now = args.now ?? new Date();
  const log = args.log;

  // 1. Seed specs that have no active manifest at all. Specs with an
  // expired-but-ACTIVE manifest are NOT reseeded — rotation is their
  // renewal path, preserving lineage and the audit trail.
  const existing = await args.store.listActiveManifests({ ownerDomain: "brand-trinity" });
  for (const spec of BrandTrinityAgentSpecs) {
    const present = existing.some((m) => m.memoryNamespace === spec.memoryNamespace);
    if (present) continue;

    const seed = buildSeedManifest(spec, now);
    await args.store.createManifest(seed);
    await args.store.appendAuditEvent({
      at: now.toISOString(),
      type: "AGENT_SUCCESSOR_CREATED",
      actor: "boot-seed",
      toAgentId: seed.agentId,
      details: { seeded: true, spec: spec.key }
    });
    log?.warn({ agentId: seed.agentId, spec: spec.key }, "agent manifest seeded at boot");
  }

  // 2. Rotate anything expired or inside the rotation window.
  const rotation = await runBrandTrinityRotationJob({ store: args.store, now });
  if (rotation.rotated > 0) {
    log?.info({ rotated: rotation.rotated, skipped: rotation.skipped }, "agent rotation at boot");
  }

  // 3. Fail-closed assertion over the durable state.
  const active = await args.store.listActiveManifests({ ownerDomain: "brand-trinity" });
  const asserted: AgentManifest[] = [];
  for (const spec of BrandTrinityAgentSpecs) {
    const manifest = active.find((m) => m.memoryNamespace === spec.memoryNamespace);
    if (!manifest) {
      throw new AgentLifecycleError(
        "AGENT_NOT_ACTIVE",
        `No active manifest for brand-trinity agent "${spec.key}" after seed+rotation`
      );
    }
    assertAgentActive(manifest, now, log);
    asserted.push(manifest);
  }

  return asserted;
}
