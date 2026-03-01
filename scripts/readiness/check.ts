import fs from "node:fs";
import path from "node:path";

import { buildReadinessMarkdown, runReadinessCheck } from "../../packages/policy-sdk/src/ops/readiness";

type CliArgs = {
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
    strict: flags.has("strict"),
    outDir: args.get("outDir") ?? "ops/readiness"
  };
}

function main(): void {
  const cli = parseArgs(process.argv);
  const result = runReadinessCheck({
    rootDir: process.cwd(),
    strict: cli.strict,
    requireImmutableSink: String(process.env.POLICY_REQUIRE_IMMUTABLE_SINK ?? "false").toLowerCase() === "true"
  });
  const outDir = path.resolve(process.cwd(), cli.outDir);
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const jsonPath = path.join(outDir, `${stamp}__readiness.json`);
  const mdPath = path.join(outDir, `${stamp}__readiness.md`);
  fs.writeFileSync(jsonPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  fs.writeFileSync(mdPath, `${buildReadinessMarkdown(result)}\n`, "utf8");
  console.log(JSON.stringify({ passed: result.passed, json: jsonPath, md: mdPath }, null, 2));
  if (!result.passed) process.exit(1);
}

main();
