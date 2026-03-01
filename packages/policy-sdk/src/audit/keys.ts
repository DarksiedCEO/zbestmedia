import fs from "node:fs";
import path from "node:path";

import { parseAuditKeyring, type AuditKeyring } from "./keyring";

export function rotateAuditKeyring(args: {
  keyringPath: string;
  newKid: string;
  publicKeyPem: string;
  approved: boolean;
  reason?: string;
  by?: string;
  outDir: string;
}): {
  keyring: AuditKeyring;
  reportPath: string;
} {
  if (!args.approved) {
    throw new Error("Approval required: pass --approve");
  }
  if (!args.reason || args.reason.trim().length < 3) {
    throw new Error("Approval reason required: pass --reason \"...\"");
  }
  const existing = fs.existsSync(args.keyringPath)
    ? parseAuditKeyring(JSON.parse(fs.readFileSync(args.keyringPath, "utf8")))
    : parseAuditKeyring({ version: 1, keys: {} });
  const next: AuditKeyring = {
    ...existing,
    keys: {
      ...existing.keys,
      [args.newKid]: {
        algo: "ed25519",
        public_key_pem: args.publicKeyPem
      }
    }
  };
  fs.mkdirSync(path.dirname(args.keyringPath), { recursive: true });
  fs.writeFileSync(args.keyringPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  fs.mkdirSync(args.outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reportPath = path.join(args.outDir, `${stamp}__rotation_plan.json`);
  fs.writeFileSync(
    reportPath,
    `${JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        new_kid: args.newKid,
        approved_by: args.by ?? "unknown",
        reason: args.reason,
        key_count: Object.keys(next.keys).length,
        verify_commands: ["pnpm ops:contracts:verify --strict", "pnpm ops:audit:verify-signatures --strict"]
      },
      null,
      2
    )}\n`,
    "utf8"
  );
  return { keyring: next, reportPath };
}
