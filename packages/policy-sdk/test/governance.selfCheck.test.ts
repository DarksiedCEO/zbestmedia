import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { appendAuditLedgerEntry } from "../src/audit/ledger";
import { signSloContracts } from "../src/contracts/sloContracts";
import { runGovernanceSelfCheck } from "../src/governance/selfCheck";

const PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
MC4CAQAwBQYDK2VwBCIEIBR3qzdJMbKrgSDvotT+z3JjxlTdxQUCWB2UHCC5A37F
-----END PRIVATE KEY-----
`;
const PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAZCu+zhIWuT2vmau3yXFrWfKY8bHyxNcj9CqWMsVeh7w=
-----END PUBLIC KEY-----
`;

function setupRoot(opts?: { omitProdBaseline?: boolean; invalidContractSig?: boolean }): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "gov-selfcheck-"));
  const write = (rel: string, value: unknown) => {
    const full = path.join(root, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  };

  write("packages/policy-sdk/src/defaults/runtime.defaults.json", {
    POLICY_BREAKER_FAILURE_THRESHOLD: 5,
    POLICY_BREAKER_RESET_AFTER_MS: 15000,
    POLICY_RETRY_MAX: 2,
    POLICY_RETRY_BASE_DELAY_MS: 80,
    POLICY_RETRY_MAX_DELAY_MS: 400
  });
  write("ops/targets/targets.json", {
    targets: [{ target_id: "prod/us-west/policy", base_url_env: "POLICY_BASE_URL_US_WEST" }]
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
  write("ops/load_runs/baselines/registry.json", {
    version: 2,
    targets: opts?.omitProdBaseline
      ? {}
      : {
          "prod/us-west/policy": {
            baseline_report_path: "x",
            baseline_hash: "abc123",
            baseline_run_path: "x",
            accepted_at: "2026-03-01T00:00:00.000Z",
            accepted_by: "seed",
            notes: "seed",
            chaos_report_path: ""
          }
        }
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
  if (opts?.invalidContractSig) {
    write("ops/contracts/slo_contracts.sig.json", {
      payload_hash: "0".repeat(64),
      signature: {
        kid: "k1",
        algo: "ed25519",
        created_at: "2026-03-01T00:00:00.000Z",
        signature: "invalid"
      }
    });
  } else {
    write("ops/contracts/slo_contracts.sig.json", signSloContracts({ contracts, kid: "k1", privateKeyPem: PRIVATE_KEY }));
  }
  write("ops/keys/keyring.json", {
    version: 1,
    keys: { k1: { algo: "ed25519", public_key_pem: PUBLIC_KEY } }
  });
  fs.mkdirSync(path.join(root, "ops/audit/archive"), { recursive: true });
  fs.mkdirSync(path.join(root, "ops/audit/checkpoints"), { recursive: true });
  const ledgerPath = path.join(root, "ops/audit/ledger.jsonl");
  appendAuditLedgerEntry({
    ledgerPath,
    type: "slo_event",
    targetId: "prod/us-west/policy",
    payload: { ok: true },
    now: new Date("2026-03-01T00:00:00.000Z"),
    signature: { kid: "k1", privateKeyPem: PRIVATE_KEY }
  });
  fs.mkdirSync(path.join(root, "ops/slo"), { recursive: true });
  fs.writeFileSync(path.join(root, "ops/slo/loadrun_events.jsonl"), "", "utf8");
  return root;
}

describe("governance self-check", () => {
  it("flags tampered ledger and forces score 0", async () => {
    const root = setupRoot();
    const ledger = path.join(root, "ops/audit/ledger.jsonl");
    const first = JSON.parse(fs.readFileSync(ledger, "utf8").trim()) as Record<string, unknown>;
    first.chain_hash = "f".repeat(64);
    fs.writeFileSync(ledger, `${JSON.stringify(first)}\n`, "utf8");
    const result = await runGovernanceSelfCheck({
      rootDir: root,
      targetId: "prod/us-west/policy",
      strict: true,
      env: {
        NODE_ENV: "production",
        POLICY_AUDIT_LEDGER_ENABLED: "true",
        SLO_SINK: "file",
        SLO_EVENTS_JSONL_PATH: "ops/slo/loadrun_events.jsonl",
        SLO_ARCHIVE_DIR: "ops/slo/archive",
        GOVERNANCE_AUTO_BLOCK_ON_FAIL: "true"
      }
    });
    expect(result.passed).toBe(false);
    expect(result.integrity_score).toBe(0);
    expect(result.flags).toContain("LEDGER_CHAIN_BROKEN");
    expect(result.auto_block_active).toBe(true);
  });

  it("flags invalid contract signature as critical", async () => {
    const root = setupRoot({ invalidContractSig: true });
    const result = await runGovernanceSelfCheck({
      rootDir: root,
      targetId: "prod/us-west/policy",
      strict: true,
      env: {
        NODE_ENV: "production",
        POLICY_AUDIT_LEDGER_ENABLED: "true",
        SLO_SINK: "file",
        SLO_EVENTS_JSONL_PATH: "ops/slo/loadrun_events.jsonl",
        SLO_ARCHIVE_DIR: "ops/slo/archive"
      }
    });
    expect(result.passed).toBe(false);
    expect(result.flags).toContain("CONTRACT_SIG_INVALID");
    expect(result.integrity_score).toBe(0);
  });

  it("flags missing prod baseline and immutable sink requirement", async () => {
    const root = setupRoot({ omitProdBaseline: true });
    const result = await runGovernanceSelfCheck({
      rootDir: root,
      targetId: "prod/us-west/policy",
      strict: true,
      env: {
        NODE_ENV: "production",
        POLICY_AUDIT_LEDGER_ENABLED: "true",
        SLO_SINK: "file",
        SLO_EVENTS_JSONL_PATH: "ops/slo/loadrun_events.jsonl",
        SLO_ARCHIVE_DIR: "ops/slo/archive",
        GOVERNANCE_REQUIRED_IMMUTABLE_SINK: "true"
      }
    });
    expect(result.passed).toBe(false);
    expect(result.flags).toContain("PROD_BASELINE_MISSING");
    expect(result.flags).toContain("IMMUTABLE_SINK_STALE");
    expect(result.auto_block_active).toBe(true);
  });
});
