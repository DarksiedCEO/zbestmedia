import { assertAgentActive } from "@zbest/agent-lifecycle";
import type { FastifyBaseLogger } from "fastify";
import { BrandTrinityAgentRegistry } from "./registry";

export function assertBrandTrinityAgentsActive(log: FastifyBaseLogger) {
  for (const [key, manifest] of Object.entries(BrandTrinityAgentRegistry)) {
    assertAgentActive(manifest, new Date(), log as any);
    log.info({ key, agentId: manifest.agentId, expiresAt: manifest.expiresAt }, "agent registered");
  }
}
