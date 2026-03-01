import { createHash } from "node:crypto";

export type PolicyResolveAuditConfig = {
  enabled: boolean;
  sampleRate: number;
  seed: string;
};

function parseBool(value: string | undefined, fallback: boolean): boolean {
  if (value == null) return fallback;
  return value.toLowerCase() === "true";
}

function clampSampleRate(value: number): number {
  if (!Number.isFinite(value)) return 0.01;
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

export function readPolicyResolveAuditConfig(env: NodeJS.ProcessEnv): PolicyResolveAuditConfig {
  const enabled = parseBool(env.POLICY_RESOLVE_AUDIT_ENABLED, false);
  const sampleRate = clampSampleRate(Number(env.POLICY_RESOLVE_AUDIT_SAMPLE_RATE ?? "0.01"));
  const seed = env.POLICY_RESOLVE_AUDIT_SEED?.trim() || "1337";
  return { enabled, sampleRate, seed };
}

export function shouldSamplePolicyResolveAudit(config: PolicyResolveAuditConfig, fingerprint: string): boolean {
  if (!config.enabled) return false;
  if (config.sampleRate <= 0) return false;
  if (config.sampleRate >= 1) return true;

  const digest = createHash("sha256")
    .update(`${config.seed}:${fingerprint}`, "utf8")
    .digest("hex");
  const bucket = Number.parseInt(digest.slice(0, 8), 16) / 0xffffffff;
  return bucket < config.sampleRate;
}
