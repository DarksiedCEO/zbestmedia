import fs from "node:fs";
import path from "node:path";

import { loadRuntimeDefaults } from "../../packages/policy-sdk/src/loadrun/defaults";
import { buildDefaultsProposal } from "../../packages/policy-sdk/src/loadrun/propose";
import type { LoadRunReportPayload } from "../../packages/policy-sdk/src/loadrun/report";

type CliArgs = {
  report: string;
  current: string;
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
  const report = args.get("report");
  const current = args.get("current") ?? "packages/policy-sdk/src/defaults/runtime.defaults.json";
  const outDir = args.get("outDir") ?? "ops/load_runs/proposals";
  if (!report) {
    throw new Error("Usage: pnpm ops:loadrun:propose-defaults --report <analysis.json> [--current <defaults.json>] [--outDir <dir>]");
  }
  return { report, current, outDir };
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
  const reportPath = path.resolve(process.cwd(), cli.report);
  const currentPath = path.resolve(process.cwd(), cli.current);
  const outDir = path.resolve(process.cwd(), cli.outDir);
  const reportRaw = fs.readFileSync(reportPath, "utf8");
  const currentRaw = fs.readFileSync(currentPath, "utf8");
  const report = JSON.parse(reportRaw) as LoadRunReportPayload;
  const current = loadRuntimeDefaults(currentPath);
  const proposal = buildDefaultsProposal({
    report,
    reportFile: reportPath,
    reportRaw,
    currentFile: currentPath,
    currentRaw,
    current
  });

  fs.mkdirSync(outDir, { recursive: true });
  const filePath = path.join(outDir, `${timestampSlug(new Date())}__defaults-proposal.json`);
  fs.writeFileSync(filePath, `${JSON.stringify(proposal, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ proposal_file: filePath, guardrails_passed: proposal.guardrails.passed, no_change: proposal.no_change }, null, 2));
}

main();
