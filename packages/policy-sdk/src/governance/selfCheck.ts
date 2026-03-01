import fs from "node:fs";
import path from "node:path";

import { z } from "zod";

import { stableObjectHash } from "../audit/common";
import { appendAuditLedgerEntryFromEnv } from "../audit/ledger";
import { loadRetentionPolicy, verifyLedgerWithArchives } from "../audit/retention";
import { readAuditStorageConfig } from "../audit/storage";
import { loadContractsAndSignature, loadContractsKeyring, verifySloContractsSignature } from "../contracts/sloContracts";
import { loadBaselineRegistry, resolveTargetBaselineEntry } from "../loadrun/baselineRegistry";
import { loadGuardrailProfiles, resolveThresholdsForTarget } from "../loadrun/guardrailProfiles";
import { buildIncidentBundle, writeIncidentBundle } from "../loadrun/incident";
import { parseTargetRegistry, loadAndValidateTargetRegistry } from "../loadrun/targetRegistryValidate";
import { emitOperationalSloEvent } from "../slo/emit";
import { computeIntegrityScore } from "./integrityScore";
import { type IntegrityFlag } from "./integrityFlags";

const governanceSelfCheckResultSchema = z.object({
  ts: z.string().datetime(),
  target_id: z.string().min(1),
  passed: z.boolean(),
  integrity_score: z.number().int().min(0).max(100),
  flags: z.array(z.string()),
  warnings: z.array(z.string()),
  errors: z.array(z.string()),
  evidence: z.object({
    contracts_version: z.string().nullable(),
    contract_signature_kid: z.string().nullable(),
    ledger_head_hash: z.string().nullable(),
    keyring_kids: z.array(z.string()),
    guardrails_hash: z.string().nullable(),
    baseline_hash: z.string().nullable(),
    defaults_hash: z.string().nullable(),
    last_rollover_ts: z.string().nullable(),
    immutable_sink: z.string()
  }),
  last_self_check_event_id: z.string().nullable(),
  auto_block_active: z.boolean(),
  auto_freeze_recommended: z.boolean()
});

export type GovernanceSelfCheckResult = z.infer<typeof governanceSelfCheckResultSchema>;

function resolvePath(rootDir: string, rel: string): string {
  return path.resolve(rootDir, rel);
}

function parseIsoDateFromFilename(name: string): string | null {
  const match = name.match(/(\d{4}-\d{2}-\d{2})/);
  if (!match) return null;
  return `${match[1]}T00:00:00.000Z`;
}

