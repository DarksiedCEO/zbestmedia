import fs from "node:fs";
import path from "node:path";

type Controls = {
  freeze: boolean;
  runtime_kill_switch: boolean;
  updated_at: string;
  reason: string;
};

function parseArgs(argv: string[]): { approve: boolean; reason?: string; controlsPath: string } {
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
    if (!value || value.startsWith("--")) throw new Error(`Missing value for --${key}`);
    args.set(key, value);
    i += 1;
  }
  return {
    approve: flags.has("approve"),
    reason: args.get("reason"),
    controlsPath: path.resolve(process.cwd(), args.get("controls") ?? process.env.POLICY_CONTROLS_PATH ?? "ops/incidents/controls.json")
  };
}

function readControls(filePath: string): Controls {
  if (!fs.existsSync(filePath)) {
    return { freeze: false, runtime_kill_switch: false, updated_at: new Date(0).toISOString(), reason: "init" };
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as Controls;
}

function main(): void {
  const cli = parseArgs(process.argv);
  if (!cli.approve) throw new Error("Approval required: pass --approve");
  if (!cli.reason || cli.reason.trim().length < 3) throw new Error("Approval reason required: pass --reason \"...\"");

  const next = {
    ...readControls(cli.controlsPath),
    freeze: true,
    updated_at: new Date().toISOString(),
    reason: cli.reason
  };
  fs.mkdirSync(path.dirname(cli.controlsPath), { recursive: true });
  fs.writeFileSync(cli.controlsPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ ok: true, controls: cli.controlsPath, freeze: true }, null, 2));
}

main();
