import { describe, expect, it } from "vitest";

import type { AppEnv } from "../src/config/env";
import { PolicyFirewall } from "../src/policy/firewall";

function mkEnv(overrides: Partial<AppEnv> = {}): AppEnv {
  return {
    NODE_ENV: "test",
    PORT: 0,
    DATABASE_URL: "postgres://example",
    AUTH_JWT_SECRET: "x".repeat(64),
    ARTIFACT_SIGNING_KEY: "y".repeat(64),
    MAX_ARTIFACT_WRITES_PER_MINUTE: 60,
    MAX_POLICY_PAYLOAD_BYTES: 50_000,
    MAX_POLICY_PAYLOAD_KEYS: 200,
    FORBIDDEN_ARTIFACT_TYPES: "legal.advice,medical.advice",
    FORBIDDEN_PHRASES: "guaranteed results,no risk,100% guaranteed",
    POLICY_VERSION: "policy-v1",
    MAX_PROVENANCE_DEPTH: 25,
      LEAD_MAX_EVENT_PAYLOAD_BYTES: 16_384,
      LEAD_MAX_CONVERSION_META_BYTES: 16_384,
      LEAD_MAX_INTAKE_ATTR_BYTES: 16_384,
      LEAD_ROUTE_SLOW_BUDGET_MS: 250,
    ...overrides
  };
}

describe("PolicyFirewall v1", () => {
  it("allows normal payload", () => {
    const fw = new PolicyFirewall(mkEnv());
    const decision = fw.validateArtifactWrite({
      action: "artifact_create",
      tenantId: "tenant",
      actorId: "actor",
      artifactType: "brand.positioning",
      payload: { headline: "Hello", body: "World" }
    });

    expect(decision.allowed).toBe(true);
    expect(decision.violations).toEqual([]);
  });

  it("blocks forbidden artifactType", () => {
    const fw = new PolicyFirewall(mkEnv());
    const decision = fw.validateArtifactWrite({
      action: "artifact_create",
      tenantId: "tenant",
      actorId: "actor",
      artifactType: "legal.advice",
      payload: { text: "hi" }
    });

    expect(decision.allowed).toBe(false);
    expect(decision.violations.some((v) => v.code === "artifact_type_forbidden")).toBe(true);
  });

  it("blocks oversized payload", () => {
    const fw = new PolicyFirewall(mkEnv({ MAX_POLICY_PAYLOAD_BYTES: 50 }));
    const decision = fw.validateArtifactWrite({
      action: "artifact_create",
      tenantId: "tenant",
      actorId: "actor",
      artifactType: "brand.positioning",
      payload: { text: "x".repeat(200) }
    });

    expect(decision.allowed).toBe(false);
    expect(decision.violations.some((v) => v.code === "payload_too_large")).toBe(true);
  });

  it("blocks forbidden phrases in payload text", () => {
    const fw = new PolicyFirewall(mkEnv());
    const decision = fw.validateArtifactWrite({
      action: "artifact_create",
      tenantId: "tenant",
      actorId: "actor",
      artifactType: "brand.copy",
      payload: { claim: "We provide Guaranteed Results now." }
    });

    expect(decision.allowed).toBe(false);
    expect(decision.violations.some((v) => v.code === "payload_forbidden_phrase")).toBe(true);
  });
});
