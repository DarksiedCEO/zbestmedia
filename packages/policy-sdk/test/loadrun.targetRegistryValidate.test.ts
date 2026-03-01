import { describe, expect, it } from "vitest";

import { parseBaselineRegistry } from "../src/loadrun/baselineRegistry";
import { parseGuardrailProfiles } from "../src/loadrun/guardrailProfiles";
import { parseTargetRegistry, validateTargetRegistry } from "../src/loadrun/targetRegistryValidate";

const baselineRegistry = parseBaselineRegistry({
  version: 2,
  targets: {
    "prod/us-west/policy": {
      baseline_report_path: "ops/load_runs/baselines/prod-report.json",
      baseline_hash: "a".repeat(64),
      baseline_run_path: "ops/load_runs/baselines/prod-run.json",
      accepted_at: "2026-03-01T00:00:00.000Z",
      accepted_by: "andre",
      notes: "prod",
      chaos_report_path: ""
    }
  }
});

const guardrailProfiles = parseGuardrailProfiles({
  profiles: {
    "prod/*": {
      p95InflationRatioCap: 1.25,
      p99InflationRatioCap: 1.5,
      errorRateIncreasePctPointsCap: 0.25,
      timeoutIncreasePctPointsCap: 0.1,
      breakerOpenRateIncreasePctPointsCap: 2,
      retryAmplificationIncreaseCap: 0.15
    },
    "staging/*": {
      p95InflationRatioCap: 1.5,
      p99InflationRatioCap: 1.8,
      errorRateIncreasePctPointsCap: 0.5,
      timeoutIncreasePctPointsCap: 0.2,
      breakerOpenRateIncreasePctPointsCap: 3,
      retryAmplificationIncreaseCap: 0.25
    }
  }
});

describe("target registry validator", () => {
  it("passes for valid config", () => {
    const registry = parseTargetRegistry({
      targets: [{ target_id: "prod/us-west/policy", base_url_env: "POLICY_BASE_URL_US_WEST" }]
    });
    const result = validateTargetRegistry({
      registry,
      baselineRegistry,
      guardrailProfiles,
      guardrailsHash: "hash-1",
      workflowTargets: {
        "loadrun-regression.yml": ["prod/us-west/policy"]
      },
      strict: true,
      allowUnbaselinedStaging: false
    });
    expect(result.passed).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.resolved_profiles[0]).toEqual({
      target_id: "prod/us-west/policy",
      profile_key: "prod/*",
      profile_hash: "hash-1"
    });
  });

  it("fails on unknown workflow target", () => {
    const registry = parseTargetRegistry({
      targets: [{ target_id: "prod/us-west/policy", base_url_env: "POLICY_BASE_URL_US_WEST" }]
    });
    const result = validateTargetRegistry({
      registry,
      baselineRegistry,
      guardrailProfiles,
      guardrailsHash: "hash-1",
      workflowTargets: {
        "loadrun-regression.yml": ["prod/us-east/policy"]
      },
      strict: true,
      allowUnbaselinedStaging: false
    });
    expect(result.passed).toBe(false);
    expect(result.errors.join(" ")).toContain("target_id not registered");
  });

  it("missing staging baseline fails strict and passes with staging allowance", () => {
    const registry = parseTargetRegistry({
      targets: [{ target_id: "staging/policy", base_url_env: "POLICY_BASE_URL_STAGING" }]
    });

    const strictResult = validateTargetRegistry({
      registry,
      baselineRegistry,
      guardrailProfiles,
      guardrailsHash: "hash-1",
      workflowTargets: {},
      strict: true,
      allowUnbaselinedStaging: false
    });
    expect(strictResult.passed).toBe(false);
    expect(strictResult.errors.join(" ")).toContain("missing baseline");

    const allowResult = validateTargetRegistry({
      registry,
      baselineRegistry,
      guardrailProfiles,
      guardrailsHash: "hash-1",
      workflowTargets: {},
      strict: false,
      allowUnbaselinedStaging: true
    });
    expect(allowResult.passed).toBe(true);
  });

  it("fails when no guardrail profile resolves", () => {
    const registry = parseTargetRegistry({
      targets: [{ target_id: "prod/us-west/policy", base_url_env: "POLICY_BASE_URL_US_WEST" }]
    });
    const emptyProfiles = parseGuardrailProfiles({ profiles: {} });
    const result = validateTargetRegistry({
      registry,
      baselineRegistry,
      guardrailProfiles: emptyProfiles,
      guardrailsHash: "hash-2",
      workflowTargets: {},
      strict: true,
      allowUnbaselinedStaging: false
    });
    expect(result.passed).toBe(false);
    expect(result.errors.join(" ")).toContain("no guardrail profile resolved");
  });
});
