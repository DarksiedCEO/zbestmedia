import { createHash } from "node:crypto";

import { z } from "zod";

import { evaluateGuardrails, type GuardrailEvaluation } from "./guardrails";
import type { LoadRunReportPayload } from "./report";
import type { RuntimeDefaults } from "./defaults";

export type DefaultsDiffEntry = {
  key: keyof RuntimeDefaults;
  current: number;
  proposed: number;
  delta: number;
  deltaPct: number;
};

export type DefaultsProposal = {
  generated_at: string;
  report_file: string;
  report_sha256: string;
  current_file: string;
  current_sha256: string;
  current: RuntimeDefaults;
  proposed: RuntimeDefaults;
  diff: DefaultsDiffEntry[];
  no_change: boolean;
  rationale: string[];
  guardrails: GuardrailEvaluation;
};

const runtimeDefaultsShape = z.object({
  POLICY_BREAKER_FAILURE_THRESHOLD: z.number(),
  POLICY_BREAKER_RESET_AFTER_MS: z.number(),
  POLICY_RETRY_MAX: z.number(),
  POLICY_RETRY_BASE_DELAY_MS: z.number(),
  POLICY_RETRY_MAX_DELAY_MS: z.number(),
  POLICY_MAX_CONCURRENCY_SAFE: z.number()
});

export const defaultsProposalSchema = z.object({
  generated_at: z.string(),
  report_file: z.string(),
  report_sha256: z.string(),
  current_file: z.string(),
  current_sha256: z.string(),
  current: runtimeDefaultsShape,
  proposed: runtimeDefaultsShape,
  diff: z.array(
    z.object({
      key: z.enum([
        "POLICY_BREAKER_FAILURE_THRESHOLD",
        "POLICY_BREAKER_RESET_AFTER_MS",
        "POLICY_RETRY_MAX",
        "POLICY_RETRY_BASE_DELAY_MS",
        "POLICY_RETRY_MAX_DELAY_MS",
        "POLICY_MAX_CONCURRENCY_SAFE"
      ]),
      current: z.number(),
      proposed: z.number(),
      delta: z.number(),
      deltaPct: z.number()
    })
  ),
  no_change: z.boolean(),
  rationale: z.array(z.string()),
  guardrails: z.object({
    passed: z.boolean(),
    checks: z.array(
      z.object({
        name: z.string(),
        passed: z.boolean(),
        details: z.string()
      })
    ),
    thresholds: z.object({
      retryAmplificationCap: z.number(),
      breakerOpenRateCap: z.number(),
      p95InflationRatioCap: z.number(),
      chaosSuccessRateFloorRatio: z.number(),
      maxStatus5xxRateIncreasePctPoints: z.number(),
      maxBreakerThresholdChangePct: z.number(),
      maxRetryStepChange: z.number(),
      maxResetAfterMsChangePct: z.number()
    })
  })
});

export function parseDefaultsProposal(input: unknown): DefaultsProposal {
  return defaultsProposalSchema.parse(input) as DefaultsProposal;
}

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

function deltaPct(from: number, to: number): number {
  if (from === 0) return to === 0 ? 0 : 100;
  return ((to - from) / from) * 100;
}

export function buildDefaultsDiff(current: RuntimeDefaults, proposed: RuntimeDefaults): DefaultsDiffEntry[] {
  return (Object.keys(current) as Array<keyof RuntimeDefaults>).map((key) => ({
    key,
    current: current[key],
    proposed: proposed[key],
    delta: proposed[key] - current[key],
    deltaPct: deltaPct(current[key], proposed[key])
  }));
}

export function buildDefaultsProposal(args: {
  report: LoadRunReportPayload;
  reportFile: string;
  reportRaw: string;
  currentFile: string;
  currentRaw: string;
  current: RuntimeDefaults;
}): DefaultsProposal {
  const proposed = args.report.recommendation.defaults;
  const diff = buildDefaultsDiff(args.current, proposed);
  const noChange = diff.every((entry) => entry.delta === 0);
  const guardrails = evaluateGuardrails({
    report: args.report,
    current: args.current,
    proposed
  });
  return {
    generated_at: new Date().toISOString(),
    report_file: args.reportFile,
    report_sha256: sha256Hex(args.reportRaw),
    current_file: args.currentFile,
    current_sha256: sha256Hex(args.currentRaw),
    current: args.current,
    proposed,
    diff,
    no_change: noChange,
    rationale: args.report.recommendation.rationale,
    guardrails
  };
}
