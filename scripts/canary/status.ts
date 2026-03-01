import fs from "node:fs";
import path from "node:path";

import { readCanaryRollout } from "../../packages/policy-sdk/src/canary/rollout";

function parseArgs(argv: string[]): { rollout: string } {
  const idx = argv.indexOf("--rollout");
  if (idx < 0 || !argv[idx + 1]) {
    throw new Error("Usage: pnpm ops:canary:status --rollout <rollout.json>");
  }
  return { rollout: argv[idx + 1] };
}

function main(): void {
  const cli = parseArgs(process.argv);
  const rolloutPath = path.resolve(process.cwd(), cli.rollout);
  if (!fs.existsSync(rolloutPath)) {
    throw new Error(`Rollout file not found: ${rolloutPath}`);
  }
  const rollout = readCanaryRollout(rolloutPath);
  console.log(
    JSON.stringify(
      {
        rollout_id: rollout.rollout_id,
        plan_id: rollout.plan_id,
        status: rollout.status,
        state: rollout.state,
        current_step: rollout.current_step,
        transitions: rollout.transitions.length,
        failure_reason: rollout.failure_reason,
        rollback_artifact: rollout.rollback_artifact
      },
      null,
      2
    )
  );
}

main();
