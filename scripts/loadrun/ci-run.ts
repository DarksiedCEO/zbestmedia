import fs from "node:fs";
import path from "node:path";

import { assertConcurrencyWithinCap, readBlastRadiusCaps } from "../../packages/policy-sdk/src/loadrun/blastRadius";
import { consumeBudget } from "../../packages/policy-sdk/src/loadrun/budget";
import { parseLoadRun } from "../../packages/policy-sdk/src/loadrun/schema";
import { parseTargetId } from "../../packages/policy-sdk/src/loadrun/target";
import { emitOperationalSloEvent } from "../../packages/policy-sdk/src/slo/emit";

type CliArgs = {
  out: string;
  targetBaseUrl: string;
  targetId: string;
  total: number;
  concurrency: number;
  mutateRatio: number;
  timeoutSec: number;
  seed: number;
  precheckPath: string;
  readPath: string;
  mutatePath: string;
  authToken?: string;
};

function parseArgs(argv: string[]): CliArgs {
  const args = new Map<string, string>();
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for --${key}`);
    }
    args.set(key, value);
    i += 1;
  }

  const targetBaseUrl = args.get("targetBaseUrl") ?? process.env.LOADRUN_TARGET_BASE_URL ?? "http://127.0.0.1:8080";
  const authToken = args.get("authToken") ?? process.env.LOADRUN_AUTH_TOKEN;
  const targetId = parseTargetId(args.get("targetId") ?? process.env.LOADRUN_TARGET_ID ?? "prod/us-west/policy");

  return {
    out: args.get("out") ?? `ops/load_runs/ci/${process.env.GITHUB_SHA ?? "local"}__candidate.json`,
    targetBaseUrl,
    targetId,
    total: Number(args.get("total") ?? "2000"),
    concurrency: Number(args.get("concurrency") ?? "50"),
    mutateRatio: Number(args.get("mutateRatio") ?? "0.2"),
    timeoutSec: Number(args.get("timeoutSec") ?? "2"),
    seed: Number(args.get("seed") ?? "1337"),
    precheckPath: args.get("precheckPath") ?? "/healthz",
    readPath: args.get("readPath") ?? "/v1/policies/resolve",
    mutatePath: args.get("mutatePath") ?? "/v1/policies/resolve",
    authToken
  };
}

function buildUuidPool(count: number, start: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < count; i += 1) {
    out.push(`00000000-0000-4000-8000-${String(start + i).padStart(12, "0")}`);
  }
  return out;
}

class LcgRandom {
  private state: number;
  public constructor(seed: number) {
    this.state = seed >>> 0;
  }
  public next(): number {
    this.state = (1664525 * this.state + 1013904223) >>> 0;
    return this.state / 0xffffffff;
  }
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round((p / 100) * (sorted.length - 1))));
  return sorted[idx];
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutSec: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutSec * 1000);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function main(): Promise<void> {
  const cfg = parseArgs(process.argv);
  const caps = readBlastRadiusCaps();
  assertConcurrencyWithinCap(cfg.concurrency, caps);
  const budget = consumeBudget({ kind: "ci_loadrun", requests: cfg.total });
  if (!budget.allowed) {
    await emitOperationalSloEvent({
      source: "ci",
      service: "policy",
      targetId: cfg.targetId,
      tags: ["budget_block", "severity:WARNING"],
      reason: budget.reason,
      sink: (process.env.SLO_SINK as "file" | "postgres" | undefined) ?? "file",
      jsonlPath: path.resolve(process.cwd(), process.env.SLO_EVENTS_JSONL_PATH ?? "ops/slo/loadrun_events.jsonl"),
      archiveDir: path.resolve(process.cwd(), process.env.SLO_ARCHIVE_DIR ?? "ops/slo/archive"),
      postgresUrl: process.env.SLO_POSTGRES_URL
    });
    throw new Error(`LOAD_BUDGET_BLOCKED: ${budget.reason}`);
  }
  const rng = new LcgRandom(cfg.seed);
  const clientIds = buildUuidPool(20, 1);
  const campaignIds = buildUuidPool(200, 10_001);
  const headersBase: Record<string, string> = {};
  if (cfg.authToken) {
    headersBase.authorization = `Bearer ${cfg.authToken}`;
  }

  const preflightUrl = `${cfg.targetBaseUrl.replace(/\/+$/, "")}${cfg.precheckPath}`;
  let preflightStatus = 0;
  try {
    const pre = await fetchWithTimeout(preflightUrl, { method: "GET", headers: headersBase }, cfg.timeoutSec);
    preflightStatus = pre.status;
  } catch (err) {
    throw new Error(`preflight_failed: ${String(err)}`);
  }

  const statusCounts: Record<string, number> = {};
  const errorCodes: Record<string, number> = {};
  const blockedMutate: Record<string, number> = {};
  const transportFailureTypes: Record<string, number> = {};
  const transportFailureSamples: Array<Record<string, string>> = [];
  const badRequestSamples: Array<Record<string, unknown>> = [];
  const latencies: number[] = [];
  let success = 0;
  let failStatus = 0;
  let transportFailures = 0;

  let index = 0;
  const workers = new Array(cfg.concurrency).fill(0).map(async () => {
    while (true) {
      const i = index;
      index += 1;
      if (i >= cfg.total) return;

      const mode = rng.next() < cfg.mutateRatio ? "MUTATE" : "READ";
      const query = new URLSearchParams({
        policyKey: "performance_limits",
        clientId: clientIds[i % clientIds.length],
        campaignId: campaignIds[i % campaignIds.length],
        role: "sebastian"
      });
      const p = mode === "MUTATE" ? cfg.mutatePath : cfg.readPath;
      const url = `${cfg.targetBaseUrl.replace(/\/+$/, "")}${p}?${query.toString()}`;
      const started = Date.now();
      try {
        const res = await fetchWithTimeout(
          url,
          {
            method: "GET",
            headers: {
              ...headersBase,
              "x-correlation-id": `ci-${cfg.seed}-${i}`,
              "x-policy-mode": mode
            }
          },
          cfg.timeoutSec
        );
        const elapsed = Date.now() - started;
        latencies.push(elapsed);
        statusCounts[String(res.status)] = (statusCounts[String(res.status)] ?? 0) + 1;
        const text = await res.text();
        let body: unknown = null;
        try {
          body = text ? JSON.parse(text) : null;
        } catch {
          body = null;
        }
        if (res.status >= 200 && res.status < 400) {
          success += 1;
        } else {
          failStatus += 1;
        }
        if (body && typeof body === "object") {
          const record = body as Record<string, unknown>;
          const error = record.error;
          const code =
            typeof error === "string"
              ? error
              : error && typeof error === "object"
                ? String((error as Record<string, unknown>).code ?? "")
                : typeof record.code === "string"
                  ? record.code
                  : "";
          if (code) {
            errorCodes[code] = (errorCodes[code] ?? 0) + 1;
            if (mode === "MUTATE" && ["POLICY_UNAVAILABLE_BLOCKED", "POLICY_RECEIPT_UNVERIFIED_BLOCKED", "CIRCUIT_OPEN"].includes(code)) {
              blockedMutate[code] = (blockedMutate[code] ?? 0) + 1;
            }
          }
          if (res.status === 400 && badRequestSamples.length < 3) {
            badRequestSamples.push({ url, code, body: record });
          }
        }
      } catch (err) {
        transportFailures += 1;
        const type = err instanceof Error ? err.name : "UnknownError";
        transportFailureTypes[type] = (transportFailureTypes[type] ?? 0) + 1;
        if (transportFailureSamples.length < 5) {
          transportFailureSamples.push({
            type,
            message: err instanceof Error ? err.message : String(err),
            mode,
            url
          });
        }
      }
    }
  });

  await Promise.all(workers);

  const mean = latencies.length ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0;
  const run = parseLoadRun({
    config: {
      target_base_url: cfg.targetBaseUrl,
      precheck_path: cfg.precheckPath,
      read_path: cfg.readPath,
      mutate_path: cfg.mutatePath,
      concurrency: cfg.concurrency,
      total: cfg.total,
      mutate_ratio: cfg.mutateRatio,
      seed: cfg.seed,
      timeout_sec: cfg.timeoutSec,
      policy_key: "performance_limits",
      role: "sebastian",
      client_pool_size: clientIds.length,
      campaign_pool_size: campaignIds.length
    },
    preflight: {
      ok: true,
      status: preflightStatus,
      url: preflightUrl
    },
    counts: {
      success,
      fail_status: failStatus,
      transport_failures: transportFailures,
      status: statusCounts,
      error_codes: errorCodes,
      blocked_mutate: blockedMutate,
      transport_failure_types: transportFailureTypes,
      transport_failure_samples: transportFailureSamples,
      bad_request_samples: badRequestSamples
    },
    latency_ms: {
      mean: Number(mean.toFixed(2)),
      p50: Number(percentile(latencies, 50).toFixed(2)),
      p95: Number(percentile(latencies, 95).toFixed(2)),
      p99: Number(percentile(latencies, 99).toFixed(2))
    },
    breaker_states: {},
    retry_count_distribution: {},
    cache_states: {}
  });

  const outPath = path.resolve(process.cwd(), cfg.out);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(run, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ output: outPath, success, failStatus, transportFailures }, null, 2));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
