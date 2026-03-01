import fs from "node:fs";
import path from "node:path";

import { z } from "zod";

import { canonicalJson, fingerprintFromParts, sha256Hex } from "./hash";
import { loadContractsAndSignature, loadContractsKeyring, verifySloContractsSignature } from "../../../../../policy-sdk/src/contracts/sloContracts";
import { verifyAuditLedger } from "../../../../../policy-sdk/src/audit/ledger";

const DefaultThresholds = {
  p95InflationRatioCap: 1.25,
  p99InflationRatioCap: 1.5,
  errorRateIncreasePctPointsCap: 0.25,
  timeoutIncreasePctPointsCap: 0.1,
  breakerOpenRateIncreasePctPointsCap: 2,
  retryAmplificationIncreaseCap: 0.15
};

const BaselineRegistryEntrySchema = z.object({
  baseline_report_path: z.string(),
  baseline_hash: z.string(),
  baseline_run_path: z.string(),
  accepted_at: z.string(),
  accepted_by: z.string(),
  notes: z.string(),
  chaos_report_path: z.string().optional().default("")
});
const BaselineRegistrySchemaV2 = z.object({
  version: z.literal(2).default(2),
  targets: z.record(z.string(), BaselineRegistryEntrySchema)
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
    freeze_mode: z.boolean(),
    kill_switch_active: z.boolean(),
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
    }),
    blast_radius_violation: z.boolean()
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
  budget: z.object({
    daily_remaining: z.number().int().nonnegative(),
    monthly_remaining: z.number().int().nonnegative(),
    canary_observe_runs_remaining: z.number().int().nonnegative()
  }),
  blast_radius: z.object({
    max_concurrency_cap: z.number().int().positive(),
    canary_cap_pct: z.number().int().positive(),
    max_retry_amplification_runtime: z.number().nonnegative()
  }),
  integrity_score: z.number().int().min(0).max(100).nullable(),
  integrity_flags: z.array(z.string()),
  last_self_check_ts: z.string().nullable(),
  last_self_check_passed: z.boolean().nullable(),
  last_self_check_event_id: z.string().nullable(),
  auto_block_active: z.boolean(),
  auto_freeze_recommended: z.boolean(),
  contracts_version: z.string().nullable(),
  contracts_signature_status: z.object({
    ok: z.boolean(),
    reason: z.string(),
    kid: z.string().nullable()
  }),
  ledger_head_hash: z.string().nullable(),
  ledger_verified_recently: z.string().nullable(),
  keyring_kids: z.array(z.string()),
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

function readBudgetState(rawEnv: NodeJS.ProcessEnv): {
  daily_requests_used: number;
  monthly_requests_used: number;
  canary_observe_runs_daily: number;
} {
  const file = resolvePathFromEnv(rawEnv, "POLICY_BUDGET_STATE_PATH", "ops/incidents/budget_state.json");
  if (!fs.existsSync(file)) {
    return { daily_requests_used: 0, monthly_requests_used: 0, canary_observe_runs_daily: 0 };
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as {
      daily_requests_used?: number;
      monthly_requests_used?: number;
      canary_observe_runs_daily?: number;
    };
    return {
      daily_requests_used: Number(parsed.daily_requests_used ?? 0),
      monthly_requests_used: Number(parsed.monthly_requests_used ?? 0),
      canary_observe_runs_daily: Number(parsed.canary_observe_runs_daily ?? 0)
    };
  } catch {
    return { daily_requests_used: 0, monthly_requests_used: 0, canary_observe_runs_daily: 0 };
  }
}

function resolvePathFromEnv(raw: NodeJS.ProcessEnv, key: string, fallback: string): string {
  return path.resolve(process.cwd(), raw[key] ?? fallback);
}

function readControlFile(rawEnv: NodeJS.ProcessEnv): { freeze?: boolean; runtime_kill_switch?: boolean } {
  const controlsPath = resolvePathFromEnv(rawEnv, "POLICY_CONTROLS_PATH", "ops/incidents/controls.json");
  if (!fs.existsSync(controlsPath)) return {};
  try {
    return JSON.parse(fs.readFileSync(controlsPath, "utf8")) as { freeze?: boolean; runtime_kill_switch?: boolean };
  } catch {
    return {};
  }
}

