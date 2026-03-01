import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { emitLoadRunSloEventToFile } from "../src/slo/sinks/file";
import type { LoadRunSloEvent } from "../src/slo/schema";

const event: LoadRunSloEvent = {
  event_id: "abc",
  ts: "2026-03-01T00:00:00.000Z",
  source: "ci",
  service: "policy",
  target_id: "prod/us-west/policy",
  baseline: { path: "a", hash: "h1", accepted_at: "2026-03-01T00:00:00.000Z" },
  candidate: { path: "c", hash: "h2" },
  verdict: { passed: true, reasons: [] },
  metrics: {
    latency: { p50: 1, p95: 2, p99: 3, max: 3 },
    throughput_rps: 1,
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
  tags: []
};

describe("slo file sink", () => {
  it("appends event to main and daily archive logs", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "slo-test-"));
    const mainPath = path.join(dir, "loadrun_events.jsonl");
    const archiveDir = path.join(dir, "archive");

    emitLoadRunSloEventToFile({ event, jsonlPath: mainPath, archiveDir });

    const mainLines = fs.readFileSync(mainPath, "utf8").trim().split("\n");
    const archivePath = path.join(archiveDir, "2026-03-01.loadrun_events.jsonl");
    const archiveLines = fs.readFileSync(archivePath, "utf8").trim().split("\n");

    expect(mainLines).toHaveLength(1);
    expect(archiveLines).toHaveLength(1);
  });
});
