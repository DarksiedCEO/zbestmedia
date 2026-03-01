import { resetBudgetState } from "../../packages/policy-sdk/src/loadrun/budget";
import { appendAuditLedgerEntryFromEnv } from "../../packages/policy-sdk/src/audit/ledger";

function parseArgs(argv: string[]): { approve: boolean; reason?: string } {
  const flags = new Set<string>();
  const args = new Map<string, string>();
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    if (key === "approve") {
      flags.add("approve");
      continue;
    }
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for --${key}`);
    args.set(key, value);
    i += 1;
  }
  return { approve: flags.has("approve"), reason: args.get("reason") };
}

function main(): void {
  const cli = parseArgs(process.argv);
  if (!cli.approve) throw new Error("Approval required: pass --approve");
  if (!cli.reason || cli.reason.trim().length < 3) throw new Error("Approval reason required: pass --reason \"...\"");
  const state = resetBudgetState();
  appendAuditLedgerEntryFromEnv({
    type: "budget_reset",
    targetId: process.env.LOADRUN_TARGET_ID ?? "prod/us-west/policy",
    payload: {
      reason: cli.reason,
      state
    }
  });
  console.log(JSON.stringify({ ok: true, reason: cli.reason, state }, null, 2));
}

main();
