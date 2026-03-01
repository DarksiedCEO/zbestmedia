import path from "node:path";

import { loadContractsAndSignature, loadContractsKeyring, verifySloContractsSignature } from "../../packages/policy-sdk/src/contracts/sloContracts";

type CliArgs = {
  contracts: string;
  signature: string;
  keyring: string;
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
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for --${key}`);
    }
    args.set(key, value);
    i += 1;
  }
  return {
    contracts: args.get("contracts") ?? "ops/contracts/slo_contracts.json",
    signature: args.get("signature") ?? "ops/contracts/slo_contracts.sig.json",
    keyring: args.get("keyring") ?? "ops/keys/keyring.json",
    strict: flags.has("strict")
  };
}

function main(): void {
  const cli = parseArgs(process.argv);
  const { contracts, signed } = loadContractsAndSignature({
    contractsPath: path.resolve(process.cwd(), cli.contracts),
    signaturePath: path.resolve(process.cwd(), cli.signature)
  });
  const keyring = loadContractsKeyring(path.resolve(process.cwd(), cli.keyring));
  const result = verifySloContractsSignature({ contracts, signed, keyring });
  console.log(JSON.stringify({ ok: result.ok, reason: result.reason ?? null, kid: signed.signature.kid, version: contracts.version }, null, 2));
  if (!result.ok && cli.strict) {
    process.exit(1);
  }
}

main();
