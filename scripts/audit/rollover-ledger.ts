import fs from "node:fs";
import path from "node:path";

import { rolloverLedger, verifyLedgerWithArchives } from "../../packages/policy-sdk/src/audit/retention";
import { appendAuditLedgerEntryFromEnv } from "../../packages/policy-sdk/src/audit/ledger";

type CliArgs = {
  ledger: string;
  archiveDir: string;
  checkpointsDir: string;
  keyring: string;
  approve: boolean;
  reason?: string;
};

function parseArgs(argv: string[]): CliArgs {
  const args = new Map<string, string>();
  const flags = new Set<string>();
  for (let i = 2; i < argv.length; i += 1) {
    const t = argv[i];
    if (!t.startsWith("--")) continue;
    const key = t.slice(2);
    if (key === "approve") {
      flags.add("approve");
      continue;
    }
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for --${key}`);
    args.set(key, value);
    i += 1;
  }
  return {
    ledger: args.get("ledger") ?? "ops/audit/ledger.jsonl",
    archiveDir: args.get("archiveDir") ?? "ops/audit/archive",
    checkpointsDir: args.get("checkpointsDir") ?? "ops/audit/checkpoints",
    keyring: args.get("keyring") ?? "ops/keys/keyring.json",
    approve: flags.has("approve"),
    reason: args.get("reason")
  };
}

function main(): void {
  const cli = parseArgs(process.argv);
  if (!cli.approve) throw new Error("Approval required: pass --approve");
  if (!cli.reason || cli.reason.trim().length < 3) throw new Error("Approval reason required: pass --reason \"...\"");
  const ledgerPath = path.resolve(process.cwd(), cli.ledger);
  if (!fs.existsSync(ledgerPath)) {
    throw new Error(`Ledger not found: ${ledgerPath}`);
  }
  const result = rolloverLedger({
    ledgerPath,
    archiveDir: path.resolve(process.cwd(), cli.archiveDir),
    checkpointsDir: path.resolve(process.cwd(), cli.checkpointsDir)
  });
  const verify = verifyLedgerWithArchives({
    activeLedgerPath: ledgerPath,
    archiveDir: path.resolve(process.cwd(), cli.archiveDir),
    checkpointsDir: path.resolve(process.cwd(), cli.checkpointsDir),
    strictSignatures: false,
    keyringPath: path.resolve(process.cwd(), cli.keyring)
  });
  appendAuditLedgerEntryFromEnv({
    type: "ledger_rollover",
    targetId: process.env.LOADRUN_TARGET_ID ?? "prod/us-west/policy",
    payload: {
      archived: path.relative(process.cwd(), result.archived),
      checkpoint: path.relative(process.cwd(), result.checkpoint),
      line_count: result.line_count,
      head_hash: result.head_hash,
      reason: cli.reason
    }
  });
  console.log(
    JSON.stringify(
      {
        ok: verify.ok,
        archived: result.archived,
        checkpoint: result.checkpoint,
        verify
      },
      null,
      2
    )
  );
  if (!verify.ok) process.exit(1);
}

main();