function readIntegrityStatus(rawEnv: NodeJS.ProcessEnv): {
  integrity_score: number | null;
  integrity_flags: string[];
  last_self_check_ts: string | null;
  last_self_check_passed: boolean | null;
  last_self_check_event_id: string | null;
  auto_block_active: boolean;
  auto_freeze_recommended: boolean;
} {
  const filePath = resolvePathFromEnv(
    rawEnv,
    "POLICY_GOVERNANCE_INTEGRITY_STATUS_PATH",
    "ops/incidents/governance_integrity_status.json"
  );
  if (!fs.existsSync(filePath)) {
    return {
      integrity_score: null,
      integrity_flags: [],
      last_self_check_ts: null,
      last_self_check_passed: null,
      last_self_check_event_id: null,
      auto_block_active: false,
      auto_freeze_recommended: false
    };
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as {
      integrity_score?: number;
      flags?: string[];
      ts?: string;
      passed?: boolean;
      last_self_check_event_id?: string;
      auto_block_active?: boolean;
      auto_freeze_recommended?: boolean;
    };
    return {
      integrity_score: Number.isFinite(parsed.integrity_score) ? Number(parsed.integrity_score) : null,
      integrity_flags: Array.isArray(parsed.flags) ? parsed.flags.map((x) => String(x)) : [],
      last_self_check_ts: typeof parsed.ts === "string" ? parsed.ts : null,
      last_self_check_passed: typeof parsed.passed === "boolean" ? parsed.passed : null,
      last_self_check_event_id: typeof parsed.last_self_check_event_id === "string" ? parsed.last_self_check_event_id : null,
      auto_block_active: parsed.auto_block_active === true,
      auto_freeze_recommended: parsed.auto_freeze_recommended === true
    };
  } catch {
    return {
      integrity_score: null,
      integrity_flags: [],
      last_self_check_ts: null,
      last_self_check_passed: null,
      last_self_check_event_id: null,
      auto_block_active: false,
      auto_freeze_recommended: false
    };
  }
}

function readContractsStatus(rawEnv: NodeJS.ProcessEnv): {
  contractsVersion: string | null;
  contractsSignatureStatus: { ok: boolean; reason: string; kid: string | null };
  keyringKids: string[];
} {
  const contractsPath = resolvePathFromEnv(rawEnv, "POLICY_SLO_CONTRACTS_PATH", "ops/contracts/slo_contracts.json");
  const signaturePath = resolvePathFromEnv(rawEnv, "POLICY_SLO_CONTRACTS_SIGNATURE_PATH", "ops/contracts/slo_contracts.sig.json");
  const keyringPath = resolvePathFromEnv(rawEnv, "POLICY_AUDIT_KEYRING_PATH", "ops/keys/keyring.json");

  if (!fs.existsSync(contractsPath)) {
    return {
      contractsVersion: null,
      contractsSignatureStatus: { ok: false, reason: "contracts_missing", kid: null },
      keyringKids: []
    };
  }
  if (!fs.existsSync(signaturePath)) {
    return {
      contractsVersion: null,
      contractsSignatureStatus: { ok: false, reason: "signature_missing", kid: null },
      keyringKids: []
    };
  }
  if (!fs.existsSync(keyringPath)) {
    const { contracts } = loadContractsAndSignature({ contractsPath, signaturePath });
    return {
      contractsVersion: contracts.version,
      contractsSignatureStatus: { ok: false, reason: "keyring_missing", kid: null },
      keyringKids: []
    };
  }

  try {
    const { contracts, signed } = loadContractsAndSignature({ contractsPath, signaturePath });
    const keyring = loadContractsKeyring(keyringPath);
    const verifyResult = verifySloContractsSignature({ contracts, signed, keyring });
    return {
      contractsVersion: contracts.version,
      contractsSignatureStatus: {
        ok: verifyResult.ok,
        reason: verifyResult.reason ?? "verified",
        kid: signed.signature.kid
      },
      keyringKids: Object.keys(keyring.keys).sort()
    };
  } catch (error) {
    return {
      contractsVersion: null,
      contractsSignatureStatus: {
        ok: false,
        reason: `contracts_invalid:${error instanceof Error ? error.message : String(error)}`,
        kid: null
      },
      keyringKids: []
    };
  }
}

