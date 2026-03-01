import fs from "node:fs";
import path from "node:path";

import { z } from "zod";

import { canonicalJson, fingerprintFromParts, sha256Hex } from "./hash";

const DefaultThresholds = {
  p95InflationRatioCap: 1.25,
  p99InflationRatioCap: 1.5,
  errorRateIncreasePctPointsCap: 0.25,
  timeoutIncreasePctPointsCap: 0.1,
  breakerOpenRateIncreasePctPointsCap: 2,
  retryAmplificationIncreaseCap: 0.15
};

const BaselineRegistrySchema = z.object({
  baseline_report_path: z.string(),
  baseline_hash: z.string(),
  baseline_run_path: z.string(),
  accepted_at: z.string(),
  accepted_by: z.string(),
  notes: z.string(),
  chaos_report_path: z.string().optional().default("")
});

const SloEventSchema = z.object({
  event_id: z.string(),
  ts: z.string(),
  source: z.enum(["ci", "prod"]),
  verdict: z.object({
    passed: z.boolean(),
    reasons: z.array(z.string())
  }),
  metrics: z.object({
    retry_amplification: z.number().optional().default(0),
    breaker_open_rate: z.number().optional().default(0)
  }),
  tags: z.array(z.string()).optional().default([])
});

type SloEvent = z.infer<typeof SloEventSchema>;

const PolicyGovernanceSnapshotSchema = z.object({
  runtime: z.object({
    defaults_hash: z.string(),
    defaults_version: z.string(),
    enforcement_mode: z.string(),
    breaker: z.object({
      state: z.enum(["CLOSED", "OPEN", "HALF_OPEN"]),
      window_ms: z.number().int().positive(),
      open_threshold: z.number().int().positive(),
      half_open_cooldown_ms: z.number().int().positive()
    }),
    retry: z.object({
      max_attempts: z.number().int().nonnegative(),
      backoff_strategy: z.string(),
      base_delay_ms: z.number().int().nonnegative(),
      jitter_pct: z.number().nonnegative(),
      rolling_amplification_estimate: z.number().nonnegative()
    })
  }),
  baseline: z.object({
    current_baseline_hash: z.string(),
    accepted_at: z.string(),
    accepted_by: z.string()
  }),
  slo: z.object({
    last_ci_verdict: z
      .object({
        event_id: z.string(),
        passed: z.boolean(),
        ts: z.string(),
        reasons: z.array(z.string())
      })
      .nullable(),
    last_prod_verdict: z
      .object({
        event_id: z.string(),
        passed: z.boolean(),
        ts: z.string(),
        reasons: z.array(z.string())
      })
      .nullable(),
    last_event_ts: z.string().nullable(),
    sink_status: z.object({
      sink: z.enum(["file", "postgres"]),
      healthy: z.boolean(),
      detail: z.string()
    })
  }),
  guardrails: z.object({
    thresholds: z.object({
      p95InflationRatioCap: z.number(),
      p99InflationRatioCap: z.number(),
      errorRateIncreasePctPointsCap: z.number(),
      timeoutIncreasePctPointsCap: z.number(),
      breakerOpenRateIncreasePctPointsCap: z.number(),
      retryAmplificationIncreaseCap: z.number()
    }),
    guardrail_hash: z.string()
  }),
  governance_fingerprint: z.string()
});

export type PolicyGovernanceSnapshot = z.infer<typeof PolicyGovernanceSnapshotSchema>;

function readJsonFile(filePath: string): unknown {
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw);
}

