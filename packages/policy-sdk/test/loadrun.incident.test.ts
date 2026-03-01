import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { buildIncidentBundle, writeIncidentBundle } from "../src/loadrun/incident";

describe("incident bundle", () => {
  it("writes deterministic bundle with recent slo tail", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "incident-"));
    const sloPath = path.join(dir, "events.jsonl");
    fs.writeFileSync(
      sloPath,
      [
        JSON.stringify({
          event_id: "e1",
          ts: "2026-03-01T00:00:00.000Z",
          source: "prod",
          service: "policy",
          target_id: "prod/us-west/policy",
          baseline: { path: "a", hash: "h1" },
          candidate: { path: "b", hash: "h2" },
          verdict: { passed: false, reasons: ["p95"] },
          metrics: {
            latency: { p50: 1, p95: 2, p99: 3, max: 3 },
            throughput_rps: 1,
            error_rate_total: 0.1,
            error_rate_4xx: 0,
            error_rate_5xx: 0.1,
            error_rate_timeout: 0,
            breaker_open_rate: 0.2,
            retry_amplification: 0.5
          },
          deltas: {
            latency_p50_ratio: 1,
            latency_p95_ratio: 2,
            latency_p99_ratio: 3,
            latency_max_ratio: 3,
            throughput_rps_delta: -1,
            error_rate_total_delta: 0.1,
            error_rate_4xx_delta: 0,
            error_rate_5xx_delta: 0.1,
            error_rate_timeout_delta: 0,
            breaker_open_rate_delta: 0.2,
            retry_amplification_delta: 0.5
          },
          tags: ["5xx_spike"]
        })
      ].join("\n"),
      "utf8"
    );

    const bundle = buildIncidentBundle({
      targetId: "prod/us-west/policy",
      severity: "CRITICAL",
      summary: "prod drift gate failed",
      baseline: {
        baseline_report_path: "r.json",
        baseline_hash: "base-hash",
        baseline_run_path: "b.json",
        accepted_at: "2026-03-01T00:00:00.000Z",
        accepted_by: "andre",
        notes: "ok",
        chaos_report_path: ""
      },
      guardrailsHash: "guard-hash",
      governanceFingerprint: "gov-fp",
      defaultsHash: "defaults-hash",
      triageTags: ["5xx_spike"],
      recommendationTags: ["rollback defaults env block"],
      retryAmplification: 0.5,
      breakerOpenRate: 0.2,
      sloEventsPath: sloPath
    });
    const out = writeIncidentBundle({ incidentDir: path.join(dir, "incidents"), bundle });
    expect(fs.existsSync(out)).toBe(true);
    const saved = JSON.parse(fs.readFileSync(out, "utf8")) as { severity: string; last_slo_events: unknown[] };
    expect(saved.severity).toBe("CRITICAL");
    expect(saved.last_slo_events.length).toBe(1);
  });
});
