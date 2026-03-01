import fs from "node:fs";
import path from "node:path";

import { loadBaselineRegistry, resolveTargetBaselineEntry } from "../../packages/policy-sdk/src/loadrun/baselineRegistry";
import { evaluateCiGate } from "../../packages/policy-sdk/src/loadrun/ciGate";
import { loadGuardrailProfiles, resolveThresholdsForTarget } from "../../packages/policy-sdk/src/loadrun/guardrailProfiles";
import { buildCiGateMarkdownSummary } from "../../packages/policy-sdk/src/loadrun/markdownSummary";
import { parseLoadRun } from "../../packages/policy-sdk/src/loadrun/schema";
import { parseTargetId } from "../../packages/policy-sdk/src/loadrun/target";
import { computeSlices } from "../../packages/policy-sdk/src/loadrun/slice";
import { buildTriage } from "../../packages/policy-sdk/src/loadrun/triage";
import { buildLoadRunSloEvent, emitLoadRunSloEvent } from "../../packages/policy-sdk/src/slo/emit";

type CliArgs = {
  baseline?: string;
  candidate: string;
  outDir: string;
  registry: string;
  targetId: string;
  guardrailProfiles: string;
};

function parseArgs(argv: string[]): CliArgs {
  const args = new Map<string, string>();
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for --${key}`);
    }
    args.set(key, value);
    i += 1;
  }

  const candidate = args.get("candidate");
  if (!candidate) {
    throw new Error(
      "Usage: pnpm ops:loadrun:prod-gate --target <target_id> --candidate <run.json> [--baseline <run.json>] [--outDir <dir>] [--registry <path>] [--guardrail-profiles <path>]"
    );
  }

  const targetId = parseTargetId(args.get("target") ?? process.env.LOADRUN_TARGET_ID ?? "prod/us-west/policy");
  return {
    baseline: args.get("baseline"),
    candidate,
    outDir: args.get("outDir") ?? "ops/load_runs/prod/reports",
    registry: args.get("registry") ?? "ops/load_runs/baselines/registry.json",
    targetId,
    guardrailProfiles: args.get("guardrail-profiles") ?? "ops/guardrails/profiles.json"
  };
}

function timestampSlug(date: Date): string {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const hh = String(date.getUTCHours()).padStart(2, "0");
  const mi = String(date.getUTCMinutes()).padStart(2, "0");
  const ss = String(date.getUTCSeconds()).padStart(2, "0");
  return `${yyyy}${mm}${dd}_${hh}${mi}${ss}`;
}

async function main(): Promise<void> {
  const cli = parseArgs(process.argv);
  const registryPath = path.resolve(process.cwd(), cli.registry);
  const registry = loadBaselineRegistry(registryPath);
  const baselineEntry = resolveTargetBaselineEntry({ registry, targetId: cli.targetId, allowUnbaselinedStaging: false });

  const baselinePath = path.resolve(process.cwd(), cli.baseline ?? baselineEntry.baseline_run_path);
  const candidatePath = path.resolve(process.cwd(), cli.candidate);
  const outDir = path.resolve(process.cwd(), cli.outDir);
  const triageDir = path.resolve(path.dirname(outDir), "triage");

  const baseline = parseLoadRun(JSON.parse(fs.readFileSync(baselinePath, "utf8")));
  const candidate = parseLoadRun(JSON.parse(fs.readFileSync(candidatePath, "utf8")));

  const { profiles, hash: guardrailsHash } = loadGuardrailProfiles(path.resolve(process.cwd(), cli.guardrailProfiles));
  const resolvedProfile = resolveThresholdsForTarget({ targetId: cli.targetId, profiles });

  const gate = evaluateCiGate({
    baseline: computeSlices(baseline),
    candidate: computeSlices(candidate),
    thresholds: resolvedProfile.thresholds
  });

  fs.mkdirSync(outDir, { recursive: true });
  fs.mkdirSync(triageDir, { recursive: true });

  const stamp = timestampSlug(new Date());
  const reportBase = `${stamp}__prod-gate`;
  const reportJson = path.join(outDir, `${reportBase}.json`);
  const reportMd = path.join(outDir, `${reportBase}.md`);
  const verdictJson = path.join(outDir, `${reportBase}.verdict.json`);

  let triagePath = "";
  let triageTags: string[] = [];
  if (!gate.passed) {
    const triage = buildTriage({ gate, baselineRegistryEntry: baselineEntry, targetId: cli.targetId });
    triagePath = path.join(triageDir, `${stamp}__triage.json`);
    fs.writeFileSync(triagePath, `${JSON.stringify(triage, null, 2)}\n`, "utf8");
    triageTags = triage.tags;
  }

  const sloEvent = buildLoadRunSloEvent({
    source: "prod",
    service: "policy",
    targetId: cli.targetId,
    baselinePath,
    candidatePath,
    gate,
    baselineConcurrency: baseline.config.concurrency,
    candidateConcurrency: candidate.config.concurrency,
    baselineRegistryEntry: baselineEntry,
    tags: triageTags
  });

  await emitLoadRunSloEvent({
    event: sloEvent,
    sink: (process.env.SLO_SINK as "file" | "postgres" | undefined) ?? "file",
    jsonlPath: path.resolve(process.cwd(), process.env.SLO_EVENTS_JSONL_PATH ?? "ops/slo/loadrun_events.jsonl"),
    archiveDir: path.resolve(process.cwd(), process.env.SLO_ARCHIVE_DIR ?? "ops/slo/archive"),
    postgresUrl: process.env.SLO_POSTGRES_URL
  });

  const reportPayload = {
    generated_at: new Date().toISOString(),
    target_id: cli.targetId,
    baseline_file: baselinePath,
    baseline_hash: baselineEntry.baseline_hash || null,
    candidate_file: candidatePath,
    guardrails_profile_key: resolvedProfile.profileKey,
    guardrails_profile_hash: guardrailsHash,
    gate,
    slo_event_id: sloEvent.event_id
  };

  fs.writeFileSync(reportJson, `${JSON.stringify(reportPayload, null, 2)}\n`, "utf8");
  fs.writeFileSync(reportMd, `${buildCiGateMarkdownSummary({ baselineFile: baselinePath, candidateFile: candidatePath, gate })}\n`, "utf8");

  const verdict = {
    target_id: cli.targetId,
    passed: gate.passed,
    reasons: gate.checks.filter((check) => !check.passed).map((check) => ({ name: check.name, details: check.details })),
    deltas: {
      p95_ratio: gate.baseline.latencyMs.p95 > 0 ? gate.candidate.latencyMs.p95 / gate.baseline.latencyMs.p95 : null,
      p99_ratio: gate.baseline.latencyMs.p99 > 0 ? gate.candidate.latencyMs.p99 / gate.baseline.latencyMs.p99 : null,
      fail_rate_increase_pct_points: (gate.candidate.failRate - gate.baseline.failRate) * 100,
      timeout_increase_pct_points: ((gate.candidate.timeoutErrors - gate.baseline.timeoutErrors) / Math.max(1, gate.baseline.totalRequests)) * 100,
      breaker_open_increase_pct_points: (gate.candidate.breakerOpenRate - gate.baseline.breakerOpenRate) * 100,
      retry_amplification_increase: gate.candidate.retryAmplification - gate.baseline.retryAmplification
    },
    outputs: {
      report_json: reportJson,
      report_md: reportMd,
      triage_json: triagePath || null
    },
    slo_event_id: sloEvent.event_id
  };

  fs.writeFileSync(verdictJson, `${JSON.stringify(verdict, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ ...verdict, verdict_json: verdictJson }, null, 2));
  if (!gate.passed) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
