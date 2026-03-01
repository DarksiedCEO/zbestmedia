import fs from "node:fs";
import path from "node:path";

import { runDrill, writeDrillArtifacts, type DrillProfile } from "../../packages/policy-sdk/src/ops/drill";

type CliArgs = {
  profile: DrillProfile;
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
  const profile = (args.get("profile") ?? "fortress") as DrillProfile;
  if (!["fortress", "audit-only", "canary-only", "incident-only"].includes(profile)) {
    throw new Error(`Invalid --profile ${profile}`);
  }
  const targetId = args.get("target") ?? "prod/us-west/policy";
  const out = args.get("out") ?? `ops/drills/${new Date().toISOString().replace(/[:.]/g, "-")}`;
  return { profile, targetId, out };
}

function main(): void {
  const cli = parseArgs(process.argv);
  const outDir = path.resolve(process.cwd(), cli.out);
  const result = runDrill({
    profile: cli.profile,
    targetId: cli.targetId,
    outDir
  });
  fs.mkdirSync(path.resolve(outDir, "artifacts"), { recursive: true });
  writeDrillArtifacts({
    result,
    stepsPath: path.resolve(outDir, "steps.jsonl"),
    drillPath: path.resolve(outDir, "drill.json"),
    resultsMdPath: path.resolve(outDir, "results.md")
  });
  console.log(
    JSON.stringify(
      {
        out: outDir,
        passed: result.passed,
        step_count: result.steps.length
      },
      null,
      2
    )
  );
  if (!result.passed) process.exit(1);
}

main();
