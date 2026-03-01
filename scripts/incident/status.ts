import fs from "node:fs";
import path from "node:path";

type Controls = {
  freeze: boolean;
  runtime_kill_switch: boolean;
  updated_at: string;
  reason: string;
};

function latestIncident(dir: string): string | null {
  if (!fs.existsSync(dir)) return null;
  const file = fs
    .readdirSync(dir)
    .filter((name) => name.endsWith("__incident.json"))
    .sort()
    .slice(-1)[0];
  return file ? path.join(dir, file) : null;
}

function readControls(filePath: string): Controls {
  if (!fs.existsSync(filePath)) {
    return { freeze: false, runtime_kill_switch: false, updated_at: "", reason: "" };
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as Controls;
}

function main(): void {
  const controlsPath = path.resolve(process.cwd(), process.env.POLICY_CONTROLS_PATH ?? "ops/incidents/controls.json");
  const incidentsDir = path.resolve(process.cwd(), "ops/incidents");
  const controls = readControls(controlsPath);
  const latest = latestIncident(incidentsDir);

  console.log(
    JSON.stringify(
      {
        controls_path: controlsPath,
        freeze_mode: controls.freeze,
        runtime_kill_switch: controls.runtime_kill_switch,
        updated_at: controls.updated_at,
        reason: controls.reason,
        latest_incident: latest
      },
      null,
      2
    )
  );
}

main();
