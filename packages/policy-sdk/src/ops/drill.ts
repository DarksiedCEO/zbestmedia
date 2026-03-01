import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

export type DrillProfile = "fortress" | "audit-only" | "canary-only" | "incident-only";

export type DrillStep = {
  id: string;
  command: string;
  required: boolean;
};

export type DrillRunResult = {
  profile: DrillProfile;
  target_id: string;
  generated_at: string;
  out_dir: string;
  passed: boolean;
  steps: Array<{
    id: string;
    command: string;
    exit_code: number;
    duration_ms: number;
    required: boolean;
  }>;
};

export type DrillRunner = (command: string) => { exitCode: number; durationMs: number };

function defaultRunner(command: string): { exitCode: number; durationMs: number } {
  const started = Date.now();
  const proc = spawnSync(command, {
    shell: true,
    stdio: "inherit",
    env: process.env
  });
  return {
    exitCode: proc.status ?? 1,
    durationMs: Date.now() - started
  };
}

export function buildDrillSteps(args: { profile: DrillProfile; targetId: string }): DrillStep[] {
  const common: DrillStep[] = [
    { id: "targets_validate", command: "pnpm ops:targets:validate --strict", required: true },
    { id: "contracts_verify", command: "pnpm ops:contracts:verify --strict", required: true },
    { id: "ledger_verify_pre", command: "pnpm ops:audit:verify-ledger --strict", required: true },
    { id: "ledger_rollover", command: "pnpm ops:audit:rollover-ledger --approve --reason \"drill rollover\"", required: true },
    { id: "ledger_verify_post", command: "pnpm ops:audit:verify-ledger --strict", required: true },
    {
      id: "audit_export",
      command: `pnpm ops:audit:export-bundle --from 2026-01-01T00:00:00.000Z --to 2027-01-01T00:00:00.000Z --target ${args.targetId}`,
      required: true
    },
    { id: "immutable_push", command: "pnpm ops:audit:push-immutable", required: false }
  ];
  if (args.profile === "audit-only") return common;

  if (args.profile === "canary-only") {
    return [
      { id: "targets_validate", command: "pnpm ops:targets:validate --strict", required: true },
      { id: "canary_plan", command: "pnpm ops:canary:status --rollout ops/canary/rollouts/nonexistent.json", required: false }
    ];
  }

  if (args.profile === "incident-only") {
    return [
      { id: "targets_validate", command: "pnpm ops:targets:validate --strict", required: true },
      { id: "incident_status", command: "pnpm ops:incident:status", required: true }
    ];
  }

  return [
    ...common,
    {
      id: "prod_gate",
      command: `pnpm ops:loadrun:prod-gate --target ${args.targetId} --candidate packages/policy-sdk/test/fixtures/loadrun/chaos.sample.json --baseline packages/policy-sdk/test/fixtures/loadrun/baseline.sample.json --outDir ops/load_runs/prod/reports`,
      required: false
    },
    {
      id: "governance_snapshot",
      command: "pnpm ops:incident:status",
      required: true
    }
  ];
}

export function writeDrillArtifacts(args: {
  result: DrillRunResult;
  stepsPath: string;
  drillPath: string;
  resultsMdPath: string;
}): void {
  fs.mkdirSync(path.dirname(args.stepsPath), { recursive: true });
  fs.mkdirSync(path.dirname(args.drillPath), { recursive: true });
  fs.mkdirSync(path.dirname(args.resultsMdPath), { recursive: true });
  const lines = args.result.steps.map((step) => JSON.stringify(step)).join("\n");
  fs.writeFileSync(args.stepsPath, lines.length > 0 ? `${lines}\n` : "", "utf8");
  fs.writeFileSync(args.drillPath, `${JSON.stringify(args.result, null, 2)}\n`, "utf8");
  const md = [
    "# Fortress Drill Results",
    "",
    `- Profile: \`${args.result.profile}\``,
    `- Target: \`${args.result.target_id}\``,
    `- Passed: \`${args.result.passed}\``,
    "",
    "| Step | Exit | Required | Duration (ms) |",
    "| --- | ---: | :---: | ---: |",
    ...args.result.steps.map((s) => `| ${s.id} | ${s.exit_code} | ${s.required ? "yes" : "no"} | ${s.duration_ms} |`)
  ].join("\n");
  fs.writeFileSync(args.resultsMdPath, `${md}\n`, "utf8");
}

export function runDrill(args: {
  profile: DrillProfile;
  targetId: string;
  outDir: string;
  runner?: DrillRunner;
}): DrillRunResult {
  const steps = buildDrillSteps({ profile: args.profile, targetId: args.targetId });
  const run = args.runner ?? defaultRunner;
  const evaluated: DrillRunResult["steps"] = [];
  let passed = true;
  for (const step of steps) {
    const result = run(step.command);
    evaluated.push({
      id: step.id,
      command: step.command,
      required: step.required,
      exit_code: result.exitCode,
      duration_ms: result.durationMs
    });
    if (step.required && result.exitCode !== 0) {
      passed = false;
      break;
    }
  }
  return {
    profile: args.profile,
    target_id: args.targetId,
    generated_at: new Date().toISOString(),
    out_dir: args.outDir,
    passed,
    steps: evaluated
  };
}
