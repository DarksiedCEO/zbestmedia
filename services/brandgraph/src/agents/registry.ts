import type { AgentManifest } from "@zbest/agent-lifecycle";

// Rotation history: v1 manifests expired 2026-04-06 and the fail-closed gate
// (correctly) refused to boot; v2 was a hardcoded 90-day window due to expire
// 2026-10-01 — a calendar time-bomb requiring a source edit to defuse.
//
// DEFUSED 2026-07-04: this file no longer carries expiry dates. It is the
// SPEC (identity, role, memory namespace) plus a seed builder. The durable
// authority is the AgentManifest table: at boot, ensureBrandTrinityAgentsActive
// (agents/boot.ts) seeds missing manifests, rotates expired/expiring ones via
// the audited rotation job, and only then asserts the fail-closed gate.
// Renewal is an operation, not a source-code edit.

export type BrandTrinityAgentSpec = {
  key: string;
  baseAgentId: string;
  role: string;
  ownerDomain: "brand-trinity";
  memoryNamespace: string;
};

export const BrandTrinityAgentSpecs: BrandTrinityAgentSpec[] = [
  {
    key: "brandyn",
    baseAgentId: "brandyn",
    role: "Brand Trinity: Brandyn",
    ownerDomain: "brand-trinity",
    memoryNamespace: "brand-trinity/brandyn"
  },
  {
    key: "kobe",
    baseAgentId: "kobe",
    role: "Brand Trinity: Kobe",
    ownerDomain: "brand-trinity",
    memoryNamespace: "brand-trinity/kobe"
  },
  {
    key: "jordyn",
    baseAgentId: "jordyn",
    role: "Brand Trinity: Jordyn",
    ownerDomain: "brand-trinity",
    memoryNamespace: "brand-trinity/jordyn"
  },
  {
    key: "agp",
    baseAgentId: "agp",
    role: "Brand Trinity: #AGP Hashtag Agent",
    ownerDomain: "brand-trinity",
    memoryNamespace: "brand-trinity/agp"
  }
];

export const SEED_VERSION = "v2";
export const SEED_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;

export function buildSeedManifest(spec: BrandTrinityAgentSpec, now = new Date()): AgentManifest {
  return {
    agentId: `${spec.baseAgentId}-${SEED_VERSION}`,
    role: spec.role,
    version: SEED_VERSION,
    ownerDomain: spec.ownerDomain,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + SEED_WINDOW_MS).toISOString(),
    status: "ACTIVE",
    memoryNamespace: spec.memoryNamespace
  };
}

export function buildSeedManifests(now = new Date()): AgentManifest[] {
  return BrandTrinityAgentSpecs.map((spec) => buildSeedManifest(spec, now));
}

// Backward-compatible view keyed by spec key. Date-relative: windows are
// computed from the current clock, never hardcoded.
export const BrandTrinityAgentRegistry: Record<string, AgentManifest> = Object.fromEntries(
  BrandTrinityAgentSpecs.map((spec) => [spec.key, buildSeedManifest(spec)])
);
