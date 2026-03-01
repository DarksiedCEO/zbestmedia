import { createHash } from "node:crypto";

type ChaosConfig = {
  enabled: boolean;
  latencyMs: number;
  errorRate: number;
  seed: string;
};

function parseNumber(raw: string | undefined, fallback: number): number {
  if (raw == null) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return n;
}

export function readPolicyChaosConfig(env: NodeJS.ProcessEnv): ChaosConfig {
  const enabled = String(env.POLICY_CHAOS_ENABLED ?? "false").toLowerCase() === "true";
  const latencyMs = Math.max(0, Math.floor(parseNumber(env.POLICY_CHAOS_LATENCY_MS, 0)));
  const errorRateRaw = parseNumber(env.POLICY_CHAOS_ERROR_RATE, 0);
  const errorRate = Math.max(0, Math.min(1, errorRateRaw));
  const seed = String(env.POLICY_CHAOS_SEED ?? "1337");
  return { enabled, latencyMs, errorRate, seed };
}

function hashToUnit(seed: string, fingerprint: string): number {
  const digest = createHash("sha256")
    .update(seed, "utf8")
    .update("|", "utf8")
    .update(fingerprint, "utf8")
    .digest();
  const n = digest.readUInt32BE(0);
  return n / 0xffffffff;
}

export function shouldInjectChaosError(config: ChaosConfig, fingerprint: string): boolean {
  if (!config.enabled) return false;
  if (config.errorRate <= 0) return false;
  return hashToUnit(config.seed, fingerprint) < config.errorRate;
}

export async function maybeApplyChaosLatency(config: ChaosConfig): Promise<void> {
  if (!config.enabled || config.latencyMs <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, config.latencyMs));
}
