import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

import { z } from "zod";

import { stableObjectHash } from "./common";
import { readAuditLedgerEntries, verifyAuditLedger, type AuditLedgerEntry } from "./ledger";
import { loadAuditKeyring } from "./keyring";

const retentionPolicySchema = z.object({
  version: z.number().int().positive(),
  rollover_cadence: z.enum(["daily", "weekly"]),
  archive_compression: z.enum(["gzip"]),
  retention_days: z.number().int().positive(),
  never_delete_targets: z.array(z.string()).default([])
});

const checkpointSchema = z.object({
  ts: z.string().datetime(),
  ledger_file: z.string().min(1),
  line_count: z.number().int().nonnegative(),
  first_entry_id: z.string().nullable(),
  last_entry_id: z.string().nullable(),
  head_hash: z.string().nullable(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/)
});

export type RetentionPolicy = z.infer<typeof retentionPolicySchema>;
export type LedgerCheckpoint = z.infer<typeof checkpointSchema>;

function utcDateSlug(d: Date): string {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function parseRetentionPolicy(input: unknown): RetentionPolicy {
  return retentionPolicySchema.parse(input);
}

export function loadRetentionPolicy(filePath: string): RetentionPolicy {
  return parseRetentionPolicy(JSON.parse(fs.readFileSync(filePath, "utf8")));
}

export function buildLedgerCheckpoint(args: {
  entries: AuditLedgerEntry[];
  ledgerFile: string;
  compressedBytes: Buffer;
  now?: Date;
}): LedgerCheckpoint {
  return checkpointSchema.parse({
    ts: (args.now ?? new Date()).toISOString(),
    ledger_file: args.ledgerFile,
    line_count: args.entries.length,
    first_entry_id: args.entries[0]?.entry_id ?? null,
    last_entry_id: args.entries[args.entries.length - 1]?.entry_id ?? null,
    head_hash: args.entries[args.entries.length - 1]?.chain_hash ?? null,
    sha256: stableObjectHash(args.compressedBytes.toString("base64"))
  });
}

export function rolloverLedger(args: {
  ledgerPath: string;
  archiveDir: string;
  checkpointsDir: string;
  now?: Date;
}): {
  archived: string;
  checkpoint: string;
  line_count: number;
  head_hash: string | null;
} {
  const now = args.now ?? new Date();
  if (!fs.existsSync(args.ledgerPath)) {
    throw new Error(`Ledger not found: ${args.ledgerPath}`);
  }
  const raw = fs.readFileSync(args.ledgerPath, "utf8");
  const entries = readAuditLedgerEntries(args.ledgerPath);
  const gz = zlib.gzipSync(Buffer.from(raw, "utf8"));
  const dateSlug = utcDateSlug(now);
  const archivedName = `${dateSlug}.ledger.jsonl.gz`;
  const checkpointName = `${dateSlug}.head.json`;
  const archivedPath = path.join(args.archiveDir, archivedName);
  const checkpointPath = path.join(args.checkpointsDir, checkpointName);
  fs.mkdirSync(args.archiveDir, { recursive: true });
  fs.mkdirSync(args.checkpointsDir, { recursive: true });
  fs.writeFileSync(archivedPath, gz);
  const checkpoint = buildLedgerCheckpoint({
    entries,
    ledgerFile: archivedName,
    compressedBytes: gz,
    now
  });
  fs.writeFileSync(checkpointPath, `${JSON.stringify(checkpoint, null, 2)}\n`, "utf8");
  fs.writeFileSync(args.ledgerPath, "", "utf8");
  return {
    archived: archivedPath,
    checkpoint: checkpointPath,
    line_count: checkpoint.line_count,
    head_hash: checkpoint.head_hash
  };
}

export function verifyLedgerWithArchives(args: {
  activeLedgerPath: string;
  archiveDir: string;
  checkpointsDir: string;
  strictSignatures?: boolean;
  keyringPath?: string;
}): {
  ok: boolean;
  segments: number;
  entries: number;
  head_hash: string | null;
  errors: string[];
} {
  const errors: string[] = [];
  const checkpointFiles = fs.existsSync(args.checkpointsDir)
    ? fs
        .readdirSync(args.checkpointsDir)
        .filter((f) => f.endsWith(".head.json"))
        .sort()
    : [];
  let totalEntries = 0;
  let prevHead: string | null = null;
  for (const file of checkpointFiles) {
    const cp = checkpointSchema.parse(JSON.parse(fs.readFileSync(path.join(args.checkpointsDir, file), "utf8")));
    const archivePath = path.join(args.archiveDir, cp.ledger_file);
    if (!fs.existsSync(archivePath)) {
      errors.push(`missing archive for checkpoint ${file}: ${cp.ledger_file}`);
      continue;
    }
    const gz = fs.readFileSync(archivePath);
    const sha = stableObjectHash(gz.toString("base64"));
    if (sha !== cp.sha256) {
      errors.push(`checkpoint sha mismatch ${file}`);
    }
    const text = zlib.gunzipSync(gz).toString("utf8");
    const lines = text
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    const entries = lines.map((line) => JSON.parse(line) as AuditLedgerEntry);
    if (entries.length !== cp.line_count) {
      errors.push(`checkpoint line_count mismatch ${file}`);
    }
    if ((entries[entries.length - 1]?.chain_hash ?? null) !== cp.head_hash) {
      errors.push(`checkpoint head_hash mismatch ${file}`);
    }
    if (entries.length > 0 && prevHead && entries[0]!.prev_hash !== prevHead) {
      errors.push(`archive chain continuity mismatch ${file}`);
    }
    prevHead = entries[entries.length - 1]?.chain_hash ?? prevHead;
    totalEntries += entries.length;
  }

  const keyring = args.keyringPath ? loadAuditKeyring(args.keyringPath) : undefined;
  const activeVerify = verifyAuditLedger({
    ledgerPath: args.activeLedgerPath,
    strictSignatures: args.strictSignatures,
    keyring
  });
  totalEntries += activeVerify.entries;
  if (!activeVerify.ok) {
    errors.push(...activeVerify.errors.map((e) => `active:${e}`));
  }
  const activeEntries = readAuditLedgerEntries(args.activeLedgerPath);
  if (activeEntries.length > 0 && prevHead && activeEntries[0]!.prev_hash !== prevHead) {
    errors.push("active chain continuity mismatch");
  }
  const headHash = activeEntries[activeEntries.length - 1]?.chain_hash ?? prevHead ?? null;
  return {
    ok: errors.length === 0,
    segments: checkpointFiles.length + 1,
    entries: totalEntries,
    head_hash: headHash,
    errors
  };
}
