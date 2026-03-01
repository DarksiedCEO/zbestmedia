import fs from "node:fs";
import path from "node:path";

import { buildCanaryPlan } from "../../packages/policy-sdk/src/canary/plan";

type CliArgs = {
  proposal: string;
  target: string;
  out: string;
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
  const target = args.get("target");
  const expectedFingerprint = args.get("expected-fingerprint");
  const rollbackPacket = args.get("rollback-packet");
  const by = args.get("by");
  const reason = args.get("reason");
  if (!proposal || !target || !expectedFingerprint || !rollbackPacket || !by || !reason) {
    throw new Error(
      "Usage: pnpm ops:canary:plan --proposal <proposal.json> --target <env> --expected-fingerprint <hash> --rollback-packet <file> --by <actor> --reason <text> [--out <plan.json>]"
    );
  }

  return {
    proposal,
    target,
    out:
      args.get("out") ??
      `ops/canary/plans/${new Date().toISOString().replace(/[:.]/g, "-")}__plan.json`,
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
    target: cli.target,
    expectedGovernanceFingerprint: cli.expectedFingerprint,
    rollbackPacketPointer: path.resolve(process.cwd(), cli.rollbackPacket),
    approvedBy: cli.by,
    approvalReason: cli.reason
  });

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ out: outPath, plan_id: plan.plan_id }, null, 2));
}

main();
