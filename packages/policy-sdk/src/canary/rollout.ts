import fs from "node:fs";

import { parseCanaryRollout, type CanaryRollout } from "./types";

export function readCanaryRollout(filePath: string): CanaryRollout {
  return parseCanaryRollout(JSON.parse(fs.readFileSync(filePath, "utf8")));
}

export function writeCanaryRollout(filePath: string, rollout: CanaryRollout): void {
  fs.writeFileSync(filePath, `${JSON.stringify(rollout, null, 2)}\n`, "utf8");
}

export function abortCanaryRollout(args: {
  rollout: CanaryRollout;
  approved: boolean;
  reason?: string;
}): CanaryRollout {
  if (!args.approved) {
    throw new Error("Approval required: pass --approve");
  }
  if (!args.reason || args.reason.trim().length < 3) {
    throw new Error("Approval reason required: pass --reason \"...\"");
  }
  if (["DONE", "FAILED", "ABORTED"].includes(args.rollout.status)) {
    return args.rollout;
  }

  args.rollout.transitions.push({
    at: new Date().toISOString(),
    from: args.rollout.state,
    to: "FAILED",
    reason: `manual_abort:${args.reason}`,
    metadata: { manual_abort: true }
  });
  args.rollout.state = "FAILED";
  args.rollout.status = "ABORTED";
  args.rollout.failure_reason = `manual_abort:${args.reason}`;
  args.rollout.finished_at = new Date().toISOString();
  return parseCanaryRollout(args.rollout);
}
