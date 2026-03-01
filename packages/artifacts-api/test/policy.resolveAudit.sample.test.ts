import { describe, expect, it } from "vitest";

import { readPolicyResolveAuditConfig, shouldSamplePolicyResolveAudit } from "../src/agency/policy/http/resolveAudit";

describe("policy resolve audit sampling", () => {
  it("always samples when sampleRate is 1", () => {
    const cfg = readPolicyResolveAuditConfig({
      POLICY_RESOLVE_AUDIT_ENABLED: "true",
      POLICY_RESOLVE_AUDIT_SAMPLE_RATE: "1",
      POLICY_RESOLVE_AUDIT_SEED: "42"
    } as NodeJS.ProcessEnv);
    expect(shouldSamplePolicyResolveAudit(cfg, "fingerprint-a")).toBe(true);
    expect(shouldSamplePolicyResolveAudit(cfg, "fingerprint-b")).toBe(true);
  });

  it("never samples when sampleRate is 0", () => {
    const cfg = readPolicyResolveAuditConfig({
      POLICY_RESOLVE_AUDIT_ENABLED: "true",
      POLICY_RESOLVE_AUDIT_SAMPLE_RATE: "0",
      POLICY_RESOLVE_AUDIT_SEED: "42"
    } as NodeJS.ProcessEnv);
    expect(shouldSamplePolicyResolveAudit(cfg, "fingerprint-a")).toBe(false);
    expect(shouldSamplePolicyResolveAudit(cfg, "fingerprint-b")).toBe(false);
  });

  it("is deterministic for seed and fingerprint", () => {
    const cfg = readPolicyResolveAuditConfig({
      POLICY_RESOLVE_AUDIT_ENABLED: "true",
      POLICY_RESOLVE_AUDIT_SAMPLE_RATE: "0.5",
      POLICY_RESOLVE_AUDIT_SEED: "1337"
    } as NodeJS.ProcessEnv);

    const first = shouldSamplePolicyResolveAudit(cfg, "tenant:policy:request-1");
    const second = shouldSamplePolicyResolveAudit(cfg, "tenant:policy:request-1");
    expect(first).toBe(second);
  });
});
