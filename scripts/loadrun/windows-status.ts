import path from "node:path";

import { loadDeployWindowsConfig, resolveActiveDeployWindow } from "../../packages/policy-sdk/src/loadrun/windows";
import { parseTargetId } from "../../packages/policy-sdk/src/loadrun/target";

function parseArgs(argv: string[]): { targetId: string; file: string } {
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
  return {
    targetId: parseTargetId(args.get("target") ?? process.env.LOADRUN_TARGET_ID ?? "prod/us-west/policy"),
    file: path.resolve(process.cwd(), args.get("file") ?? "ops/windows/deploy_windows.json")
  };
}

function main(): void {
  const cli = parseArgs(process.argv);
  const cfg = loadDeployWindowsConfig(cli.file);
  const active = resolveActiveDeployWindow({ targetId: cli.targetId, windows: cfg.windows });
  console.log(
    JSON.stringify(
      {
        target_id: cli.targetId,
        windows_file: cli.file,
        active_window: active,
        configured_windows: cfg.windows.length
      },
      null,
      2
    )
  );
}

main();
