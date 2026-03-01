import fs from "node:fs";
import path from "node:path";

import { parseTargetRegistry } from "../loadrun/targetRegistryValidate";
import { loadRetentionPolicy } from "../audit/retention";

export function generateFortressRunbook(args: { rootDir: string }): string {
  const abs = (p: string) => path.resolve(args.rootDir, p);
  const targets = parseTargetRegistry(JSON.parse(fs.readFileSync(abs("ops/targets/targets.json"), "utf8")));
  const retention = loadRetentionPolicy(abs("ops/retention/policy.json"));

  return [
    "# Fortress Runbook",
    "",
    "## Core Verification",
    "- `pnpm ops:targets:validate --strict`",
    "- `pnpm ops:contracts:verify --strict`",
    "- `pnpm ops:audit:verify-ledger --strict`",
    "",
    "## Retention",
    `- Cadence: \`${retention.rollover_cadence}\``,
    `- Retention days: \`${retention.retention_days}\``,
    "- Rollover command: `pnpm ops:audit:rollover-ledger --approve --reason \"...\"`",
    "",
    "## Key Rotation",
    "- Rotation command: `pnpm ops:keys:rotate --new-kid <kid> --public-key-file <pem> --approve --reason \"...\"`",
    "- Re-sign contracts after key add:",
    "  `pnpm ops:contracts:sign --approve --reason \"...\"`",
    "",
    "## Targets",
    ...targets.targets.map((t) => `- \`${t.target_id}\`${t.base_url_env ? ` via env \`${t.base_url_env}\`` : ""}`),
    "",
    "## Incident Response",
    "- Freeze governance: `pnpm ops:incident:freeze --approve --reason \"...\"`",
    "- Kill switch: `pnpm ops:runtime:kill-switch --approve --reason \"...\"`",
    "- Generate audit bundle:",
    "  `pnpm ops:audit:export-bundle --from <iso> --to <iso> --target <target_id>`"
  ].join("\n");
}
