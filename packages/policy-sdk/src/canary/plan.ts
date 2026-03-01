import { createHash } from "node:crypto";
import fs from "node:fs";

import { z } from "zod";

import { parseDefaultsProposal } from "../loadrun/propose";
import { parseCanaryPlan, type CanaryPlan } from "./types";

const planArgsSchema = z.object({
  proposalFile: z.string().min(1),
  target: z.string().min(1),
  observeWindowMinutes: z.number().int().positive().default(10),
  expectedGovernanceFingerprint: z.string().min(1),
  rollbackPacketPointer: z.string().min(1),
  approvedBy: z.string().min(1),
  approvalReason: z.string().min(3)
});

function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

function timestampSlug(date: Date): string {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const hh = String(date.getUTCHours()).padStart(2, "0");
  const mi = String(date.getUTCMinutes()).padStart(2, "0");
  const ss = String(date.getUTCSeconds()).padStart(2, "0");
  return `${yyyy}${mm}${dd}_${hh}${mi}${ss}`;
}

export function buildCanaryPlan(input: z.input<typeof planArgsSchema>): CanaryPlan {
  const args = planArgsSchema.parse(input);
  const proposalRaw = fs.readFileSync(args.proposalFile, "utf8");
  parseDefaultsProposal(JSON.parse(proposalRaw));

  const generatedAt = new Date().toISOString();
  const plan: CanaryPlan = {
    plan_id: `canary-plan-${timestampSlug(new Date())}`,
    generated_at: generatedAt,
    target: args.target,
    defaults_proposal_file: args.proposalFile,
    defaults_proposal_sha256: sha256Hex(proposalRaw),
    steps: [5, 25, 50, 100],
    observe_window_minutes: args.observeWindowMinutes,
    guardrail_profile: "default-ci-gate",
    rollback_packet_pointer: args.rollbackPacketPointer,
    expected_governance_fingerprint: args.expectedGovernanceFingerprint,
    approvals: [
      {
        by: args.approvedBy,
        at: generatedAt,
        reason: args.approvalReason
      }
    ]
  };

  return parseCanaryPlan(plan);
}
