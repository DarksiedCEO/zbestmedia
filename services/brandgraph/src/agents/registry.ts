import type { AgentManifest } from "@zbest/agent-lifecycle";

// Rotation 2026-07-03: v1 manifests expired 2026-04-06 and the fail-closed
// lifecycle gate (correctly) refused to boot the service. Rotated to v2 with a
// 90-day window. NEXT ROTATION DUE BEFORE 2026-10-01 — or wire the rotation
// job to a durable store the boot gate consults, so renewal is operational
// rather than a source-code edit.
export const BrandTrinityAgentRegistry: Record<string, AgentManifest> = {
  brandyn: {
    agentId: "brandyn-v2",
    role: "Brand Trinity: Brandyn",
    version: "v2",
    ownerDomain: "brand-trinity",
    createdAt: new Date("2026-07-03T00:00:00.000Z").toISOString(),
    expiresAt: new Date("2026-10-01T00:00:00.000Z").toISOString(),
    status: "ACTIVE",
    memoryNamespace: "brand-trinity/brandyn"
  },
  kobe: {
    agentId: "kobe-v2",
    role: "Brand Trinity: Kobe",
    version: "v2",
    ownerDomain: "brand-trinity",
    createdAt: new Date("2026-07-03T00:00:00.000Z").toISOString(),
    expiresAt: new Date("2026-10-01T00:00:00.000Z").toISOString(),
    status: "ACTIVE",
    memoryNamespace: "brand-trinity/kobe"
  },
  jordyn: {
    agentId: "jordyn-v2",
    role: "Brand Trinity: Jordyn",
    version: "v2",
    ownerDomain: "brand-trinity",
    createdAt: new Date("2026-07-03T00:00:00.000Z").toISOString(),
    expiresAt: new Date("2026-10-01T00:00:00.000Z").toISOString(),
    status: "ACTIVE",
    memoryNamespace: "brand-trinity/jordyn"
  },
  agp: {
    agentId: "agp-v2",
    role: "Brand Trinity: #AGP Hashtag Agent",
    version: "v2",
    ownerDomain: "brand-trinity",
    createdAt: new Date("2026-07-03T00:00:00.000Z").toISOString(),
    expiresAt: new Date("2026-10-01T00:00:00.000Z").toISOString(),
    status: "ACTIVE",
    memoryNamespace: "brand-trinity/agp"
  }
};
