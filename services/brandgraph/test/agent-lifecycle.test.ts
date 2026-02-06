import { describe, expect, it } from "vitest";
import { assertAgentActive } from "@zbest/agent-lifecycle";
import { BrandTrinityAgentRegistry } from "../src/agents/registry";

describe("brandgraph agent lifecycle gate", () => {
  it("blocks expired registry agents (fail-closed)", () => {
    const agp = BrandTrinityAgentRegistry.agp;
    const expired = { ...agp, expiresAt: new Date("2000-01-01T00:00:00.000Z").toISOString() };
    expect(() => assertAgentActive(expired, new Date("2026-02-05T00:00:00.000Z"))).toThrow();
  });
});
