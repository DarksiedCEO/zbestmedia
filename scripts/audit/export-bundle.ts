import path from "node:path";

import { exportAuditBundle } from "../../packages/policy-sdk/src/audit/exportBundle";

type CliArgs = {
  from: string;
  to: string;
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
  const from = args.get("from");
  const to = args.get("to");
  const targetId = args.get("target");
  if (!from || !to || !targetId) {
    throw new Error("Usage: pnpm ops:audit:export-bundle --from <iso> --to <iso> --target <target_id> [--out <dir>]");
  }
  return {
    from,
    to,
    targetId,
    out: args.get("out") ?? `ops/audit/exports/${new Date().toISOString().replace(/[:.]/g, "-")}__bundle`
  };
}

function main(): void {
  const cli = parseArgs(process.argv);
  const out = path.resolve(process.cwd(), cli.out);
  const result = exportAuditBundle({
    rootDir: process.cwd(),
    from: cli.from,
    to: cli.to,
    targetId: cli.targetId,
    outDir: out
  });
  console.log(JSON.stringify(result, null, 2));
}

main();
