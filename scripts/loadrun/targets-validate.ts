import fs from "node:fs";
import path from "node:path";

import { loadAndValidateTargetRegistry } from "../../packages/policy-sdk/src/loadrun/targetRegistryValidate";

type CliArgs = {
  registry: string;
  baselineRegistry: string;
  guardrails: string;
  workflows: string[];
  strict: boolean;
  allowUnbaselinedStaging: boolean;
  json: boolean;
  out?: string;
};

function parseArgs(argv: string[]): CliArgs {
  const args = new Map<string, string>();
  const flags = new Set<string>();
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    if (["strict", "allow-unbaselined-staging", "json"].includes(key)) {
      flags.add(key);
      continue;
    }
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for --${key}`);
    }
    args.set(key, value);
    i += 1;
  }

  const workflows = (args.get("workflows") ?? ".github/workflows/loadrun-regression.yml,.github/workflows/loadrun-prod-drift.yml")
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  return {
    registry: args.get("registry") ?? "ops/targets/targets.json",
    baselineRegistry: args.get("baseline-registry") ?? "ops/load_runs/baselines/registry.json",
    guardrails: args.get("guardrails") ?? "ops/guardrails/profiles.json",
    workflows,
    strict: flags.has("strict"),
    allowUnbaselinedStaging: flags.has("allow-unbaselined-staging"),
    json: flags.has("json"),
    out: args.get("out")
  };
}

function main(): void {
  const cli = parseArgs(process.argv);
  const result = loadAndValidateTargetRegistry({
    registryPath: path.resolve(process.cwd(), cli.registry),
    baselineRegistryPath: path.resolve(process.cwd(), cli.baselineRegistry),
    guardrailProfilesPath: path.resolve(process.cwd(), cli.guardrails),
    workflowPaths: cli.workflows.map((item) => path.resolve(process.cwd(), item)),
    strict: cli.strict,
    allowUnbaselinedStaging: cli.allowUnbaselinedStaging
  });

  if (cli.out) {
    const outPath = path.resolve(process.cwd(), cli.out);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  }

  if (cli.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`target_registry_validation=${result.passed ? "PASS" : "FAIL"}`);
    console.log(`errors=${result.errors.length}`);
    console.log(`warnings=${result.warnings.length}`);
    for (const error of result.errors) console.log(`ERROR: ${error}`);
    for (const warning of result.warnings) console.log(`WARN: ${warning}`);
  }

  if (!result.passed) {
    process.exit(1);
  }
}

main();