function readLedgerStatus(rawEnv: NodeJS.ProcessEnv): {
  ledgerHeadHash: string | null;
  ledgerVerifiedRecently: string | null;
} {
  const ledgerPath = resolvePathFromEnv(rawEnv, "POLICY_AUDIT_LEDGER_PATH", "ops/audit/ledger.jsonl");
  const keyringPath = resolvePathFromEnv(rawEnv, "POLICY_AUDIT_KEYRING_PATH", "ops/keys/keyring.json");
  if (!fs.existsSync(ledgerPath)) {
    return { ledgerHeadHash: null, ledgerVerifiedRecently: null };
  }
  const keyring = fs.existsSync(keyringPath) ? loadContractsKeyring(keyringPath) : undefined;
  const verify = verifyAuditLedger({
    ledgerPath,
    keyring,
    strictSignatures: false
  });
  return {
    ledgerHeadHash: verify.head_hash,
    ledgerVerifiedRecently: verify.verified_at
  };
}

function parseTargetId(rawTargetId: string): { env: string; service: string; full: string } {
  const cleaned = rawTargetId.trim();
  const parts = cleaned.split("/").filter(Boolean);
  if (parts.length === 2) return { env: parts[0]!, service: parts[1]!, full: cleaned };
  if (parts.length === 3) return { env: parts[0]!, service: parts[2]!, full: cleaned };
  throw new Error(`Invalid POLICY_GOVERNANCE_TARGET_ID=${rawTargetId}`);
}

function resolveBaselineForTarget(input: unknown, targetIdRaw: string): z.infer<typeof BaselineRegistryEntrySchema> {
  const parsedV2 = BaselineRegistrySchemaV2.safeParse(input);
  if (!parsedV2.success) {
    return BaselineRegistryEntrySchema.parse(input);
  }

  const target = parseTargetId(targetIdRaw);
  const exact = parsedV2.data.targets[target.full];
  if (exact) return exact;

  const envServiceFallback = parsedV2.data.targets[`${target.env}/${target.service}`];
  if (envServiceFallback) return envServiceFallback;

  throw new Error(`Missing baseline for governance target_id=${target.full}`);
}

