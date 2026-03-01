import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { parseBaselineRegistry, resolveTargetBaselineEntry } from "../../packages/policy-sdk/src/loadrun/baselineRegistry";
import { executeCanaryRollout } from "../../packages/policy-sdk/src/canary/execute";
import { parseCanaryObservation, parseCanaryPlan, type CanaryObservation, type CanaryStep } from "../../packages/policy-sdk/src/canary/types";

type CliArgs = {
  plan: string;
  approve: boolean;
  reason?: string;
  mode: "simulation" | "manual_apply" | "live";
  observations?: string;
  target?: string;
  authToken?: string;
  introspectionUrl?: string;
  introspectionToken?: string;
};

type ObservationMap = Partial<Record<CanaryStep, Omit<CanaryObservation, "step">>>;
type ProdGateReport = {
  baseline_hash?: string | null;
  guardrails_profile_hash?: string;
};

function parseArgs(argv: string[]): CliArgs {
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

  const plan = args.get("plan");
  if (!plan) {
    throw new Error(
      "Usage: pnpm ops:canary:execute --plan <plan.json> --approve --reason <text> [--mode simulation|manual_apply|live] [--observations <json>]"
    );
  }

  const rawMode = args.get("mode") ?? "simulation";
  if (!["simulation", "manual_apply", "live"].includes(rawMode)) {
    throw new Error(`Invalid --mode ${rawMode}`);
  }

  return {
    plan,
    approve: flags.has("approve"),
    reason: args.get("reason"),
    mode: rawMode as CliArgs["mode"],
    observations: args.get("observations"),
    target: args.get("target") ?? process.env.POLICY_BASE_URL,
    authToken: args.get("auth-token") ?? process.env.POLICY_AUTH_TOKEN,
    introspectionUrl: args.get("introspection-url"),
    introspectionToken: args.get("introspection-token")
  };
}

function latestFile(patternDir: string, suffix: string): string | null {
  if (!fs.existsSync(patternDir)) return null;
  const files = fs
    .readdirSync(patternDir)
    .filter((name) => name.endsWith(suffix))
    .map((name) => path.join(patternDir, name))
    .sort();
  return files[files.length - 1] ?? null;
}

async function fetchFingerprint(url: string, authToken: string | undefined, introspectionToken: string): Promise<string> {
  const res = await fetch(url, {
    method: "GET",
    headers: {
      ...(authToken ? { authorization: `Bearer ${authToken}` } : {}),
      "x-policy-introspection-token": introspectionToken
    }
  });
  if (!res.ok) {
    throw new Error(`introspection_failed status=${res.status}`);
  }
  const body = (await res.json()) as { governance_fingerprint?: string };
  if (!body.governance_fingerprint) {
    throw new Error("introspection_missing_governance_fingerprint");
  }
  return body.governance_fingerprint;
}

function parseObservationMap(filePath: string | undefined): ObservationMap {
  if (!filePath) return {};
  const raw = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), filePath), "utf8")) as Record<string, unknown>;
  const out: ObservationMap = {};
  for (const key of Object.keys(raw)) {
    const step = Number(key) as CanaryStep;
    if ([5, 25, 50, 100].includes(step)) {
      out[step] = raw[key] as Omit<CanaryObservation, "step">;
    }
  }
  return out;
}

