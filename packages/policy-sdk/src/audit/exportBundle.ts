import fs from "node:fs";
import path from "node:path";

import { z } from "zod";

import { readAuditLedgerEntries } from "./ledger";

const exportManifestSchema = z.object({
  generated_at: z.string().datetime(),
  from: z.string().datetime(),
  to: z.string().datetime(),
  target_id: z.string().min(1),
  files: z.array(z.string()),
  ledger_entry_count: z.number().int().nonnegative()
});

export type ExportManifest = z.infer<typeof exportManifestSchema>;

export function exportAuditBundle(args: {
  rootDir: string;
  from: string;
  to: string;
  targetId: string;
  outDir: string;
}): { outDir: string; manifestPath: string; manifest: ExportManifest } {
  const fromMs = Date.parse(args.from);
  const toMs = Date.parse(args.to);
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || fromMs > toMs) {
    throw new Error("Invalid --from/--to window");
  }
  fs.mkdirSync(args.outDir, { recursive: true });

  const filesToCopy = [
    "ops/contracts/slo_contracts.json",
    "ops/contracts/slo_contracts.sig.json",
    "ops/keys/keyring.json",
    "ops/audit/ledger.jsonl"
  ]
    .map((rel) => path.resolve(args.rootDir, rel))
    .filter((full) => fs.existsSync(full));
  const checkpointsDir = path.resolve(args.rootDir, "ops/audit/checkpoints");
  const archivesDir = path.resolve(args.rootDir, "ops/audit/archive");
  for (const dir of [checkpointsDir, archivesDir]) {
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir).sort()) {
      if (name.startsWith(".")) continue;
      filesToCopy.push(path.join(dir, name));
    }
  }
  const copiedRels: string[] = [];
  for (const src of filesToCopy) {
    const rel = path.relative(args.rootDir, src);
    const dst = path.resolve(args.outDir, rel);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(src, dst);
    copiedRels.push(rel);
  }

  const ledgerPath = path.resolve(args.rootDir, "ops/audit/ledger.jsonl");
  const entries = fs.existsSync(ledgerPath)
    ? readAuditLedgerEntries(ledgerPath).filter((entry) => {
        const ts = Date.parse(entry.ts);
        return entry.target_id === args.targetId && ts >= fromMs && ts <= toMs;
      })
    : [];

  const manifest = exportManifestSchema.parse({
    generated_at: new Date().toISOString(),
    from: new Date(fromMs).toISOString(),
    to: new Date(toMs).toISOString(),
    target_id: args.targetId,
    files: copiedRels.sort(),
    ledger_entry_count: entries.length
  });
  const manifestPath = path.resolve(args.outDir, "README.audit-bundle.json");
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  const verifyTxt = path.resolve(args.outDir, "README.verify.md");
  fs.writeFileSync(
    verifyTxt,
    [
      "# Audit Bundle Verification",
      "",
      "1. Verify contracts signature: `pnpm ops:contracts:verify --strict`",
      "2. Verify ledger chain: `pnpm ops:audit:verify-ledger --strict`",
      "3. Review bundle manifest in `README.audit-bundle.json`"
    ].join("\n"),
    "utf8"
  );
  return { outDir: args.outDir, manifestPath, manifest };
}