export function readAndBuildGovernanceSnapshot(rawEnv: NodeJS.ProcessEnv = process.env): PolicyGovernanceSnapshot {
  const defaultsPath = resolvePathFromEnv(rawEnv, "POLICY_RUNTIME_DEFAULTS_PATH", "packages/policy-sdk/src/defaults/runtime.defaults.json");
  const registryPath = resolvePathFromEnv(rawEnv, "POLICY_BASELINE_REGISTRY_PATH", "ops/load_runs/baselines/registry.json");
  const sloEventsPath = resolvePathFromEnv(rawEnv, "SLO_EVENTS_JSONL_PATH", "ops/slo/loadrun_events.jsonl");
  const targetId = rawEnv.POLICY_GOVERNANCE_TARGET_ID ?? "prod/us-west/policy";
  const controls = readControlFile(rawEnv);
  const freezeMode = String(rawEnv.POLICY_GOVERNANCE_FREEZE ?? "").toLowerCase() === "true" || controls.freeze === true;
  const killSwitchActive =
    String(rawEnv.POLICY_RUNTIME_KILL_SWITCH ?? "").toLowerCase() === "true" || controls.runtime_kill_switch === true;

  const defaults = readJsonFile(defaultsPath) as Record<string, unknown>;
  const registry = resolveBaselineForTarget(readJsonFile(registryPath), targetId);
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
  const contractsStatus = readContractsStatus(rawEnv);
  const ledgerStatus = readLedgerStatus(rawEnv);
  const integrityStatus = readIntegrityStatus(rawEnv);
  const guardrailHash = sha256Hex(canonicalJson(thresholds));
  const defaultsHash = sha256Hex(canonicalJson(defaults));
  const defaultsVersion = rawEnv.POLICY_DEFAULTS_VERSION?.trim() || `runtime-defaults@${defaultsHash.slice(0, 12)}`;
  const budgetState = readBudgetState(rawEnv);
  const blastRadius = {
    max_concurrency_cap: Number(rawEnv.POLICY_BLAST_MAX_CONCURRENCY_PER_TARGET ?? 200),
    canary_cap_pct: Number(rawEnv.POLICY_CANARY_MAX_EXPOSURE_PCT ?? 50),
    max_retry_amplification_runtime: Number(rawEnv.POLICY_RETRY_AMP_GUARD_MAX ?? 1.4)
  };
  const rollingRetry = rollingRetryAmplification(events);
  const retryAmpGuardViolation = rollingRetry > blastRadius.max_retry_amplification_runtime;
  const breakerState = killSwitchActive || retryAmpGuardViolation ? "OPEN" : deriveBreakerState(lastProd);
  const budget = {
    daily_remaining: Math.max(0, Number(rawEnv.POLICY_LOAD_BUDGET_DAILY_MAX_REQUESTS ?? 200_000) - budgetState.daily_requests_used),
    monthly_remaining: Math.max(0, Number(rawEnv.POLICY_LOAD_BUDGET_MONTHLY_MAX_REQUESTS ?? 2_000_000) - budgetState.monthly_requests_used),
    canary_observe_runs_remaining: Math.max(
      0,
      Number(rawEnv.POLICY_CANARY_MAX_OBSERVE_RUNS_PER_DAY ?? 24) - budgetState.canary_observe_runs_daily
    )
  };

  const snapshot: PolicyGovernanceSnapshot = {
    runtime: {
      defaults_hash: defaultsHash,
      defaults_version: defaultsVersion,
      enforcement_mode: rawEnv.POLICY_ENFORCEMENT_MODE ?? "ENFORCE_READ_ONLY",
      freeze_mode: freezeMode,
      kill_switch_active: killSwitchActive,
      breaker: {
        state: breakerState,
        window_ms: Number(defaults.POLICY_BREAKER_RESET_AFTER_MS ?? 15_000),
        open_threshold: Number(defaults.POLICY_BREAKER_FAILURE_THRESHOLD ?? 5),
        half_open_cooldown_ms: Number(defaults.POLICY_BREAKER_RESET_AFTER_MS ?? 15_000)
      },
      retry: {
        max_attempts: Number(defaults.POLICY_RETRY_MAX ?? 2),
        backoff_strategy: "exponential",
        base_delay_ms: Number(defaults.POLICY_RETRY_BASE_DELAY_MS ?? 80),
        jitter_pct: 0.25,
        rolling_amplification_estimate: rollingRetry
      },
      blast_radius_violation: retryAmpGuardViolation
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
    budget,
    blast_radius: blastRadius,
    integrity_score: integrityStatus.integrity_score,
    integrity_flags: integrityStatus.integrity_flags,
    last_self_check_ts: integrityStatus.last_self_check_ts,
    last_self_check_passed: integrityStatus.last_self_check_passed,
    last_self_check_event_id: integrityStatus.last_self_check_event_id,
    auto_block_active: integrityStatus.auto_block_active,
    auto_freeze_recommended: integrityStatus.auto_freeze_recommended,
    contracts_version: contractsStatus.contractsVersion,
    contracts_signature_status: contractsStatus.contractsSignatureStatus,
    ledger_head_hash: ledgerStatus.ledgerHeadHash,
    ledger_verified_recently: ledgerStatus.ledgerVerifiedRecently,
    keyring_kids: contractsStatus.keyringKids,
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
