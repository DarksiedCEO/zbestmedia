import { describe, expect, it } from "vitest";
import { assertAgentActive } from "../src/gate";
import type { AgentManifest } from "../src/manifest";

const base: AgentManifest = {
  agentId: "agent-brandon-v1",
  role: "Brand Trinity: Brandon",
  version: "v1",
  ownerDomain: "brand-trinity",
  createdAt: new Date("2026-02-01T00:00:00.000Z").toISOString(),
  expiresAt: new Date("2026-12-31T00:00:00.000Z").toISOString(),
  status: "ACTIVE",
  memoryNamespace: "brand-trinity/brandon"
};

describe("agent lifecycle gate", () => {
  it("allows ACTIVE non-expired agents", () => {
    expect(() => assertAgentActive(base, new Date("2026-02-05T00:00:00.000Z"))).not.toThrow();
  });

  it("blocks expired agents", () => {
    const expired = { ...base, expiresAt: new Date("2026-02-01T00:00:00.000Z").toISOString() };
    expect(() => assertAgentActive(expired, new Date("2026-02-05T00:00:00.000Z"))).toThrow();
  });

  it("blocks an ACTIVE agent at the exact expiry instant", () => {
    expect(() => assertAgentActive(base, new Date(base.expiresAt))).toThrowError(
      expect.objectContaining({ code: "AGENT_EXPIRED" })
    );
  });
});
