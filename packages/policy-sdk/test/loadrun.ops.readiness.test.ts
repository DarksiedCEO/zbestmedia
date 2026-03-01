import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { runReadinessCheck } from "../src/ops/readiness";
import { signSloContracts } from "../src/contracts/sloContracts";

const PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
MC4CAQAwBQYDK2VwBCIEIBR3qzdJMbKrgSDvotT+z3JjxlTdxQUCWB2UHCC5A37F
-----END PRIVATE KEY-----
`;
const PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAZCu+zhIWuT2vmau3yXFrWfKY8bHyxNcj9CqWMsVeh7w=
-----END PUBLIC KEY-----
`;

function setupRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "readiness-"));
  const write = (rel: string, value: unknown) => {
    const full = path.join(root, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  };
  write("ops/targets/targets.json", {
    targets: [{ target_id: "prod/us-west/policy", base_url_env: "POLICY_BASE_URL_US_WEST" }]
  });
  write("ops/load_runs/baselines/registry.json", {
    version: 2,
    targets: {
      "prod/us-west/policy": {
        baseline_report_path: "x",
        baseline_hash: "abc",
        baseline_run_path: "x",
        accepted_at: "2026-03-01T00:00:00.000Z",
        accepted_by: "seed",
        notes: "seed",
        chaos_report_path: ""
      }
    }
  });
  write("ops/guardrails/profiles.json", {
    profiles: {
      "prod/*": {
        p95InflationRatioCap: 1.25,
        p99InflationRatioCap: 1.5,
        errorRateIncreasePctPointsCap: 0.25,
        timeoutIncreasePctPointsCap: 0.1,
        breakerOpenRateIncreasePctPointsCap: 2,
        retryAmplificationIncreaseCap: 0.15
      }
    }
  });
  write("ops/retention/policy.json", {
    version: 1,
    rollover_cadence: "daily",
    archive_compression: "gzip",
    retention_days: 365,
    never_delete_targets: ["prod/us-west/policy"]
  });
  write(".github/workflows/loadrun-regression.yml", { target_id: "prod/us-west/policy" });
  write(".github/workflows/loadrun-prod-drift.yml", { target_id: "prod/us-west/policy" });
  write(".github/workflows/audit-retention.yml", { name: "audit-retention" });
  write("ops/audit/ledger.jsonl", {});
  fs.writeFileSync(path.join(root, "ops/audit/ledger.jsonl"), "", "utf8");
  fs.mkdirSync(path.join(root, "ops/audit/archive"), { recursive: true });
  fs.mkdirSync(path.join(root, "ops/audit/checkpoints"), { recursive: true });
  write("ops/keys/keyring.json", {
    version: 1,
    keys: { k1: { algo: "ed25519", public_key_pem: PUBLIC_KEY } }
  });
  const contracts = {
    version: "1.0.0",
    effective_at: "2026-03-01T00:00:00.000Z",
    contracts: {
      "prod/us-west/policy": {
        guardrails_profile_key: "prod/*",
        thresholds: {
          p95InflationRatioCap: 1.25,
          p99InflationRatioCap: 1.5,
          errorRateIncreasePctPointsCap: 0.25,
          timeoutIncreasePctPointsCap: 0.1,
          breakerOpenRateIncreasePctPointsCap: 2,
          retryAmplificationIncreaseCap: 0.15
        },
        budgets: {},
        severity_rules: {}
      }
    }
  };
  write("ops/contracts/slo_contracts.json", contracts);
  write("ops/contracts/slo_contracts.sig.json", signSloContracts({ contracts, kid: "k1", privateKeyPem: PRIVATE_KEY }));
  return root;
}

describe("ops readiness", () => {
  it("passes with required fixture set", () => {
    const root = setupRoot();
    const result = runReadinessCheck({ rootDir: root, strict: true });
    expect(result.passed).toBe(true);
    expect(result.checks.some((c) => c.name === "contracts_signature_verify" && c.passed)).toBe(true);
  });
});
