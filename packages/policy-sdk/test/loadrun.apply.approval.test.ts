import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { applyDefaultsFromProposal } from "../src/loadrun/apply";
import type { DefaultsProposal } from "../src/loadrun/propose";
import { parseRuntimeDefaults } from "../src/loadrun/defaults";

function makeProposal(args: { noChange?: boolean; guardrailsPassed?: boolean }): DefaultsProposal {
  const current = parseRuntimeDefaults({
    POLICY_BREAKER_FAILURE_THRESHOLD: 5,
    POLICY_BREAKER_RESET_AFTER_MS: 15000,
    POLICY_RETRY_MAX: 2,
    POLICY_RETRY_BASE_DELAY_MS: 80,
    POLICY_RETRY_MAX_DELAY_MS: 400,
    POLICY_MAX_CONCURRENCY_SAFE: 200
  });
  const proposed = args.noChange
    ? current
    : parseRuntimeDefaults({
        POLICY_BREAKER_FAILURE_THRESHOLD: 6,
        POLICY_BREAKER_RESET_AFTER_MS: 16000,
        POLICY_RETRY_MAX: 2,
        POLICY_RETRY_BASE_DELAY_MS: 120,
        POLICY_RETRY_MAX_DELAY_MS: 500,
        POLICY_MAX_CONCURRENCY_SAFE: 180
      });
  return {
    generated_at: "2026-03-01T00:00:00.000Z",
    report_file: "/tmp/report.json",
    report_sha256: "a".repeat(64),
    current_file: "/tmp/current.json",
    current_sha256: "b".repeat(64),
    current,
    proposed,
    diff: [],
    no_change: Boolean(args.noChange),
    rationale: ["rationale"],
    guardrails: {
      passed: args.guardrailsPassed ?? true,
      checks: [],
      thresholds: {
        retryAmplificationCap: 1.4,
        breakerOpenRateCap: 0.05,
        p95InflationRatioCap: 2,
        chaosSuccessRateFloorRatio: 0.85,
        maxStatus5xxRateIncreasePctPoints: 20,
        maxBreakerThresholdChangePct: 25,
        maxRetryStepChange: 1,
        maxResetAfterMsChangePct: 30
      }
    }
  };
}

describe("loadrun apply defaults approval gate", () => {
  it("requires approve flag", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "apply-defaults-"));
    const proposal = makeProposal({});
    expect(() =>
      applyDefaultsFromProposal({
        proposal,
        defaultsPath: path.join(tmpDir, "runtime.defaults.json"),
        rollbackDir: path.join(tmpDir, "rollbacks"),
        approved: false,
        reason: "test"
      })
    ).toThrow("Approval required");
  });

  it("rejects when guardrails fail", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "apply-defaults-"));
    const proposal = makeProposal({ guardrailsPassed: false });
    expect(() =>
      applyDefaultsFromProposal({
        proposal,
        defaultsPath: path.join(tmpDir, "runtime.defaults.json"),
        rollbackDir: path.join(tmpDir, "rollbacks"),
        approved: true,
        reason: "test"
      })
    ).toThrow("Guardrails failed");
  });

  it("no-change proposal creates rollback but does not rewrite defaults", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "apply-defaults-"));
    const defaultsPath = path.join(tmpDir, "runtime.defaults.json");
    const rollbackDir = path.join(tmpDir, "rollbacks");
    const proposal = makeProposal({ noChange: true });
    const before = parseRuntimeDefaults(proposal.current);
    fs.writeFileSync(defaultsPath, `${JSON.stringify(before, null, 2)}\n`, "utf8");

    const result = applyDefaultsFromProposal({
      proposal,
      defaultsPath,
      rollbackDir,
      approved: true,
      reason: "no change test"
    });

    expect(result.changed).toBe(false);
    expect(fs.existsSync(result.rollbackPath)).toBe(true);
    const current = JSON.parse(fs.readFileSync(defaultsPath, "utf8"));
    expect(current).toEqual(before);
  });
});
