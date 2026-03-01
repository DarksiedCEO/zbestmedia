import fs from "node:fs";
import path from "node:path";

import type { CanaryRollout } from "../canary/types";
import { parseLoadRunSloEvent } from "../slo/schema";
import type { BaselineRegistryEntry } from "./baselineRegistry";
import type { IncidentSeverity } from "./severity";
import { appendAuditLedgerEntryFromEnv } from "../audit/ledger";

export type IncidentBundle = {
  generated_at: string;
  severity: IncidentSeverity;
  target_id: string;
  summary: string;
  baseline_hash: string;
  guardrails_hash: string;
  governance_fingerprint: string;
  defaults_hash: string;
  triage_tags: string[];
  recommendation_tags: string[];
  canary: {
    rollout_id: string | null;
    status: string | null;
    state: string | null;
    failure_reason: string | null;
  };
  retry_amplification: number;
  breaker_open_rate: number;
  last_slo_events: Array<{
    event_id: string;
    ts: string;
    source: "ci" | "prod";
    passed: boolean;
    reasons: string[];
    tags: string[];
  }>;
};

function readRecentSloEvents(filePath: string, targetId: string, limit = 5): IncidentBundle["last_slo_events"] {
  if (!fs.existsSync(filePath)) return [];
  const lines = fs
    .readFileSync(filePath, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const parsed = lines.map((line) => parseLoadRunSloEvent(JSON.parse(line)));
  return parsed
    .filter((event) => event.target_id === targetId)
    .sort((a, b) => a.ts.localeCompare(b.ts))
    .slice(-Math.max(1, limit))
    .map((event) => ({
      event_id: event.event_id,
      ts: event.ts,
      source: event.source,
      passed: event.verdict.passed,
      reasons: event.verdict.reasons,
      tags: event.tags
    }));
}

export function buildIncidentBundle(args: {
  targetId: string;
  severity: IncidentSeverity;
  summary: string;
  baseline: BaselineRegistryEntry;
  guardrailsHash: string;
  governanceFingerprint: string;
  defaultsHash: string;
  triageTags?: string[];
  recommendationTags?: string[];
  retryAmplification: number;
  breakerOpenRate: number;
  canaryRollout?: CanaryRollout | null;
  sloEventsPath: string;
}): IncidentBundle {
  return {
    generated_at: new Date().toISOString(),
    severity: args.severity,
    target_id: args.targetId,
    summary: args.summary,
    baseline_hash: args.baseline.baseline_hash,
    guardrails_hash: args.guardrailsHash,
    governance_fingerprint: args.governanceFingerprint,
    defaults_hash: args.defaultsHash,
    triage_tags: args.triageTags ?? [],
    recommendation_tags: args.recommendationTags ?? [],
    canary: {
      rollout_id: args.canaryRollout?.rollout_id ?? null,
      status: args.canaryRollout?.status ?? null,
      state: args.canaryRollout?.state ?? null,
      failure_reason: args.canaryRollout?.failure_reason ?? null
    },
    retry_amplification: args.retryAmplification,
    breaker_open_rate: args.breakerOpenRate,
    last_slo_events: readRecentSloEvents(args.sloEventsPath, args.targetId, 5)
  };
}

export function writeIncidentBundle(args: {
  incidentDir: string;
  bundle: IncidentBundle;
}): string {
  const stamp = args.bundle.generated_at.replace(/[:.]/g, "-");
  const outPath = path.join(args.incidentDir, `${stamp}__incident.json`);
  fs.mkdirSync(args.incidentDir, { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(args.bundle, null, 2)}\n`, "utf8");
  appendAuditLedgerEntryFromEnv({
    type: "incident_bundle",
    targetId: args.bundle.target_id,
    payload: {
      file: path.relative(process.cwd(), outPath),
      severity: args.bundle.severity,
      summary: args.bundle.summary,
      governance_fingerprint: args.bundle.governance_fingerprint,
      defaults_hash: args.bundle.defaults_hash
    }
  });
  return outPath;
}
