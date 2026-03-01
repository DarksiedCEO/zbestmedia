import fs from "node:fs";
import path from "node:path";

import { evaluateCiGate } from "../../packages/policy-sdk/src/loadrun/ciGate";
import { buildCiGateMarkdownSummary } from "../../packages/policy-sdk/src/loadrun/markdownSummary";
import { parseLoadRun } from "../../packages/policy-sdk/src/loadrun/schema";
import { computeSlices } from "../../packages/policy-sdk/src/loadrun/slice";

type CliArgs = {
  baseline: string;
  candidate: string;
  outDir: string;
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
    throw new Error("Usage: pnpm ops:loadrun:ci-gate --baseline <run.json> --candidate <run.json> [--outDir <dir>]");
  }
  return {
    baseline,
    candidate,
    outDir: args.get("outDir") ?? "ops/load_runs/ci"
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

function main(): void {
  const cli = parseArgs(process.argv);
  const baselinePath = path.resolve(process.cwd(), cli.baseline);
  const candidatePath = path.resolve(process.cwd(), cli.candidate);
  const baseline = parseLoadRun(JSON.parse(fs.readFileSync(baselinePath, "utf8")));
  const candidate = parseLoadRun(JSON.parse(fs.readFileSync(candidatePath, "utf8")));

  const gate = evaluateCiGate({
    baseline: computeSlices(baseline),
    candidate: computeSlices(candidate)
  });

  const outDir = path.resolve(process.cwd(), cli.outDir);
  fs.mkdirSync(outDir, { recursive: true });
  const base = `${timestampSlug(new Date())}__ci-gate`;
  const jsonPath = path.join(outDir, `${base}.json`);
  const mdPath = path.join(outDir, `${base}.md`);
  fs.writeFileSync(
    jsonPath,
    `${JSON.stringify({ baseline: baselinePath, candidate: candidatePath, gate }, null, 2)}\n`,
    "utf8"
  );
  fs.writeFileSync(mdPath, `${buildCiGateMarkdownSummary({ baselineFile: baselinePath, candidateFile: candidatePath, gate })}\n`, "utf8");

  console.log(JSON.stringify({ passed: gate.passed, output_json: jsonPath, output_md: mdPath }, null, 2));
  if (!gate.passed) {
    process.exit(1);
  }
}

main();
