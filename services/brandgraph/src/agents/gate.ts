import { assertAgentActive } from "@zbest/agent-lifecycle";
import type { AgentManifest } from "@zbest/agent-lifecycle";
import type { FastifyBaseLogger } from "fastify";
import { buildSeedManifests } from "./registry";

// Fail-closed gate over a set of manifests. The default (no manifests passed)
// asserts date-relative seed manifests — the storeless dev/test path, which
// can never expire by calendar. Production boots through
// ensureBrandTrinityAgentsActive (agents/boot.ts), which loads, rotates, and
// asserts the DURABLE manifests instead.
export function assertBrandTrinityAgentsActive(
  log: FastifyBaseLogger,
  manifests: AgentManifest[] = buildSeedManifests(),
  now = new Date()
) {
  for (const manifest of manifests) {
    assertAgentActive(manifest, now, log as any);
    log.info(
      { agentId: manifest.agentId, expiresAt: manifest.expiresAt },
      "agent registered"
    );
  }
}