async function main(): Promise<void> {
  const cli = parseArgs(process.argv);
  const planPath = path.resolve(process.cwd(), cli.plan);
  const plan = parseCanaryPlan(JSON.parse(fs.readFileSync(planPath, "utf8")));

  const observationMap = parseObservationMap(cli.observations);
  const rolloutsDir = path.resolve(process.cwd(), "ops/canary/rollouts");
  const rollbacksDir = path.resolve(process.cwd(), "ops/canary/rollbacks");

  const rollout = await executeCanaryRollout({
    plan,
    rolloutsDir,
    rollbacksDir,
    approved: cli.approve,
    reason: cli.reason,
    mode: cli.mode === "live" ? "manual_apply" : cli.mode,
    applyStep: async (step) => {
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const artifactPath = path.join(rolloutsDir, `${stamp}__apply_${step}.json`);
      const payload = {
        generated_at: new Date().toISOString(),
        step,
        mode: cli.mode,
        target_id: plan.target_id,
        note:
          cli.mode === "manual_apply"
            ? "manual apply required: generate env/deploy instruction"
            : cli.mode === "live"
              ? "live mode uses existing runtime; no in-process apply executed"
              : "simulation apply"
      };
      fs.mkdirSync(path.dirname(artifactPath), { recursive: true });
      fs.writeFileSync(artifactPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
      return { artifactPath };
    },
    observeStep: async (step) => {
      if (cli.mode !== "live") {
        const item = observationMap[step] ?? {
          drift_passed: true,
          error_rate_passed: true,
          current_governance_fingerprint: plan.expected_governance_fingerprint,
          reasons: []
        };
        return parseCanaryObservation({ step, ...item });
      }

      if (!cli.target) {
        throw new Error("live mode requires --target or POLICY_BASE_URL");
      }

      const candidate = path.resolve(process.cwd(), `ops/canary/rollouts/${new Date().toISOString().replace(/[:.]/g, "-")}__candidate_${step}.json`);
      execSync(`pnpm ops:loadrun:prod-canary --target ${JSON.stringify(cli.target)} --out ${JSON.stringify(candidate)}`, {
        stdio: "inherit"
      });

      const registry = JSON.parse(
        fs.readFileSync(path.resolve(process.cwd(), "ops/load_runs/baselines/registry.json"), "utf8")
      );
      const baselineRunPath = resolveTargetBaselineEntry({
        registry: parseBaselineRegistry(registry),
        targetId: plan.target_id,
        allowUnbaselinedStaging: false
      }).baseline_run_path;
      if (!baselineRunPath) {
        throw new Error("baseline_run_path missing in registry");
      }

      let driftPassed = true;
      let configHashesPassed = true;
      try {
        execSync(
          `pnpm ops:loadrun:prod-gate --target ${JSON.stringify(plan.target_id)} --baseline ${JSON.stringify(baselineRunPath)} --candidate ${JSON.stringify(candidate)} --outDir ${JSON.stringify(
            "ops/load_runs/prod/reports"
          )}`,
          { stdio: "inherit" }
        );
        const reportPath = latestFile(path.resolve(process.cwd(), "ops/load_runs/prod/reports"), "__prod-gate.json");
        if (reportPath) {
          const report = JSON.parse(fs.readFileSync(reportPath, "utf8")) as ProdGateReport;
          const baselineHash = report.baseline_hash ?? "";
          const guardrailsHash = report.guardrails_profile_hash ?? "";
          configHashesPassed = baselineHash === plan.baseline_hash && guardrailsHash === plan.guardrails_profile_hash;
        }
      } catch {
        driftPassed = false;
      }

      let fingerprint = plan.expected_governance_fingerprint;
      if (cli.introspectionUrl && cli.introspectionToken) {
        fingerprint = await fetchFingerprint(cli.introspectionUrl, cli.authToken, cli.introspectionToken);
      }

      const verdictPath = latestFile(path.resolve(process.cwd(), "ops/load_runs/prod/reports"), ".verdict.json");
      let errorRatePassed = true;
      if (verdictPath) {
        const verdict = JSON.parse(fs.readFileSync(verdictPath, "utf8")) as {
          deltas?: { fail_rate_increase_pct_points?: number };
        };
        errorRatePassed = (verdict.deltas?.fail_rate_increase_pct_points ?? 0) <= 0.25;
      }

      return parseCanaryObservation({
        step,
        drift_passed: driftPassed && configHashesPassed,
        error_rate_passed: errorRatePassed,
        current_governance_fingerprint: fingerprint,
        reasons: [
          ...(driftPassed ? [] : ["drift_gate_failed"]),
          ...(configHashesPassed ? [] : ["target_config_hash_mismatch"])
        ]
      });
    }
  });

  const out = path.resolve(process.cwd(), `ops/canary/rollouts/${new Date().toISOString().replace(/[:.]/g, "-")}__result.json`);
  fs.writeFileSync(out, `${JSON.stringify(rollout, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ out, status: rollout.status, state: rollout.state, failure_reason: rollout.failure_reason }, null, 2));

  if (rollout.status === "FAILED") {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
