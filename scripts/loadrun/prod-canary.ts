import fs from "node:fs";
import path from "node:path";

import { resolveProdCanaryProfile } from "../../packages/policy-sdk/src/loadrun/prodProfiles";
import { parseLoadRun } from "../../packages/policy-sdk/src/loadrun/schema";

type CliArgs = {
  out: string;
  targetBaseUrl: string;
  total: number;
  concurrency: number;
  mutateRatio: number;
  timeoutSec: number;
  seed: number;
  maxRps: number;
  maxDurationSec: number;
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

  const defaults = resolveProdCanaryProfile();
  const targetBaseUrl = args.get("target") ?? process.env.POLICY_BASE_URL ?? "";
  if (!targetBaseUrl) {
    throw new Error("Missing --target or POLICY_BASE_URL");
  }

  return {
    out: args.get("out") ?? `ops/load_runs/prod/${new Date().toISOString().replace(/[:.]/g, "-")}__prod-canary.json`,
    targetBaseUrl,
    total: Number(args.get("total") ?? String(defaults.total)),
    concurrency: Number(args.get("concurrency") ?? String(defaults.concurrency)),
    mutateRatio: Number(args.get("mutateRatio") ?? String(defaults.mutateRatio)),
    timeoutSec: Number(args.get("timeoutSec") ?? String(defaults.timeoutSec)),
    seed: Number(args.get("seed") ?? "1337"),
    maxRps: Number(args.get("maxRps") ?? String(defaults.maxRps)),
    maxDurationSec: Number(args.get("maxDurationSec") ?? String(defaults.maxDurationSec)),
    precheckPath: args.get("precheckPath") ?? "/healthz",
    readPath: args.get("readPath") ?? "/v1/policies/resolve",
    mutatePath: args.get("mutatePath") ?? "/v1/policies/resolve",
    authToken: args.get("authToken") ?? process.env.POLICY_AUTH_TOKEN
  };
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

function buildUuidPool(count: number, start: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < count; i += 1) {
    out.push(`00000000-0000-4000-8000-${String(start + i).padStart(12, "0")}`);
  }
  return out;
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round((p / 100) * (sorted.length - 1))));
  return sorted[idx];
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchWithTimeout(url: string, init: RequestInit, timeoutSec: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutSec * 1000);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function runPreflight(args: { url: string; headers: Record<string, string>; timeoutSec: number }): Promise<number> {
  const maxAttempts = 3;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const preflight = await fetchWithTimeout(args.url, { method: "GET", headers: args.headers }, args.timeoutSec);
      return preflight.status;
    } catch (error) {
      if (attempt === maxAttempts - 1) {
        throw error;
      }
      await sleep(250 * Math.pow(2, attempt));
    }
  }
  return 0;
}

async function main(): Promise<void> {
  const cfg = parseArgs(process.argv);
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
    preflightStatus = await runPreflight({ url: preflightUrl, headers: headersBase, timeoutSec: cfg.timeoutSec });
  } catch (error) {
    throw new Error(`preflight_failed: ${String(error)}`);
  }

  const statusCounts: Record<string, number> = {};
  const errorCodes: Record<string, number> = {};
  const blockedMutate: Record<string, number> = {};
  const transportFailureTypes: Record<string, number> = {};
  const transportFailureSamples: Array<Record<string, string>> = [];
  const badRequestSamples: Array<Record<string, unknown>> = [];
  const latencies: number[] = [];

  const runStarted = Date.now();
  const minPerRequestMs = cfg.maxRps > 0 ? Math.ceil((cfg.concurrency * 1000) / cfg.maxRps) : 0;

  let success = 0;
  let failStatus = 0;
  let transportFailures = 0;
  let index = 0;

  const workers = new Array(cfg.concurrency).fill(0).map(async () => {
    while (true) {
      const i = index;
      index += 1;
      if (i >= cfg.total) return;
      if (Date.now() - runStarted > cfg.maxDurationSec * 1000) return;

      const mode = rng.next() < cfg.mutateRatio ? "MUTATE" : "READ";
      const query = new URLSearchParams({
        policyKey: "performance_limits",
        clientId: clientIds[i % clientIds.length],
        campaignId: campaignIds[i % campaignIds.length],
        role: "sebastian"
      });
      const route = mode === "MUTATE" ? cfg.mutatePath : cfg.readPath;
      const url = `${cfg.targetBaseUrl.replace(/\/+$/, "")}${route}?${query.toString()}`;
      const started = Date.now();

      try {
        const res = await fetchWithTimeout(
          url,
          {
            method: "GET",
            headers: {
              ...headersBase,
              "x-correlation-id": `prod-canary-${cfg.seed}-${i}`,
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
      } catch (error) {
        transportFailures += 1;
        const type = error instanceof Error ? error.name : "UnknownError";
        transportFailureTypes[type] = (transportFailureTypes[type] ?? 0) + 1;
        if (transportFailureSamples.length < 5) {
          transportFailureSamples.push({
            type,
            message: error instanceof Error ? error.message : String(error),
            mode,
            url
          });
        }
      }

      if (minPerRequestMs > 0) {
        await sleep(minPerRequestMs);
      }
    }
  });

  await Promise.all(workers);

  const observedTotal = success + failStatus + transportFailures;
  const mean = latencies.length ? latencies.reduce((sum, value) => sum + value, 0) / latencies.length : 0;
  const run = parseLoadRun({
    config: {
      target_base_url: cfg.targetBaseUrl,
      precheck_path: cfg.precheckPath,
      read_path: cfg.readPath,
      mutate_path: cfg.mutatePath,
      concurrency: cfg.concurrency,
      total: observedTotal,
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

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
