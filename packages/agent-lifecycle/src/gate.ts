import { AgentLifecycleError, AgentManifest, AgentManifestSchema } from "./manifest";

export type GateLogger = {
  info: (obj: Record<string, unknown>, msg?: string) => void;
  warn: (obj: Record<string, unknown>, msg?: string) => void;
  error: (obj: Record<string, unknown>, msg?: string) => void;
};

export function parseManifest(input: unknown): AgentManifest {
  const parsed = AgentManifestSchema.safeParse(input);
  if (!parsed.success) {
    throw new AgentLifecycleError(
      "MANIFEST_INVALID",
      `Invalid agent manifest: ${parsed.error.message}`
    );
  }
  return parsed.data;
}

export function assertAgentActive(manifest: AgentManifest, now = new Date(), log?: GateLogger) {
  const expiresAt = new Date(manifest.expiresAt);

  if (Number.isNaN(expiresAt.getTime())) {
    throw new AgentLifecycleError("MANIFEST_INVALID", "expiresAt is not a valid datetime");
  }

  if (manifest.status === "DISABLED") {
    log?.warn({ agentId: manifest.agentId, status: manifest.status }, "agent disabled");
    throw new AgentLifecycleError("AGENT_DISABLED", "Agent is disabled");
  }

  if (manifest.status !== "ACTIVE") {
    log?.warn({ agentId: manifest.agentId, status: manifest.status }, "agent not active");
    throw new AgentLifecycleError("AGENT_NOT_ACTIVE", "Agent is not ACTIVE");
  }

  if (now.getTime() > expiresAt.getTime()) {
    log?.warn(
      { agentId: manifest.agentId, expiresAt: manifest.expiresAt, now: now.toISOString() },
      "agent expired"
    );
    throw new AgentLifecycleError("AGENT_EXPIRED", "Agent is expired");
  }

  log?.info(
    { agentId: manifest.agentId, role: manifest.role, expiresAt: manifest.expiresAt },
    "agent gate passed"
  );
}
