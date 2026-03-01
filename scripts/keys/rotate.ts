import fs from "node:fs";
import path from "node:path";

import { rotateAuditKeyring } from "../../packages/policy-sdk/src/audit/keys";

type CliArgs = {
  keyring: string;
  publicKeyFile: string;
  newKid: string;
  outDir: string;
  approve: boolean;
  reason?: string;
  by?: string;
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
  const publicKeyFile = args.get("public-key-file");
  const newKid = args.get("new-kid");
  if (!publicKeyFile || !newKid) {
    throw new Error("Usage: pnpm ops:keys:rotate --new-kid <kid> --public-key-file <pem> --approve --reason \"...\" [--keyring <path>] [--outDir <dir>] [--by <actor>]");
  }
  return {
    keyring: args.get("keyring") ?? "ops/keys/keyring.json",
    publicKeyFile,
    newKid,
    outDir: args.get("outDir") ?? "ops/keys/rotation",
    approve: flags.has("approve"),
    reason: args.get("reason"),
    by: args.get("by")
  };
}

function main(): void {
  const cli = parseArgs(process.argv);
  const publicKeyPem = fs.readFileSync(path.resolve(process.cwd(), cli.publicKeyFile), "utf8");
  const result = rotateAuditKeyring({
    keyringPath: path.resolve(process.cwd(), cli.keyring),
    newKid: cli.newKid,
    publicKeyPem,
    approved: cli.approve,
    reason: cli.reason,
    by: cli.by,
    outDir: path.resolve(process.cwd(), cli.outDir)
  });
  console.log(
    JSON.stringify(
      {
        ok: true,
        keyring: path.relative(process.cwd(), path.resolve(process.cwd(), cli.keyring)),
        report: path.relative(process.cwd(), result.reportPath),
        kids: Object.keys(result.keyring.keys).sort()
      },
      null,
      2
    )
  );
}

main();