function readSloEvents(filePath: string): SloEvent[] {
  if (!fs.existsSync(filePath)) return [];
  const lines = fs
    .readFileSync(filePath, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  return lines.map((line) => SloEventSchema.parse(JSON.parse(line)));
}

function latestBySource(events: SloEvent[], source: "ci" | "prod"): SloEvent | null {
  const filtered = events.filter((event) => event.source === source);
  if (filtered.length === 0) return null;
  const sorted = filtered.sort((a, b) => a.ts.localeCompare(b.ts));
  return sorted[sorted.length - 1] ?? null;
}

function deriveBreakerState(lastProd: SloEvent | null): "CLOSED" | "OPEN" | "HALF_OPEN" {
  const openRate = lastProd?.metrics.breaker_open_rate ?? 0;
  if (openRate >= 0.05) return "OPEN";
  if (openRate > 0) return "HALF_OPEN";
  return "CLOSED";
}

function rollingRetryAmplification(events: SloEvent[]): number {
  if (events.length === 0) return 0;
  const recent = events.sort((a, b) => a.ts.localeCompare(b.ts)).slice(-10);
  const sum = recent.reduce((acc, event) => acc + (event.metrics.retry_amplification ?? 0), 0);
  return Number((sum / recent.length).toFixed(6));
}

function readThresholds(raw: NodeJS.ProcessEnv): typeof DefaultThresholds {
  const num = (key: string, fallback: number): number => {
    const value = raw[key];
    if (value == null || value.trim() === "") return fallback;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return parsed;
  };

  return {
    p95InflationRatioCap: num("POLICY_GUARDRAIL_P95_INFLATION_RATIO_CAP", DefaultThresholds.p95InflationRatioCap),
    p99InflationRatioCap: num("POLICY_GUARDRAIL_P99_INFLATION_RATIO_CAP", DefaultThresholds.p99InflationRatioCap),
    errorRateIncreasePctPointsCap: num(
      "POLICY_GUARDRAIL_ERROR_RATE_INCREASE_PP_CAP",
      DefaultThresholds.errorRateIncreasePctPointsCap
    ),
    timeoutIncreasePctPointsCap: num(
      "POLICY_GUARDRAIL_TIMEOUT_INCREASE_PP_CAP",
      DefaultThresholds.timeoutIncreasePctPointsCap
    ),
    breakerOpenRateIncreasePctPointsCap: num(
      "POLICY_GUARDRAIL_BREAKER_OPEN_INCREASE_PP_CAP",
      DefaultThresholds.breakerOpenRateIncreasePctPointsCap
    ),
    retryAmplificationIncreaseCap: num(
      "POLICY_GUARDRAIL_RETRY_AMP_INCREASE_CAP",
      DefaultThresholds.retryAmplificationIncreaseCap
    )
  };
}

function resolvePathFromEnv(raw: NodeJS.ProcessEnv, key: string, fallback: string): string {
  return path.resolve(process.cwd(), raw[key] ?? fallback);
}

export function readAndBuildGovernanceSnapshot(rawEnv: NodeJS.ProcessEnv = process.env): PolicyGovernanceSnapshot {
  const defaultsPath = resolvePathFromEnv(rawEnv, "POLICY_RUNTIME_DEFAULTS_PATH", "packages/policy-sdk/src/defaults/runtime.defaults.json");
  const registryPath = resolvePathFromEnv(rawEnv, "POLICY_BASELINE_REGISTRY_PATH", "ops/load_runs/baselines/registry.json");
  const sloEventsPath = resolvePathFromEnv(rawEnv, "SLO_EVENTS_JSONL_PATH", "ops/slo/loadrun_events.jsonl");

  const defaults = readJsonFile(defaultsPath) as Record<string, unknown>;
  const registry = BaselineRegistrySchema.parse(readJsonFile(registryPath));
  const events = readSloEvents(sloEventsPath);

  const lastCi = latestBySource(events, "ci");
  const lastProd = latestBySource(events, "prod");
  const lastEventTs =
    events.length > 0
      ? (() => {
          const sorted = [...events].sort((a, b) => a.ts.localeCompare(b.ts));
          return sorted[sorted.length - 1]?.ts ?? null;
        })()
      : null;

  const sink = (rawEnv.SLO_SINK === "postgres" ? "postgres" : "file") as "file" | "postgres";
  const sinkStatus =
    sink === "postgres"
      ? {
          sink,
          healthy: Boolean(rawEnv.SLO_POSTGRES_URL && rawEnv.SLO_POSTGRES_URL.trim()),
          detail: rawEnv.SLO_POSTGRES_URL ? "postgres_configured" : "missing_SLO_POSTGRES_URL"
        }
      : {
          sink,
          healthy: fs.existsSync(sloEventsPath),
          detail: fs.existsSync(sloEventsPath) ? "file_ready" : "events_file_missing"
        };

  const thresholds = readThresholds(rawEnv);
  const guardrailHash = sha256Hex(canonicalJson(thresholds));
  const defaultsHash = sha256Hex(canonicalJson(defaults));
  const defaultsVersion = rawEnv.POLICY_DEFAULTS_VERSION?.trim() || `runtime-defaults@${defaultsHash.slice(0, 12)}`;

  const snapshot: PolicyGovernanceSnapshot = {
    runtime: {
      defaults_hash: defaultsHash,
      defaults_version: defaultsVersion,
      enforcement_mode: rawEnv.POLICY_ENFORCEMENT_MODE ?? "ENFORCE_READ_ONLY",
      breaker: {
        state: deriveBreakerState(lastProd),
        window_ms: Number(defaults.POLICY_BREAKER_RESET_AFTER_MS ?? 15_000),
        open_threshold: Number(defaults.POLICY_BREAKER_FAILURE_THRESHOLD ?? 5),
        half_open_cooldown_ms: Number(defaults.POLICY_BREAKER_RESET_AFTER_MS ?? 15_000)
      },
      retry: {
        max_attempts: Number(defaults.POLICY_RETRY_MAX ?? 2),
        backoff_strategy: "exponential",
        base_delay_ms: Number(defaults.POLICY_RETRY_BASE_DELAY_MS ?? 80),
        jitter_pct: 0.25,
        rolling_amplification_estimate: rollingRetryAmplification(events)
      }
    },
    baseline: {
      current_baseline_hash: registry.baseline_hash,
      accepted_at: registry.accepted_at,
      accepted_by: registry.accepted_by
    },
    slo: {
      last_ci_verdict: lastCi
        ? {
            event_id: lastCi.event_id,
            passed: lastCi.verdict.passed,
            ts: lastCi.ts,
            reasons: lastCi.verdict.reasons
          }
        : null,
      last_prod_verdict: lastProd
        ? {
            event_id: lastProd.event_id,
            passed: lastProd.verdict.passed,
            ts: lastProd.ts,
            reasons: lastProd.verdict.reasons
          }
        : null,
      last_event_ts: lastEventTs,
      sink_status: sinkStatus
    },
    guardrails: {
      thresholds,
      guardrail_hash: guardrailHash
    },
    governance_fingerprint: fingerprintFromParts([defaultsHash, registry.baseline_hash, guardrailHash])
  };

  return PolicyGovernanceSnapshotSchema.parse(snapshot);
}

type SnapshotCache = {
  cachedAtMs: number;
  value: PolicyGovernanceSnapshot;
};

let snapshotCache: SnapshotCache | null = null;

export function readGovernanceSnapshotCached(rawEnv: NodeJS.ProcessEnv = process.env, nowMs = Date.now()): PolicyGovernanceSnapshot {
  const ttlMs = Number(rawEnv.POLICY_INTROSPECTION_CACHE_TTL_MS ?? "10000");
  if (snapshotCache && nowMs - snapshotCache.cachedAtMs <= ttlMs) {
    return snapshotCache.value;
  }
  const next = readAndBuildGovernanceSnapshot(rawEnv);
  snapshotCache = { cachedAtMs: nowMs, value: next };
  return next;
}

export function resetGovernanceSnapshotCacheForTests(): void {
  snapshotCache = null;
}
