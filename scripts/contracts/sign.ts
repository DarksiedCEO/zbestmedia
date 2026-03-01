import fs from "node:fs";
import path from "node:path";

import { parseSloContracts, signSloContracts } from "../../packages/policy-sdk/src/contracts/sloContracts";

type CliArgs = {
  contracts: string;
  out: string;
  approve: boolean;
  reason?: string;
};

function parseArgs(argv: string[]): CliArgs {
  const args = new Map<string, string>();
  const flags = new Set<string>();
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    if (key === "approve") {
      flags.add("approve");
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
    out: args.get("out") ?? "ops/contracts/slo_contracts.sig.json",
    approve: flags.has("approve"),
    reason: args.get("reason")
  };
}

function main(): void {
  const cli = parseArgs(process.argv);
  if (!cli.approve) throw new Error("Approval required: pass --approve");
  if (!cli.reason || cli.reason.trim().length < 3) throw new Error("Approval reason required: pass --reason \"...\"");
  const privateKey = process.env.SLO_SIGNING_PRIVATE_KEY;
  if (!privateKey || !privateKey.trim()) throw new Error("Missing SLO_SIGNING_PRIVATE_KEY");
  const kid = process.env.SLO_SIGNING_KID ?? "k1";

  const contractsPath = path.resolve(process.cwd(), cli.contracts);
  const outPath = path.resolve(process.cwd(), cli.out);
  const contracts = parseSloContracts(JSON.parse(fs.readFileSync(contractsPath, "utf8")));
  const signed = signSloContracts({ contracts, kid, privateKeyPem: privateKey });
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(signed, null, 2)}\n`, "utf8");

  console.log(
    JSON.stringify(
      {
        ok: true,
        reason: cli.reason,
        contracts: path.relative(process.cwd(), contractsPath),
        signature: path.relative(process.cwd(), outPath),
        payload_hash: signed.payload_hash,
        kid: signed.signature.kid
      },
      null,
      2
    )
  );
}

main();
