import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { acceptBaseline } from "../src/loadrun/acceptBaseline";

describe("accept baseline approval gate", () => {
  afterEach(() => {
    delete process.env.POLICY_GOVERNANCE_FREEZE;
  });

  it("requires approve flag", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "accept-baseline-"));
    const reportPath = path.join(tmp, "report.json");
    const runPath = path.join(tmp, "run.json");
    fs.writeFileSync(
      runPath,
      JSON.stringify(
        {
          config: {
            target_base_url: "http://127.0.0.1:8080",
            precheck_path: "/healthz",
            read_path: "/v1/policies/resolve",
            mutate_path: "/v1/policies/resolve",
            concurrency: 1,
            total: 1,
            mutate_ratio: 0.2,
            seed: 1,
            timeout_sec: 1
          },
          preflight: { ok: true, status: 200, url: "http://127.0.0.1:8080/healthz" },
          counts: {
            success: 1,
            fail_status: 0,
            transport_failures: 0,
            status: { "200": 1 },
            error_codes: {},
            blocked_mutate: {},
            transport_failure_types: {},
            transport_failure_samples: []
          },
          latency_ms: { mean: 1, p50: 1, p95: 1, p99: 1 },
          breaker_states: {},
          retry_count_distribution: {},
          cache_states: {}
        },
        null,
        2
      )
    );
    fs.writeFileSync(reportPath, JSON.stringify({ baseline_file: runPath }, null, 2));

    expect(() =>
      acceptBaseline({
        reportPath,
        baselinesDir: path.join(tmp, "baselines"),
        registryPath: path.join(tmp, "baselines", "registry.json"),
        targetId: "prod/us-west/policy",
        by: "andre",
        note: "note",
        approved: false,
        reason: "reason"
      })
    ).toThrow("Approval required");
  });

  it("blocks while governance freeze is active", () => {
    process.env.POLICY_GOVERNANCE_FREEZE = "true";
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "accept-baseline-freeze-"));
    const reportPath = path.join(tmp, "report.json");
    const runPath = path.join(tmp, "run.json");
    fs.writeFileSync(
      runPath,
      JSON.stringify(
        {
          config: {
            target_base_url: "http://127.0.0.1:8080",
            precheck_path: "/healthz",
            read_path: "/v1/policies/resolve",
            mutate_path: "/v1/policies/resolve",
            concurrency: 1,
            total: 1,
            mutate_ratio: 0.2,
            seed: 1,
            timeout_sec: 1
          },
          preflight: { ok: true, status: 200, url: "http://127.0.0.1:8080/healthz" },
          counts: {
            success: 1,
            fail_status: 0,
            transport_failures: 0,
            status: { "200": 1 },
            error_codes: {},
            blocked_mutate: {},
            transport_failure_types: {},
            transport_failure_samples: []
          },
          latency_ms: { mean: 1, p50: 1, p95: 1, p99: 1 },
          breaker_states: {},
          retry_count_distribution: {},
          cache_states: {}
        },
        null,
        2
      )
    );
    fs.writeFileSync(reportPath, JSON.stringify({ baseline_file: runPath }, null, 2));

    expect(() =>
      acceptBaseline({
        reportPath,
        baselinesDir: path.join(tmp, "baselines"),
        registryPath: path.join(tmp, "baselines", "registry.json"),
        targetId: "prod/us-west/policy",
        by: "andre",
        note: "note",
        approved: true,
        reason: "reason"
      })
    ).toThrow("GOVERNANCE_FREEZE_ACTIVE");
  });
});
