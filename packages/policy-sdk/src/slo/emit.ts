import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import type { BaselineRegistryEntry } from "../loadrun/baselineRegistry";
import type { CiGateResult } from "../loadrun/ciGate";
import { emitLoadRunSloEventToFile } from "./sinks/file";
import { emitLoadRunSloEventToPostgres } from "./sinks/postgres";
import { parseLoadRunSloEvent, type LoadRunSloEvent } from "./schema";

export type SloSink = "file" | "postgres";

function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

function fileHash(filePath: string): string {
  return sha256Hex(fs.readFileSync(filePath, "utf8"));
}

function ratio(candidate: number, baseline: number): number {
  if (baseline <= 0) return 1;
  return candidate / baseline;
}

function rate(value: number, total: number): number {
  if (total <= 0) return 0;
  return value / total;
}

function throughputRps(args: { meanLatencyMs: number; concurrency: number }): number {
  if (args.meanLatencyMs <= 0) return 0;
  return (args.concurrency * 1000) / args.meanLatencyMs;
}

export function buildLoadRunSloEvent(args: {
  ts?: string;
  source: "ci" | "prod";
  service: string;
  targetId: string;
  baselinePath: string;
  candidatePath: string;
  gate: CiGateResult;
  baselineConcurrency: number;
  candidateConcurrency: number;
  baselineRegistryEntry?: BaselineRegistryEntry | null;
  tags?: string[];
}): LoadRunSloEvent {
  const ts = args.ts ?? new Date().toISOString();
  const baselineHash = args.baselineRegistryEntry?.baseline_hash || fileHash(args.baselinePath);
  const candidateHash = fileHash(args.candidatePath);

  const b = args.gate.baseline;
  const c = args.gate.candidate;

  const event: LoadRunSloEvent = {
    event_id: sha256Hex(`${ts}|${candidateHash}|${baselineHash}`),
    ts,
    source: args.source,
    service: args.service,
    target_id: args.targetId,
    baseline: {
      path: path.relative(process.cwd(), args.baselinePath),
      hash: baselineHash,
      accepted_at: args.baselineRegistryEntry?.accepted_at
    },
    candidate: {
      path: path.relative(process.cwd(), args.candidatePath),
      hash: candidateHash
    },
    verdict: {
      passed: args.gate.passed,
      reasons: args.gate.checks.filter((check) => !check.passed).map((check) => `${check.name}: ${check.details}`)
    },
    metrics: {
      latency: {
        p50: c.latencyMs.p50,
        p95: c.latencyMs.p95,
        p99: c.latencyMs.p99,
        max: c.latencyMs.p99
      },
      throughput_rps: Number(
        throughputRps({
          meanLatencyMs: c.latencyMs.mean,
          concurrency: args.candidateConcurrency
        }).toFixed(6)
      ),
      error_rate_total: c.failRate,
      error_rate_4xx: rate(c.status4xx, c.totalRequests),
      error_rate_5xx: rate(c.status5xx, c.totalRequests),
      error_rate_timeout: rate(c.timeoutErrors, c.totalRequests),
      breaker_open_rate: c.breakerOpenRate,
      retry_amplification: c.retryAmplification
    },
    deltas: {
      latency_p50_ratio: ratio(c.latencyMs.p50, b.latencyMs.p50),
      latency_p95_ratio: ratio(c.latencyMs.p95, b.latencyMs.p95),
      latency_p99_ratio: ratio(c.latencyMs.p99, b.latencyMs.p99),
      latency_max_ratio: ratio(c.latencyMs.p99, b.latencyMs.p99),
      throughput_rps_delta: Number(
        (
          throughputRps({ meanLatencyMs: c.latencyMs.mean, concurrency: args.candidateConcurrency }) -
          throughputRps({ meanLatencyMs: b.latencyMs.mean, concurrency: args.baselineConcurrency })
        ).toFixed(6)
      ),
      error_rate_total_delta: c.failRate - b.failRate,
      error_rate_4xx_delta: rate(c.status4xx, c.totalRequests) - rate(b.status4xx, b.totalRequests),
      error_rate_5xx_delta: rate(c.status5xx, c.totalRequests) - rate(b.status5xx, b.totalRequests),
      error_rate_timeout_delta: rate(c.timeoutErrors, c.totalRequests) - rate(b.timeoutErrors, b.totalRequests),
      breaker_open_rate_delta: c.breakerOpenRate - b.breakerOpenRate,
      retry_amplification_delta: c.retryAmplification - b.retryAmplification
    },
    tags: args.tags ?? []
  };

  return parseLoadRunSloEvent(event);
}

export async function emitLoadRunSloEvent(args: {
  event: LoadRunSloEvent;
  sink: SloSink;
  jsonlPath: string;
  archiveDir: string;
  postgresUrl?: string;
}): Promise<void> {
  if (args.sink === "file") {
    emitLoadRunSloEventToFile({ event: args.event, jsonlPath: args.jsonlPath, archiveDir: args.archiveDir });
    return;
  }

  if (!args.postgresUrl || !args.postgresUrl.trim()) {
    throw new Error("SLO_SINK=postgres requires SLO_POSTGRES_URL");
  }

  await emitLoadRunSloEventToPostgres({ event: args.event, postgresUrl: args.postgresUrl });
}

export async function emitOperationalSloEvent(args: {
  source: "ci" | "prod";
  service: string;
  targetId: string;
  tags: string[];
  reason?: string;
  sink: SloSink;
  jsonlPath: string;
  archiveDir: string;
  postgresUrl?: string;
}): Promise<LoadRunSloEvent> {
  const ts = new Date().toISOString();
  const reason = args.reason ?? "operational_event";
  const event = parseLoadRunSloEvent({
    event_id: sha256Hex(`${ts}|${args.targetId}|${reason}|${args.tags.join(",")}`),
    ts,
    source: args.source,
    service: args.service,
    target_id: args.targetId,
    baseline: { path: "n/a", hash: "n/a" },
    candidate: { path: "n/a", hash: "n/a" },
    verdict: { passed: true, reasons: [reason] },
    metrics: {
      latency: { p50: 0, p95: 0, p99: 0, max: 0 },
      throughput_rps: 0,
      error_rate_total: 0,
      error_rate_4xx: 0,
      error_rate_5xx: 0,
      error_rate_timeout: 0,
      breaker_open_rate: 0,
      retry_amplification: 0
    },
    deltas: {
      latency_p50_ratio: 1,
      latency_p95_ratio: 1,
      latency_p99_ratio: 1,
      latency_max_ratio: 1,
      throughput_rps_delta: 0,
      error_rate_total_delta: 0,
      error_rate_4xx_delta: 0,
      error_rate_5xx_delta: 0,
      error_rate_timeout_delta: 0,
      breaker_open_rate_delta: 0,
      retry_amplification_delta: 0
    },
    tags: args.tags
  });
  await emitLoadRunSloEvent({
    event,
    sink: args.sink,
    jsonlPath: args.jsonlPath,
    archiveDir: args.archiveDir,
    postgresUrl: args.postgresUrl
  });
  return event;
}
