import fs from "node:fs";
import path from "node:path";

import { buildCanaryPlan } from "../../packages/policy-sdk/src/canary/plan";
import { appendAuditLedgerEntryFromEnv } from "../../packages/policy-sdk/src/audit/ledger";

type CliArgs = {
  proposal: string;
  targetId: string;
  out: string;
  baselineHash: string;
  guardrailsProfileKey: string;
  guardrailsProfileHash: string;
  expectedFingerprint: string;
  rollbackPacket: string;
  by: string;
  reason: string;
};

function parseArgs(argv: string[]): CliArgs {
  const args = new Map<string, string>();
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for --${key}`);
    args.set(key, value);
    i += 1;
  }

  const proposal = args.get("proposal");
  const targetId = args.get("target");
  const baselineHash = args.get("baseline-hash");
  const guardrailsProfileKey = args.get("guardrails-profile-key");
  const guardrailsProfileHash = args.get("guardrails-profile-hash");
  const expectedFingerprint = args.get("expected-fingerprint");
  const rollbackPacket = args.get("rollback-packet");
  const by = args.get("by");
  const reason = args.get("reason");
  if (!proposal || !targetId || !baselineHash || !guardrailsProfileKey || !guardrailsProfileHash || !expectedFingerprint || !rollbackPacket || !by || !reason) {
    throw new Error(
      "Usage: pnpm ops:canary:plan --proposal <proposal.json> --target <target_id> --baseline-hash <sha> --guardrails-profile-key <key> --guardrails-profile-hash <sha> --expected-fingerprint <hash> --rollback-packet <file> --by <actor> --reason <text> [--out <plan.json>]"
    );
  }

  return {
    proposal,
    targetId,
    out:
      args.get("out") ??
      `ops/canary/plans/${new Date().toISOString().replace(/[:.]/g, "-")}__plan.json`,
    baselineHash,
    guardrailsProfileKey,
    guardrailsProfileHash,
    expectedFingerprint,
    rollbackPacket,
    by,
    reason
  };
}

function main(): void {
  const cli = parseArgs(process.argv);
  const proposalPath = path.resolve(process.cwd(), cli.proposal);
  const outPath = path.resolve(process.cwd(), cli.out);

  const plan = buildCanaryPlan({
    proposalFile: proposalPath,
    targetId: cli.targetId,
    baselineHash: cli.baselineHash,
    guardrailsProfileKey: cli.guardrailsProfileKey,
    guardrailsProfileHash: cli.guardrailsProfileHash,
    expectedGovernanceFingerprint: cli.expectedFingerprint,
    rollbackPacketPointer: path.resolve(process.cwd(), cli.rollbackPacket),
    approvedBy: cli.by,
    approvalReason: cli.reason
  });

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
  appendAuditLedgerEntryFromEnv({
    type: "canary_plan",
    targetId: plan.target_id,
    payload: {
      plan_id: plan.plan_id,
      out: path.relative(process.cwd(), outPath),
      steps: plan.steps,
      baseline_hash: plan.baseline_hash,
      guardrails_profile_hash: plan.guardrails_profile_hash
    }
  });
  console.log(JSON.stringify({ out: outPath, plan_id: plan.plan_id }, null, 2));
}

main();
