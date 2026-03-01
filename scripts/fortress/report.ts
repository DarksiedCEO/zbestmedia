import path from "node:path";

import { buildFortressReport } from "../../packages/policy-sdk/src/ops/fortressReport";

type CliArgs = {
  targetId: string;
  out: string;
};

function parseArgs(argv: string[]): CliArgs {
  const args = new Map<string, string>();
  for (let i = 2; i < argv.length; i += 1) {
    const t = argv[i];
    if (!t.startsWith("--")) continue;
    const key = t.slice(2);
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for --${key}`);
    args.set(key, value);
    i += 1;
  }
  return {
    targetId: args.get("target") ?? "prod/us-west/policy",
    out: args.get("out") ?? `ops/fortress_reports/${new Date().toISOString().replace(/[:.]/g, "-")}`
  };
}

function main(): void {
  const cli = parseArgs(process.argv);
  const result = buildFortressReport({
    rootDir: process.cwd(),
    outDir: path.resolve(process.cwd(), cli.out),
    targetId: cli.targetId
  });
  console.log(JSON.stringify(result, null, 2));
}

main();
