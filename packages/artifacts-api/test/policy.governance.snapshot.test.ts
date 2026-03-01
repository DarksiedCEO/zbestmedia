import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  readAndBuildGovernanceSnapshot,
  readGovernanceSnapshotCached,
  resetGovernanceSnapshotCacheForTests
} from "../src/agency/policy/governance/snapshot";

function writeFixtureFiles(): { dir: string; defaultsPath: string; registryPath: string; eventsPath: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gov-snap-"));
  const defaultsPath = path.join(dir, "runtime.defaults.json");
  const registryPath = path.join(dir, "registry.json");
  const eventsPath = path.join(dir, "events.jsonl");

  fs.writeFileSync(
    defaultsPath,
    JSON.stringify(
      {
        POLICY_BREAKER_FAILURE_THRESHOLD: 5,
        POLICY_BREAKER_RESET_AFTER_MS: 15000,
        POLICY_RETRY_MAX: 2,
        POLICY_RETRY_BASE_DELAY_MS: 80,
        POLICY_RETRY_MAX_DELAY_MS: 400
      },
      null,
      2
    )
  );
  fs.writeFileSync(
    registryPath,
    JSON.stringify(
      {
        baseline_report_path: "ops/load_runs/reports/base.json",
        baseline_hash: "abc123",
        baseline_run_path: "ops/load_runs/baselines/base.json",
        accepted_at: "2026-03-01T00:00:00.000Z",
        accepted_by: "andre",
        notes: "ok",
        chaos_report_path: ""
      },
      null,
      2
    )
  );

  const lines = [
    {
      event_id: "e-ci-1",
      ts: "2026-03-01T01:00:00.000Z",
      source: "ci",
      verdict: { passed: true, reasons: [] },
      metrics: { retry_amplification: 0.02, breaker_open_rate: 0 },
      tags: []
    },
    {
      event_id: "e-prod-1",
      ts: "2026-03-01T02:00:00.000Z",
      source: "prod",
      verdict: { passed: false, reasons: ["p95"] },
      metrics: { retry_amplification: 0.2, breaker_open_rate: 0.07 },
      tags: ["breaker_open_spike"]
    }
  ];
  fs.writeFileSync(eventsPath, `${lines.map((line) => JSON.stringify(line)).join("\n")}\n`, "utf8");

  return { dir, defaultsPath, registryPath, eventsPath };
}

describe("policy governance snapshot", () => {
  it("builds deterministic snapshot from canonical sources", () => {
    const fx = writeFixtureFiles();
    const env = {
      POLICY_RUNTIME_DEFAULTS_PATH: fx.defaultsPath,
      POLICY_BASELINE_REGISTRY_PATH: fx.registryPath,
      SLO_EVENTS_JSONL_PATH: fx.eventsPath,
      POLICY_ENFORCEMENT_MODE: "ENFORCE_READ_ONLY"
    } as NodeJS.ProcessEnv;

    const snapshotA = readAndBuildGovernanceSnapshot(env);
    const snapshotB = readAndBuildGovernanceSnapshot(env);

    expect(snapshotA.governance_fingerprint).toBe(snapshotB.governance_fingerprint);
    expect(snapshotA.runtime.breaker.state).toBe("OPEN");
    expect(snapshotA.runtime.freeze_mode).toBe(false);
    expect(snapshotA.runtime.kill_switch_active).toBe(false);
    expect(snapshotA.slo.last_prod_verdict?.event_id).toBe("e-prod-1");
    expect(snapshotA.guardrails.thresholds.p95InflationRatioCap).toBe(1.25);
    expect(snapshotA.budget.daily_remaining).toBeGreaterThanOrEqual(0);
    expect(snapshotA.blast_radius.max_concurrency_cap).toBe(200);
    expect(snapshotA.contracts_signature_status).toBeTruthy();
    expect(Array.isArray(snapshotA.keyring_kids)).toBe(true);
  });

  it("reflects freeze and kill switch flags in runtime snapshot", () => {
    const fx = writeFixtureFiles();
    const env = {
      POLICY_RUNTIME_DEFAULTS_PATH: fx.defaultsPath,
      POLICY_BASELINE_REGISTRY_PATH: fx.registryPath,
      SLO_EVENTS_JSONL_PATH: fx.eventsPath,
      POLICY_GOVERNANCE_FREEZE: "true",
      POLICY_RUNTIME_KILL_SWITCH: "true"
    } as NodeJS.ProcessEnv;

    const snapshot = readAndBuildGovernanceSnapshot(env);
    expect(snapshot.runtime.freeze_mode).toBe(true);
    expect(snapshot.runtime.kill_switch_active).toBe(true);
    expect(snapshot.runtime.breaker.state).toBe("OPEN");
  });

  it("forces breaker open when retry amplification guard is exceeded", () => {
    const fx = writeFixtureFiles();
    const env = {
      POLICY_RUNTIME_DEFAULTS_PATH: fx.defaultsPath,
      POLICY_BASELINE_REGISTRY_PATH: fx.registryPath,
      SLO_EVENTS_JSONL_PATH: fx.eventsPath,
      POLICY_RETRY_AMP_GUARD_MAX: "0.1"
    } as NodeJS.ProcessEnv;
    const snapshot = readAndBuildGovernanceSnapshot(env);
    expect(snapshot.runtime.blast_radius_violation).toBe(true);
    expect(snapshot.runtime.breaker.state).toBe("OPEN");
  });

  it("uses cached snapshot within ttl window", () => {
    resetGovernanceSnapshotCacheForTests();
    const fx = writeFixtureFiles();
    const env = {
      POLICY_RUNTIME_DEFAULTS_PATH: fx.defaultsPath,
      POLICY_BASELINE_REGISTRY_PATH: fx.registryPath,
      SLO_EVENTS_JSONL_PATH: fx.eventsPath,
      POLICY_INTROSPECTION_CACHE_TTL_MS: "10000"
    } as NodeJS.ProcessEnv;

    const first = readGovernanceSnapshotCached(env, 1000);
    fs.writeFileSync(fx.eventsPath, "", "utf8");
    const second = readGovernanceSnapshotCached(env, 1001);

    expect(first.governance_fingerprint).toBe(second.governance_fingerprint);
  });

  it("fails fast on corrupt baseline registry", () => {
    const fx = writeFixtureFiles();
    fs.writeFileSync(fx.registryPath, "{}", "utf8");

    expect(() =>
      readAndBuildGovernanceSnapshot({
        POLICY_RUNTIME_DEFAULTS_PATH: fx.defaultsPath,
        POLICY_BASELINE_REGISTRY_PATH: fx.registryPath,
        SLO_EVENTS_JSONL_PATH: fx.eventsPath
      } as NodeJS.ProcessEnv)
    ).toThrow();
  });
});