function writeControlPatch(args: {
  controlsPath: string;
  integrityBlock: boolean;
  freeze: boolean;
  autoFreezeRecommended: boolean;
  score: number;
  flags: string[];
  reason: string;
}): void {
  const current = fs.existsSync(args.controlsPath)
    ? (JSON.parse(fs.readFileSync(args.controlsPath, "utf8")) as Record<string, unknown>)
    : {};
  const next = {
    ...current,
    freeze: args.freeze,
    integrity_block: args.integrityBlock,
    auto_freeze_recommended: args.autoFreezeRecommended,
    integrity_score: args.score,
    integrity_flags: args.flags,
    updated_at: new Date().toISOString(),
    reason: args.reason
  };
  fs.mkdirSync(path.dirname(args.controlsPath), { recursive: true });
  fs.writeFileSync(args.controlsPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
}

function resolveRetentionStale(args: {
  policyPath: string;
  checkpointsDir: string;
  nowMs: number;
}): { stale: boolean; lastRolloverTs: string | null } {
  const policy = loadRetentionPolicy(args.policyPath);
  const files = fs.existsSync(args.checkpointsDir)
    ? fs
        .readdirSync(args.checkpointsDir)
        .filter((f) => f.endsWith(".head.json"))
        .sort()
    : [];
  if (files.length === 0) {
    return { stale: true, lastRolloverTs: null };
  }
  const latest = files[files.length - 1]!;
  const parsed = parseIsoDateFromFilename(latest);
  if (!parsed) {
    return { stale: true, lastRolloverTs: null };
  }
  const lastMs = Date.parse(parsed);
  if (!Number.isFinite(lastMs)) {
    return { stale: true, lastRolloverTs: null };
  }
  const windowMs = policy.rollover_cadence === "daily" ? 2 * 24 * 60 * 60 * 1000 : 8 * 24 * 60 * 60 * 1000;
  return {
    stale: args.nowMs - lastMs > windowMs,
    lastRolloverTs: parsed
  };
}

export async function runGovernanceSelfCheck(args: {
  rootDir: string;
  targetId: string;
  strict: boolean;
  env?: NodeJS.ProcessEnv;
}): Promise<GovernanceSelfCheckResult> {
  const env = args.env ?? process.env;
  const nowIso = new Date().toISOString();
  const warnings: string[] = [];
  const errors: string[] = [];
  const flags: IntegrityFlag[] = [];

  const paths = {
    contracts: resolvePath(args.rootDir, "ops/contracts/slo_contracts.json"),
    contractSig: resolvePath(args.rootDir, "ops/contracts/slo_contracts.sig.json"),
    keyring: resolvePath(args.rootDir, "ops/keys/keyring.json"),
    ledger: resolvePath(args.rootDir, env.POLICY_AUDIT_LEDGER_PATH ?? "ops/audit/ledger.jsonl"),
    archive: resolvePath(args.rootDir, "ops/audit/archive"),
    checkpoints: resolvePath(args.rootDir, "ops/audit/checkpoints"),
    targets: resolvePath(args.rootDir, "ops/targets/targets.json"),
    registry: resolvePath(args.rootDir, "ops/load_runs/baselines/registry.json"),
    guardrails: resolvePath(args.rootDir, "ops/guardrails/profiles.json"),
    retention: resolvePath(args.rootDir, "ops/retention/policy.json"),
    defaults: resolvePath(args.rootDir, env.POLICY_RUNTIME_DEFAULTS_PATH ?? "packages/policy-sdk/src/defaults/runtime.defaults.json"),
    controls: resolvePath(args.rootDir, env.POLICY_CONTROLS_PATH ?? "ops/incidents/controls.json"),
    status: resolvePath(args.rootDir, env.POLICY_GOVERNANCE_INTEGRITY_STATUS_PATH ?? "ops/incidents/governance_integrity_status.json"),
    immutableManifest: resolvePath(args.rootDir, "ops/audit/immutable_upload_manifest.json")
  };

  let contractsVersion: string | null = null;
  let contractKid: string | null = null;
  let keyringKids: string[] = [];
  let guardrailsHash: string | null = null;
  let baselineHash: string | null = null;
  let defaultsHash: string | null = null;

  try {
    const { contracts, signed } = loadContractsAndSignature({
      contractsPath: paths.contracts,
      signaturePath: paths.contractSig
    });
    const keyring = loadContractsKeyring(paths.keyring);
    keyringKids = Object.keys(keyring.keys).sort();
    contractsVersion = contracts.version;
    contractKid = signed.signature.kid;
    const cv = verifySloContractsSignature({ contracts, signed, keyring });
    if (!cv.ok) {
      errors.push(`contracts verify failed: ${cv.reason ?? "unknown"}`);
      flags.push(cv.reason?.startsWith("unknown_kid") ? "KEYRING_KID_UNKNOWN" : "CONTRACT_SIG_INVALID");
    }
  } catch (error) {
    errors.push(`contracts load/verify failed: ${error instanceof Error ? error.message : String(error)}`);
    flags.push("CONTRACT_SIG_INVALID");
  }

  const ledgerVerify = verifyLedgerWithArchives({
    activeLedgerPath: paths.ledger,
    archiveDir: paths.archive,
    checkpointsDir: paths.checkpoints,
    strictSignatures: true,
    keyringPath: paths.keyring
  });
  if (!ledgerVerify.ok) {
    errors.push(...ledgerVerify.errors.map((e) => `ledger: ${e}`));
    flags.push("LEDGER_CHAIN_BROKEN");
  }

  const targetValidation = loadAndValidateTargetRegistry({
    registryPath: paths.targets,
    baselineRegistryPath: paths.registry,
    guardrailProfilesPath: paths.guardrails,
    workflowPaths: [
      resolvePath(args.rootDir, ".github/workflows/loadrun-regression.yml"),
      resolvePath(args.rootDir, ".github/workflows/loadrun-prod-drift.yml")
    ],
    strict: true,
    allowUnbaselinedStaging: false
  });
  if (!targetValidation.passed) {
    errors.push(...targetValidation.errors.map((e) => `targets: ${e}`));
    flags.push("TARGET_REGISTRY_MISMATCH");
  }

  try {
    const targetRegistry = parseTargetRegistry(JSON.parse(fs.readFileSync(paths.targets, "utf8")));
    const baselineRegistry = loadBaselineRegistry(paths.registry);
    const guardrails = loadGuardrailProfiles(paths.guardrails);
    guardrailsHash = guardrails.hash;

    for (const target of targetRegistry.targets) {
      const isProd = target.target_id.startsWith("prod/");
      try {
        const baseline = resolveTargetBaselineEntry({
          registry: baselineRegistry,
          targetId: target.target_id,
          allowUnbaselinedStaging: false
        });
        if (target.target_id === args.targetId) {
          baselineHash = baseline.baseline_hash || null;
        }
        if (isProd && !baseline.baseline_hash) {
          flags.push("PROD_BASELINE_MISSING");
          errors.push(`missing baseline hash for ${target.target_id}`);
        }
      } catch (error) {
        if (isProd) {
          flags.push("PROD_BASELINE_MISSING");
          errors.push(`missing baseline for ${target.target_id}: ${error instanceof Error ? error.message : String(error)}`);
        } else {
          warnings.push(`missing non-prod baseline for ${target.target_id}`);
        }
      }

      const resolved = resolveThresholdsForTarget({
        targetId: target.target_id,
        profiles: guardrails.profiles
      });
      if (isProd && resolved.profileKey === "*") {
        flags.push("GUARDRAIL_FALLBACK_GLOBAL_PROD");
        errors.push(`prod target ${target.target_id} resolved to global guardrail profile '*'`);
      }
    }
  } catch (error) {
    errors.push(`registry/guardrails coverage failed: ${error instanceof Error ? error.message : String(error)}`);
    flags.push("TARGET_REGISTRY_MISMATCH");
  }

  const retention = resolveRetentionStale({
    policyPath: paths.retention,
    checkpointsDir: paths.checkpoints,
    nowMs: Date.now()
  });
  if (retention.stale) {
    flags.push("RETENTION_STALE");
    errors.push("retention window exceeded or no checkpoint found");
  }

  let immutableSink = "file";
  try {
    const sinkCfg = readAuditStorageConfig(env);
    immutableSink = sinkCfg.sink;
    const required = String(env.GOVERNANCE_REQUIRED_IMMUTABLE_SINK ?? "false").toLowerCase() === "true";
    if (sinkCfg.sink === "s3") {
      if (!fs.existsSync(paths.immutableManifest)) {
        if (required) {
          flags.push("IMMUTABLE_SINK_STALE");
          errors.push("immutable sink enabled but immutable upload manifest missing");
        } else {
          warnings.push("immutable sink enabled but immutable upload manifest missing");
        }
      } else {
        const manifest = JSON.parse(fs.readFileSync(paths.immutableManifest, "utf8")) as { generated_at?: string };
        const ts = Date.parse(manifest.generated_at ?? "");
        const maxAgeMs = Number(env.GOVERNANCE_IMMUTABLE_MAX_AGE_MS ?? 48 * 60 * 60 * 1000);
        if (!Number.isFinite(ts) || Date.now() - ts > maxAgeMs) {
          if (required) {
            flags.push("IMMUTABLE_SINK_STALE");
            errors.push("immutable sink manifest stale");
          } else {
            warnings.push("immutable sink manifest stale");
          }
        }
      }
    } else if (required) {
      flags.push("IMMUTABLE_SINK_STALE");
      errors.push("immutable sink required but AUDIT_SINK is not s3");
    }
  } catch (error) {
    const required = String(env.GOVERNANCE_REQUIRED_IMMUTABLE_SINK ?? "false").toLowerCase() === "true";
    const msg = `immutable sink config invalid: ${error instanceof Error ? error.message : String(error)}`;
    if (required) {
      flags.push("IMMUTABLE_SINK_STALE");
      errors.push(msg);
    } else {
      warnings.push(msg);
    }
  }

  if (fs.existsSync(paths.defaults)) {
    defaultsHash = stableObjectHash(JSON.parse(fs.readFileSync(paths.defaults, "utf8")));
  }

  const score = computeIntegrityScore(flags);
  const minScore = Number(env.GOVERNANCE_INTEGRITY_MIN_SCORE ?? 90);
  const passed = errors.length === 0 && score.integrity_score >= minScore;
  const autoBlockOnFail = String(env.GOVERNANCE_AUTO_BLOCK_ON_FAIL ?? "true").toLowerCase() === "true";
  const autoFreezeOnCritical = String(env.GOVERNANCE_AUTO_FREEZE_ON_CRITICAL ?? "false").toLowerCase() === "true";
  const autoBlockActive = autoBlockOnFail && !passed;
  const autoFreezeRecommended = score.critical || autoFreezeOnCritical;

  let lastSelfCheckEventId: string | null = null;
  const event = await emitOperationalSloEvent({
    source: "prod",
    service: "policy",
    targetId: args.targetId,
    tags: [
      passed ? "governance_integrity_check" : "governance_integrity_fail",
      `integrity_score:${score.integrity_score}`,
      ...[...new Set(flags)]
    ],
    reason: passed ? "governance_integrity_check" : "governance_integrity_fail",
    sink: (env.SLO_SINK as "file" | "postgres" | undefined) ?? "file",
    jsonlPath: resolvePath(args.rootDir, env.SLO_EVENTS_JSONL_PATH ?? "ops/slo/loadrun_events.jsonl"),
    archiveDir: resolvePath(args.rootDir, env.SLO_ARCHIVE_DIR ?? "ops/slo/archive"),
    postgresUrl: env.SLO_POSTGRES_URL
  });
  lastSelfCheckEventId = event.event_id;

  appendAuditLedgerEntryFromEnv({
    type: "governance_self_check",
    targetId: args.targetId,
    payload: {
      ts: nowIso,
      passed,
      integrity_score: score.integrity_score,
      flags: [...new Set(flags)],
      ledger_head_hash: ledgerVerify.head_hash,
      contract_version: contractsVersion
    },
    env
  });

  if (!passed) {
    const baselineRegistry = fs.existsSync(paths.registry)
      ? loadBaselineRegistry(paths.registry)
      : {
          version: 2 as const,
          targets: {}
        };
    const baseline = (() => {
      try {
        return resolveTargetBaselineEntry({
          registry: baselineRegistry,
          targetId: args.targetId,
          allowUnbaselinedStaging: true
        });
      } catch {
        return {
          baseline_report_path: "",
          baseline_hash: "",
          baseline_run_path: "",
          accepted_at: "",
          accepted_by: "unknown",
          notes: "missing baseline",
          chaos_report_path: ""
        };
      }
    })();
    const incident = buildIncidentBundle({
      targetId: args.targetId,
      severity: score.critical ? "CRITICAL" : "SEVERE",
      summary: `governance integrity failed score=${score.integrity_score}`,
      baseline,
      guardrailsHash: guardrailsHash ?? "",
      governanceFingerprint: stableObjectHash({
        defaultsHash: defaultsHash ?? "",
        baselineHash: baseline.baseline_hash ?? "",
        guardrailsHash: guardrailsHash ?? ""
      }),
      defaultsHash: defaultsHash ?? "",
      triageTags: [...new Set(flags)],
      recommendationTags: [
        autoBlockActive ? "block mutating governance operations" : "",
        autoFreezeRecommended ? "freeze recommended" : ""
      ].filter(Boolean),
      retryAmplification: 0,
      breakerOpenRate: 0,
      sloEventsPath: resolvePath(args.rootDir, env.SLO_EVENTS_JSONL_PATH ?? "ops/slo/loadrun_events.jsonl")
    });
    writeIncidentBundle({
      incidentDir: resolvePath(args.rootDir, "ops/incidents"),
      bundle: incident
    });
  }

  writeControlPatch({
    controlsPath: paths.controls,
    integrityBlock: autoBlockActive,
    freeze: autoFreezeOnCritical && score.critical ? true : false,
    autoFreezeRecommended,
    score: score.integrity_score,
    flags: [...new Set(flags)],
    reason: passed ? "governance self-check pass" : "governance self-check fail"
  });

  const result = governanceSelfCheckResultSchema.parse({
    ts: nowIso,
    target_id: args.targetId,
    passed,
    integrity_score: score.integrity_score,
    flags: [...new Set(flags)],
    warnings,
    errors,
    evidence: {
      contracts_version: contractsVersion,
      contract_signature_kid: contractKid,
      ledger_head_hash: ledgerVerify.head_hash,
      keyring_kids: keyringKids,
      guardrails_hash: guardrailsHash,
      baseline_hash: baselineHash,
      defaults_hash: defaultsHash,
      last_rollover_ts: retention.lastRolloverTs,
      immutable_sink: immutableSink
    },
    last_self_check_event_id: lastSelfCheckEventId,
    auto_block_active: autoBlockActive,
    auto_freeze_recommended: autoFreezeRecommended
  });

  fs.mkdirSync(path.dirname(paths.status), { recursive: true });
  fs.writeFileSync(paths.status, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  return result;
}

export function readGovernanceSelfCheckStatus(args: {
  rootDir: string;
  env?: NodeJS.ProcessEnv;
}): GovernanceSelfCheckResult | null {
  const env = args.env ?? process.env;
  const statusPath = resolvePath(
    args.rootDir,
    env.POLICY_GOVERNANCE_INTEGRITY_STATUS_PATH ?? "ops/incidents/governance_integrity_status.json"
  );
  if (!fs.existsSync(statusPath)) return null;
  try {
    return governanceSelfCheckResultSchema.parse(JSON.parse(fs.readFileSync(statusPath, "utf8")));
  } catch {
    return null;
  }
}
