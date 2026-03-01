import fs from "node:fs";
import path from "node:path";

import { abortCanaryRollout, readCanaryRollout, writeCanaryRollout } from "../../packages/policy-sdk/src/canary/rollout";

function parseArgs(argv: string[]): { rollout: string; approve: boolean; reason?: string } {
  const args = new Map<string, string>();
  const flags = new Set<string>();
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    if (key === "approve") {
      flags.add(key);
      continue;
    }
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for --${key}`);
    args.set(key, value);
    i += 1;
  }

  const rollout = args.get("rollout");
  if (!rollout) {
    throw new Error("Usage: pnpm ops:canary:abort --rollout <rollout.json> --approve --reason <text>");
  }

  return {
    rollout,
    approve: flags.has("approve"),
    reason: args.get("reason")
  };
}

function main(): void {
  const cli = parseArgs(process.argv);
  const rolloutPath = path.resolve(process.cwd(), cli.rollout);
  if (!fs.existsSync(rolloutPath)) {
    throw new Error(`Rollout file not found: ${rolloutPath}`);
  }

  const rollout = readCanaryRollout(rolloutPath);
  const aborted = abortCanaryRollout({ rollout, approved: cli.approve, reason: cli.reason });
  writeCanaryRollout(rolloutPath, aborted);
  console.log(
    JSON.stringify(
      {
        rollout: rolloutPath,
        status: aborted.status,
        state: aborted.state,
        failure_reason: aborted.failure_reason
      },
      null,
      2
    )
  );
}

main();
