import fs from "node:fs";
import path from "node:path";

import { loadBaselineRegistry } from "../../packages/policy-sdk/src/loadrun/baselineRegistry";
import { evaluateCiGate } from "../../packages/policy-sdk/src/loadrun/ciGate";
import { buildCiGateMarkdownSummary } from "../../packages/policy-sdk/src/loadrun/markdownSummary";
import { parseLoadRun } from "../../packages/policy-sdk/src/loadrun/schema";
import { computeSlices } from "../../packages/policy-sdk/src/loadrun/slice";
import { buildLoadRunSloEvent, emitLoadRunSloEvent } from "../../packages/policy-sdk/src/slo/emit";

type CliArgs = {
  baseline: string;
  candidate: string;
  outDir: string;
  registry: string;
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
  const baseline = args.get("baseline");
  const candidate = args.get("candidate");
  if (!baseline || !candidate) {
    throw new Error(
      "Usage: pnpm ops:loadrun:ci-gate --baseline <run.json> --candidate <run.json> [--outDir <dir>] [--registry <path>]"
    );
  }
  return {
    baseline,
    candidate,
    outDir: args.get("outDir") ?? "ops/load_runs/ci",
    registry: args.get("registry") ?? "ops/load_runs/baselines/registry.json"
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
  const baselinePath = path.resolve(process.cwd(), cli.baseline);
  const candidatePath = path.resolve(process.cwd(), cli.candidate);
  const registryPath = path.resolve(process.cwd(), cli.registry);

  const baseline = parseLoadRun(JSON.parse(fs.readFileSync(baselinePath, "utf8")));
  const candidate = parseLoadRun(JSON.parse(fs.readFileSync(candidatePath, "utf8")));
  const gate = evaluateCiGate({
    baseline: computeSlices(baseline),
    candidate: computeSlices(candidate)
  });

  const registry = fs.existsSync(registryPath) ? loadBaselineRegistry(registryPath) : null;

  const event = buildLoadRunSloEvent({
    source: "ci",
    service: "policy",
    baselinePath,
    candidatePath,
    gate,
    baselineConcurrency: baseline.config.concurrency,
    candidateConcurrency: candidate.config.concurrency,
    baselineRegistry: registry
  });

  await emitLoadRunSloEvent({
    event,
    sink: (process.env.SLO_SINK as "file" | "postgres" | undefined) ?? "file",
    jsonlPath: path.resolve(process.cwd(), process.env.SLO_EVENTS_JSONL_PATH ?? "ops/slo/loadrun_events.jsonl"),
    archiveDir: path.resolve(process.cwd(), process.env.SLO_ARCHIVE_DIR ?? "ops/slo/archive"),
    postgresUrl: process.env.SLO_POSTGRES_URL
  });

  const outDir = path.resolve(process.cwd(), cli.outDir);
  fs.mkdirSync(outDir, { recursive: true });
  const base = `${timestampSlug(new Date())}__ci-gate`;
  const jsonPath = path.join(outDir, `${base}.json`);
  const mdPath = path.join(outDir, `${base}.md`);
  fs.writeFileSync(
    jsonPath,
    `${JSON.stringify({ baseline: baselinePath, candidate: candidatePath, gate, slo_event_id: event.event_id }, null, 2)}\n`,
    "utf8"
  );
  fs.writeFileSync(mdPath, `${buildCiGateMarkdownSummary({ baselineFile: baselinePath, candidateFile: candidatePath, gate })}\n`, "utf8");

  console.log(JSON.stringify({ passed: gate.passed, output_json: jsonPath, output_md: mdPath, slo_event_id: event.event_id }, null, 2));
  if (!gate.passed) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
