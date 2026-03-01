import fs from "node:fs";
import path from "node:path";

type ControlFile = {
  freeze?: boolean;
  runtime_kill_switch?: boolean;
  updated_at?: string;
  reason?: string;
};

function readControlFile(env: Record<string, string | undefined>): ControlFile {
  const filePath = path.resolve(process.cwd(), env.POLICY_CONTROLS_PATH ?? "ops/incidents/controls.json");
  if (!fs.existsSync(filePath)) return {};
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as ControlFile;
  } catch {
    return {};
  }
}

export function isGovernanceFreezeEnabled(env: Record<string, string | undefined> = process.env): boolean {
  const envFlag = String(env.POLICY_GOVERNANCE_FREEZE ?? "").toLowerCase() === "true";
  if (envFlag) return true;
  return readControlFile(env).freeze === true;
}

export function isRuntimeKillSwitchEnabled(env: Record<string, string | undefined> = process.env): boolean {
  const envFlag = String(env.POLICY_RUNTIME_KILL_SWITCH ?? "").toLowerCase() === "true";
  if (envFlag) return true;
  return readControlFile(env).runtime_kill_switch === true;
}

export function assertGovernanceMutableOperationAllowed(args: {
  env?: Record<string, string | undefined>;
  operation: string;
}): void {
  if (!isGovernanceFreezeEnabled(args.env ?? process.env)) return;
  throw new Error(`GOVERNANCE_FREEZE_ACTIVE: operation blocked (${args.operation})`);
}
