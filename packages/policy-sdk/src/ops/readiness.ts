import fs from "node:fs";
import path from "node:path";

import { loadAndValidateTargetRegistry } from "../loadrun/targetRegistryValidate";
import { loadContractsAndSignature, loadContractsKeyring, verifySloContractsSignature } from "../contracts/sloContracts";
import { verifyLedgerWithArchives } from "../audit/retention";
import { loadRetentionPolicy } from "../audit/retention";
import { readAuditStorageConfig } from "../audit/storage";

export type ReadinessResult = {
  generated_at: string;
  strict: boolean;
  passed: boolean;
  checks: Array<{
    name: string;
    passed: boolean;
    details: string;
  }>;
};

type Check = {
  name: string;
  passed: boolean;
  details: string;
};

export function buildReadinessMarkdown(result: ReadinessResult): string {
  return [
    "# Fortress Readiness",
    "",
    `- Generated at: \`${result.generated_at}\``,
    `- Strict: \`${result.strict}\``,
    `- Passed: \`${result.passed}\``,
    "",
    "| Check | Passed | Details |",
    "| --- | :---: | --- |",
    ...result.checks.map((c) => `| ${c.name} | ${c.passed ? "yes" : "no"} | ${c.details} |`)
  ].join("\n");
}

export function runReadinessCheck(args: {
  rootDir: string;
  strict: boolean;
  requireImmutableSink?: boolean;
}): ReadinessResult {
  const checks: Check[] = [];
  const abs = (p: string) => path.resolve(args.rootDir, p);

  const targetValidation = loadAndValidateTargetRegistry({
    registryPath: abs("ops/targets/targets.json"),
    baselineRegistryPath: abs("ops/load_runs/baselines/registry.json"),
    guardrailProfilesPath: abs("ops/guardrails/profiles.json"),
    workflowPaths: [abs(".github/workflows/loadrun-regression.yml"), abs(".github/workflows/loadrun-prod-drift.yml")],
    strict: true,
    allowUnbaselinedStaging: false
  });
  checks.push({
    name: "target_registry_validation",
    passed: targetValidation.passed,
    details: targetValidation.passed ? "ok" : targetValidation.errors.join("; ")
  });

  const contracts = loadContractsAndSignature({
    contractsPath: abs("ops/contracts/slo_contracts.json"),
    signaturePath: abs("ops/contracts/slo_contracts.sig.json")
  });
  const keyring = loadContractsKeyring(abs("ops/keys/keyring.json"));
  const contractVerify = verifySloContractsSignature({
    contracts: contracts.contracts,
    signed: contracts.signed,
    keyring
  });
  checks.push({
    name: "contracts_signature_verify",
    passed: contractVerify.ok,
    details: contractVerify.ok ? "ok" : contractVerify.reason ?? "verify_failed"
  });

  const ledgerVerify = verifyLedgerWithArchives({
    activeLedgerPath: abs("ops/audit/ledger.jsonl"),
    archiveDir: abs("ops/audit/archive"),
    checkpointsDir: abs("ops/audit/checkpoints"),
    strictSignatures: false,
    keyringPath: abs("ops/keys/keyring.json")
  });
  checks.push({
    name: "ledger_chain_verify",
    passed: ledgerVerify.ok,
    details: ledgerVerify.ok ? `segments=${ledgerVerify.segments}` : ledgerVerify.errors.join("; ")
  });

  const retention = loadRetentionPolicy(abs("ops/retention/policy.json"));
  checks.push({
    name: "retention_policy_valid",
    passed: retention.retention_days >= 90,
    details: `retention_days=${retention.retention_days}`
  });

  const workflowPresent = fs.existsSync(abs(".github/workflows/audit-retention.yml"));
  checks.push({
    name: "audit_retention_workflow_present",
    passed: workflowPresent,
    details: workflowPresent ? "found" : "missing .github/workflows/audit-retention.yml"
  });

  let immutablePass = true;
  let immutableDetails = "file sink";
  try {
    const storageCfg = readAuditStorageConfig(process.env);
    immutableDetails = `sink=${storageCfg.sink}`;
    if (args.requireImmutableSink && storageCfg.sink !== "s3") {
      immutablePass = false;
      immutableDetails = "requireImmutableSink=true but AUDIT_SINK is not s3";
    }
  } catch (error) {
    immutablePass = false;
    immutableDetails = error instanceof Error ? error.message : String(error);
  }
  checks.push({
    name: "immutable_sink_config",
    passed: immutablePass,
    details: immutableDetails
  });

  const pass = checks.every((c) => {
    if (c.passed) return true;
    if (!args.strict && c.name === "immutable_sink_config") return true;
    return false;
  });
  return {
    generated_at: new Date().toISOString(),
    strict: args.strict,
    passed: pass,
    checks
  };
}
