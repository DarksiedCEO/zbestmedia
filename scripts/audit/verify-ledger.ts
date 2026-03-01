import path from "node:path";

import { loadAuditKeyring } from "../../packages/policy-sdk/src/audit/keyring";
import { verifyAuditLedger } from "../../packages/policy-sdk/src/audit/ledger";
import { verifyLedgerWithArchives } from "../../packages/policy-sdk/src/audit/retention";

type CliArgs = {
  ledger: string;
  keyring: string;
  archiveDir: string;
  checkpointsDir: string;
  strict: boolean;
};

function parseArgs(argv: string[]): CliArgs {
  const args = new Map<string, string>();
  const flags = new Set<string>();
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    if (key === "strict") {
      flags.add("strict");
      continue;
    }
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for --${key}`);
    args.set(key, value);
    i += 1;
  }
  return {
    ledger: args.get("ledger") ?? "ops/audit/ledger.jsonl",
    keyring: args.get("keyring") ?? "ops/keys/keyring.json",
    archiveDir: args.get("archiveDir") ?? "ops/audit/archive",
    checkpointsDir: args.get("checkpointsDir") ?? "ops/audit/checkpoints",
    strict: flags.has("strict")
  };
}

function main(): void {
  const cli = parseArgs(process.argv);
  const keyringPath = path.resolve(process.cwd(), cli.keyring);
  const keyring = loadAuditKeyring(keyringPath);
  const active = verifyAuditLedger({
    ledgerPath: path.resolve(process.cwd(), cli.ledger),
    keyring,
    strictSignatures: cli.strict
  });
  const withArchives = verifyLedgerWithArchives({
    activeLedgerPath: path.resolve(process.cwd(), cli.ledger),
    archiveDir: path.resolve(process.cwd(), cli.archiveDir),
    checkpointsDir: path.resolve(process.cwd(), cli.checkpointsDir),
    strictSignatures: false,
    keyringPath
  });
  const result = {
    ok: active.ok && withArchives.ok,
    entries: withArchives.entries,
    segments: withArchives.segments,
    head_hash: withArchives.head_hash,
    verified_at: active.verified_at,
    errors: [...active.errors, ...withArchives.errors]
  };
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok && cli.strict) {
    process.exit(1);
  }
}

main();
