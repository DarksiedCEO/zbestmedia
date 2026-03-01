import path from "node:path";

import { acceptBaseline } from "../../packages/policy-sdk/src/loadrun/acceptBaseline";

type CliArgs = {
  candidateReport: string;
  baselinesDir: string;
  registryPath: string;
  by: string;
  note: string;
  approve: boolean;
  reason?: string;
};

function parseArgs(argv: string[]): CliArgs {
  const args = new Map<string, string>();
  const flags = new Set<string>();
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    if (key === "approve") {
      flags.add("approve");
      continue;
    }
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for --${key}`);
    }
    args.set(key, value);
    i += 1;
  }

  const candidateReport = args.get("candidate-report");
  if (!candidateReport) {
    throw new Error(
      "Usage: pnpm ops:loadrun:accept-baseline --candidate-report <report.json> --by <name> --note <text> --approve --reason \"...\""
    );
  }

  return {
    candidateReport,
    baselinesDir: args.get("baselinesDir") ?? "ops/load_runs/baselines",
    registryPath: args.get("registry") ?? "ops/load_runs/baselines/registry.json",
    by: args.get("by") ?? "",
    note: args.get("note") ?? "",
    approve: flags.has("approve"),
    reason: args.get("reason")
  };
}

function main(): void {
  const cli = parseArgs(process.argv);
  const result = acceptBaseline({
    reportPath: path.resolve(process.cwd(), cli.candidateReport),
    baselinesDir: path.resolve(process.cwd(), cli.baselinesDir),
    registryPath: path.resolve(process.cwd(), cli.registryPath),
    by: cli.by,
    note: cli.note,
    approved: cli.approve,
    reason: cli.reason
  });
  console.log(JSON.stringify(result, null, 2));
}

main();
