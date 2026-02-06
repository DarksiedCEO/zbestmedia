import type { AgentManifest } from "@zbest/agent-lifecycle";

export const BrandTrinityAgentRegistry: Record<string, AgentManifest> = {
  brandyn: {
    agentId: "brandyn-v1",
    role: "Brand Trinity: Brandyn",
    version: "v1",
    ownerDomain: "brand-trinity",
    createdAt: new Date("2026-02-05T00:00:00.000Z").toISOString(),
    expiresAt: new Date("2026-04-06T00:00:00.000Z").toISOString(),
    status: "ACTIVE",
    memoryNamespace: "brand-trinity/brandyn"
  },
  kobe: {
    agentId: "kobe-v1",
    role: "Brand Trinity: Kobe",
    version: "v1",
    ownerDomain: "brand-trinity",
    createdAt: new Date("2026-02-05T00:00:00.000Z").toISOString(),
    expiresAt: new Date("2026-04-06T00:00:00.000Z").toISOString(),
    status: "ACTIVE",
    memoryNamespace: "brand-trinity/kobe"
  },
  jordyn: {
    agentId: "jordyn-v1",
    role: "Brand Trinity: Jordyn",
    version: "v1",
    ownerDomain: "brand-trinity",
    createdAt: new Date("2026-02-05T00:00:00.000Z").toISOString(),
    expiresAt: new Date("2026-04-06T00:00:00.000Z").toISOString(),
    status: "ACTIVE",
    memoryNamespace: "brand-trinity/jordyn"
  },
  agp: {
    agentId: "agp-v1",
    role: "Brand Trinity: #AGP Hashtag Agent",
    version: "v1",
    ownerDomain: "brand-trinity",
    createdAt: new Date("2026-02-05T00:00:00.000Z").toISOString(),
    expiresAt: new Date("2026-04-06T00:00:00.000Z").toISOString(),
    status: "ACTIVE",
    memoryNamespace: "brand-trinity/agp"
  }
};
