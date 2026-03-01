import fs from "node:fs";
import path from "node:path";

import { parseTargetId } from "./target";

export type DeployWindow = {
  target: string;
  start_utc: string;
  end_utc: string;
  reason: string;
};

export type DeployWindowsConfig = {
  windows: DeployWindow[];
};

function targetMatches(pattern: string, targetId: string): boolean {
  if (pattern === "*") return true;
  if (pattern === targetId) return true;
  const p = pattern.split("/");
  const t = targetId.split("/");
  if (p.length !== t.length) return false;
  for (let i = 0; i < p.length; i += 1) {
    if (p[i] !== "*" && p[i] !== t[i]) return false;
  }
  return true;
}

export function loadDeployWindowsConfig(
  filePath = path.resolve(process.cwd(), "ops/windows/deploy_windows.json")
): DeployWindowsConfig {
  if (!fs.existsSync(filePath)) return { windows: [] };
  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as DeployWindowsConfig;
  return { windows: parsed.windows ?? [] };
}

export function resolveActiveDeployWindow(args: {
  targetId: string;
  now?: Date;
  windows?: DeployWindow[];
}): DeployWindow | null {
  const now = args.now ?? new Date();
  const targetId = parseTargetId(args.targetId);
  for (const window of args.windows ?? []) {
    if (!targetMatches(window.target, targetId)) continue;
    const start = Date.parse(window.start_utc);
    const end = Date.parse(window.end_utc);
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    if (now.getTime() >= start && now.getTime() <= end) return window;
  }
  return null;
}
