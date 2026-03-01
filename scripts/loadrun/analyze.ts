import fs from "node:fs";
import path from "node:path";

import { compareRuns } from "../../packages/policy-sdk/src/loadrun/compare";
import { recommendDefaults } from "../../packages/policy-sdk/src/loadrun/recommend";
import { writeReports } from "../../packages/policy-sdk/src/loadrun/report";
import { parseLoadRun } from "../../packages/policy-sdk/src/loadrun/schema";
import { computeSlices } from "../../packages/policy-sdk/src/loadrun/slice";

type CliArgs = {
  baseline: string;
  chaos: string;
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
  const chaos = args.get("chaos");
  const outDir = args.get("outDir") ?? "ops/load_runs/reports";
  if (!baseline || !chaos) {
    throw new Error("Usage: pnpm ops:loadrun:analyze --baseline <file.json> --chaos <file.json> [--outDir <dir>]");
  }

  return { baseline, chaos, outDir };
}

function loadJsonFile(filePath: string): unknown {
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw);
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
  const args = parseArgs(process.argv);
  const baselinePath = path.resolve(process.cwd(), args.baseline);
  const chaosPath = path.resolve(process.cwd(), args.chaos);
  const outDir = path.resolve(process.cwd(), args.outDir);

  const baseline = parseLoadRun(loadJsonFile(baselinePath));
  const chaos = parseLoadRun(loadJsonFile(chaosPath));

  const comparison = compareRuns(computeSlices(baseline), computeSlices(chaos));
  const recommendation = recommendDefaults(comparison);

  const generatedAt = new Date().toISOString();
  const basename = `${timestampSlug(new Date())}__baseline-vs-chaos`;
  const report = {
    generated_at: generatedAt,
    baseline_file: baselinePath,
    chaos_file: chaosPath,
    comparison,
    recommendation
  };

  const output = writeReports({
    reportDir: outDir,
    basename,
    payload: report
  });

  console.log(JSON.stringify({ report_json: output.jsonPath, report_markdown: output.markdownPath }, null, 2));
}

main();
