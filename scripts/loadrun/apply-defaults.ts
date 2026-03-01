import fs from "node:fs";
import path from "node:path";

import { defaultsToEnvBlock } from "../../packages/policy-sdk/src/loadrun/defaults";
import { applyDefaultsFromProposal } from "../../packages/policy-sdk/src/loadrun/apply";
import { parseDefaultsProposal } from "../../packages/policy-sdk/src/loadrun/propose";

type CliArgs = {
  proposal: string;
  defaults: string;
  rollbackDir: string;
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
  const proposal = args.get("proposal");
  if (!proposal) {
    throw new Error("Usage: pnpm ops:loadrun:apply-defaults --proposal <proposal.json> --approve --reason \"...\" [--defaults <path>] [--rollbackDir <dir>]");
  }
  return {
    proposal,
    defaults: args.get("defaults") ?? "packages/policy-sdk/src/defaults/runtime.defaults.json",
    rollbackDir: args.get("rollbackDir") ?? "ops/load_runs/rollbacks",
    approve: flags.has("approve"),
    reason: args.get("reason")
  };
}

function main(): void {
  const cli = parseArgs(process.argv);
  const proposalPath = path.resolve(process.cwd(), cli.proposal);
  const defaultsPath = path.resolve(process.cwd(), cli.defaults);
  const rollbackDir = path.resolve(process.cwd(), cli.rollbackDir);
  const proposal = parseDefaultsProposal(JSON.parse(fs.readFileSync(proposalPath, "utf8")));
  const result = applyDefaultsFromProposal({
    proposal,
    defaultsPath,
    rollbackDir,
    approved: cli.approve,
    reason: cli.reason
  });

  console.log(
    JSON.stringify(
      {
        changed: result.changed,
        defaults_path: result.defaultsPath,
        rollback_path: result.rollbackPath,
        env_block: result.envBlock
      },
      null,
      2
    )
  );
  console.log("\n# Proposed runtime env block\n" + defaultsToEnvBlock(proposal.proposed));
}

main();
