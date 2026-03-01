import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {
  parseBaselineRegistry,
  writeBaselineRegistry
} from "./baselineRegistry";
import { DEFAULT_TARGET_ID, parseTargetId } from "./target";
import { parseLoadRun } from "./schema";

type AnalyzeReport = {
  baseline_file: string;
};

export type AcceptBaselineArgs = {
  reportPath: string;
  baselinesDir: string;
  registryPath: string;
  targetId: string;
  by: string;
  note: string;
  approved: boolean;
  reason?: string;
};

export type AcceptBaselineResult = {
  registry: string;
  target_id: string;
  baseline_report_path: string;
  baseline_run_path: string;
};

function timestampSlug(date: Date): string {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const hh = String(date.getUTCHours()).padStart(2, "0");
  const mi = String(date.getUTCMinutes()).padStart(2, "0");
  const ss = String(date.getUTCSeconds()).padStart(2, "0");
  return `${yyyy}${mm}${dd}_${hh}${mi}${ss}`;
}

function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

export function acceptBaseline(args: AcceptBaselineArgs): AcceptBaselineResult {
  if (!args.approved) {
    throw new Error("Approval required: pass --approve");
  }
  if (!args.reason || args.reason.trim().length < 3) {
    throw new Error("Approval reason required: pass --reason \"...\"");
  }
  if (!args.by.trim()) {
    throw new Error("Missing --by");
  }
  const targetId = parseTargetId(args.targetId || DEFAULT_TARGET_ID);

  const reportRaw = fs.readFileSync(args.reportPath, "utf8");
  const report = JSON.parse(reportRaw) as AnalyzeReport;
  if (!report.baseline_file) {
    throw new Error("candidate report missing baseline_file");
  }

  const baselinePath = fs.existsSync(report.baseline_file)
    ? path.resolve(report.baseline_file)
    : path.resolve(process.cwd(), report.baseline_file);
  const baselineRaw = fs.readFileSync(baselinePath, "utf8");
  parseLoadRun(JSON.parse(baselineRaw));

  fs.mkdirSync(args.baselinesDir, { recursive: true });
  const stamp = timestampSlug(new Date());
  const acceptedReportPath = path.join(args.baselinesDir, `${stamp}__accepted-report.json`);
  const acceptedRunPath = path.join(args.baselinesDir, `${stamp}__accepted-baseline-run.json`);
  fs.writeFileSync(acceptedReportPath, `${JSON.stringify(JSON.parse(reportRaw), null, 2)}\n`, "utf8");
  fs.writeFileSync(acceptedRunPath, `${JSON.stringify(JSON.parse(baselineRaw), null, 2)}\n`, "utf8");

  const currentRegistry = fs.existsSync(args.registryPath)
    ? parseBaselineRegistry(JSON.parse(fs.readFileSync(args.registryPath, "utf8")))
    : parseBaselineRegistry({ version: 2, targets: {} });

  const entry = {
    baseline_report_path: path.relative(process.cwd(), acceptedReportPath),
    baseline_hash: sha256Hex(reportRaw),
    baseline_run_path: path.relative(process.cwd(), acceptedRunPath),
    accepted_at: new Date().toISOString(),
    accepted_by: args.by,
    notes: `${args.note} | reason=${args.reason}`,
    chaos_report_path: ""
  };

  const updated = {
    ...currentRegistry,
    version: 2 as const,
    targets: {
      ...currentRegistry.targets,
      [targetId]: entry
    }
  };
  writeBaselineRegistry(args.registryPath, updated);

  return {
    registry: args.registryPath,
    target_id: targetId,
    baseline_report_path: entry.baseline_report_path,
    baseline_run_path: entry.baseline_run_path
  };
}
