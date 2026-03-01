import fs from "node:fs";
import path from "node:path";

type ControlFile = {
  freeze?: boolean;
  runtime_kill_switch?: boolean;
  integrity_block?: boolean;
  auto_freeze_recommended?: boolean;
  integrity_score?: number;
  integrity_flags?: string[];
  last_self_check_ts?: string;
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

function readIntegrityStatus(env: Record<string, string | undefined>): {
  passed?: boolean;
  auto_block_active?: boolean;
  integrity_score?: number;
} {
  const filePath = path.resolve(
    process.cwd(),
    env.POLICY_GOVERNANCE_INTEGRITY_STATUS_PATH ?? "ops/incidents/governance_integrity_status.json"
  );
  if (!fs.existsSync(filePath)) return {};
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as {
      passed?: boolean;
      auto_block_active?: boolean;
      integrity_score?: number;
    };
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
  const env = args.env ?? process.env;
  if (isGovernanceFreezeEnabled(env)) {
    throw new Error(`GOVERNANCE_FREEZE_ACTIVE: operation blocked (${args.operation})`);
  }

  const controls = readControlFile(env);
  const integrity = readIntegrityStatus(env);
  const autoBlockEnabled = String(env.GOVERNANCE_AUTO_BLOCK_ON_FAIL ?? "true").toLowerCase() === "true";
  const blocked =
    autoBlockEnabled &&
    (controls.integrity_block === true || integrity.auto_block_active === true || (integrity.passed === false && controls.freeze !== true));
  if (blocked) {
    throw new Error(
      `GOVERNANCE_INTEGRITY_BLOCK_ACTIVE: operation blocked (${args.operation}) score=${integrity.integrity_score ?? "unknown"}`
    );
  }
}
