import fs from "node:fs";
import path from "node:path";

import { runGovernanceSelfCheck } from "../../packages/policy-sdk/src/governance/selfCheck";

type CliArgs = {
  targetId: string;
  strict: boolean;
  outDir: string;
};

function parseArgs(argv: string[]): CliArgs {
  const args = new Map<string, string>();
  const flags = new Set<string>();
  for (let i = 2; i < argv.length; i += 1) {
    const t = argv[i];
    if (!t.startsWith("--")) continue;
    const key = t.slice(2);
    if (key === "strict") {
      flags.add("strict");
      continue;
    }
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for --${key}`);
    args.set(key, value);
    i += 1;
  }
  return {
    targetId: args.get("target") ?? process.env.LOADRUN_TARGET_ID ?? "prod/us-west/policy",
    strict: flags.has("strict"),
    outDir: args.get("outDir") ?? "ops/incidents"
  };
}

async function main(): Promise<void> {
  const cli = parseArgs(process.argv);
  const result = await runGovernanceSelfCheck({
    rootDir: process.cwd(),
    targetId: cli.targetId,
    strict: cli.strict
  });
  const outDir = path.resolve(process.cwd(), cli.outDir);
  fs.mkdirSync(outDir, { recursive: true });
  const out = path.join(outDir, `${new Date().toISOString().replace(/[:.]/g, "-")}__governance_self_check.json`);
  fs.writeFileSync(out, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ out, passed: result.passed, integrity_score: result.integrity_score, flags: result.flags }, null, 2));
  if (cli.strict && !result.passed) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
