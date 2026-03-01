import fs from "node:fs";
import path from "node:path";

import { z } from "zod";

import { canonicalJson, sha256Hex, stableObjectHash } from "./common";
import type { AuditKeyring } from "./keyring";
import { parseSignatureEnvelope, signMessageEd25519, verifyMessageEd25519, type SignatureEnvelope } from "./signing";

const ledgerEntrySchema = z.object({
  entry_id: z.string().min(1),
  ts: z.string().datetime(),
  type: z.string().min(1),
  target_id: z.string().min(1),
  payload_hash: z.string().regex(/^[a-f0-9]{64}$/),
  prev_hash: z.string().min(1),
  chain_hash: z.string().regex(/^[a-f0-9]{64}$/),
  signature: z
    .object({
      kid: z.string().min(1),
      algo: z.literal("ed25519"),
      created_at: z.string().datetime(),
      signature: z.string().min(1)
    })
    .optional()
});

export type AuditLedgerEntry = z.infer<typeof ledgerEntrySchema>;

const GENESIS_HASH = "GENESIS";

function timestampSlug(date: Date): string {
  return date.toISOString().replace(/[:.]/g, "-");
}

function computeChainHash(args: {
  ts: string;
  type: string;
  targetId: string;
  payloadHash: string;
  prevHash: string;
  entryId: string;
}): string {
  return sha256Hex(
    canonicalJson({
      ts: args.ts,
      type: args.type,
      target_id: args.targetId,
      payload_hash: args.payloadHash,
      prev_hash: args.prevHash,
      entry_id: args.entryId
    })
  );
}

function readLedgerEntries(filePath: string): AuditLedgerEntry[] {
  if (!fs.existsSync(filePath)) return [];
  return fs
    .readFileSync(filePath, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => ledgerEntrySchema.parse(JSON.parse(line)));
}

export function appendAuditLedgerEntry(args: {
  ledgerPath: string;
  type: string;
  targetId: string;
  payload: unknown;
  now?: Date;
  signature?: { kid: string; privateKeyPem: string };
}): AuditLedgerEntry {
  const now = args.now ?? new Date();
  const ts = now.toISOString();
  const entries = readLedgerEntries(args.ledgerPath);
  const prevHash = entries.length > 0 ? entries[entries.length - 1]!.chain_hash : GENESIS_HASH;
  const payloadHash = stableObjectHash(args.payload);
  const entryId = `ledger-${timestampSlug(now)}-${entries.length + 1}`;
  const chainHash = computeChainHash({
    ts,
    type: args.type,
    targetId: args.targetId,
    payloadHash,
    prevHash,
    entryId
  });

  let signature: SignatureEnvelope | undefined;
  if (args.signature) {
    signature = signMessageEd25519({
      message: chainHash,
      privateKeyPem: args.signature.privateKeyPem,
      kid: args.signature.kid,
      createdAt: ts
    });
  }

  const next = ledgerEntrySchema.parse({
    entry_id: entryId,
    ts,
    type: args.type,
    target_id: args.targetId,
    payload_hash: payloadHash,
    prev_hash: prevHash,
    chain_hash: chainHash,
    signature
  });

  fs.mkdirSync(path.dirname(args.ledgerPath), { recursive: true });
  fs.appendFileSync(args.ledgerPath, `${JSON.stringify(next)}\n`, "utf8");
  return next;
}

export function verifyAuditLedger(args: {
  ledgerPath: string;
  keyring?: AuditKeyring;
  strictSignatures?: boolean;
}): {
  ok: boolean;
  entries: number;
  head_hash: string | null;
  verified_at: string;
  errors: string[];
} {
  const entries = readLedgerEntries(args.ledgerPath);
  const errors: string[] = [];

  let prevHash = GENESIS_HASH;
  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i]!;
    const expectedChainHash = computeChainHash({
      ts: entry.ts,
      type: entry.type,
      targetId: entry.target_id,
      payloadHash: entry.payload_hash,
      prevHash: entry.prev_hash,
      entryId: entry.entry_id
    });
    if (entry.prev_hash !== prevHash) {
      errors.push(`entry[${i}] prev_hash mismatch`);
    }
    if (entry.chain_hash !== expectedChainHash) {
      errors.push(`entry[${i}] chain_hash mismatch`);
    }
    if (entry.signature) {
      if (!args.keyring) {
        errors.push(`entry[${i}] signature present but keyring missing`);
      } else {
        const sig = parseSignatureEnvelope(entry.signature);
        const vr = verifyMessageEd25519({
          message: entry.chain_hash,
          signature: sig,
          keyring: args.keyring
        });
        if (!vr.ok) {
          errors.push(`entry[${i}] signature invalid: ${vr.reason ?? "unknown"}`);
        }
      }
    } else if (args.strictSignatures) {
      errors.push(`entry[${i}] unsigned entry in strict mode`);
    }

    prevHash = entry.chain_hash;
  }

  return {
    ok: errors.length === 0,
    entries: entries.length,
    head_hash: entries.length > 0 ? entries[entries.length - 1]!.chain_hash : null,
    verified_at: new Date().toISOString(),
    errors
  };
}

export function appendAuditLedgerEntryFromEnv(args: {
  type: string;
  targetId: string;
  payload: unknown;
  env?: NodeJS.ProcessEnv;
}): AuditLedgerEntry | null {
  const env = args.env ?? process.env;
  const enabledRaw = env.POLICY_AUDIT_LEDGER_ENABLED;
  const enabled = enabledRaw == null ? env.NODE_ENV !== "test" : enabledRaw === "true";
  if (!enabled) return null;

  const ledgerPath = path.resolve(process.cwd(), env.POLICY_AUDIT_LEDGER_PATH ?? "ops/audit/ledger.jsonl");
  const signingEnabledRaw = env.POLICY_AUDIT_SIGNING_ENABLED;
  const signingEnabled = signingEnabledRaw == null ? env.NODE_ENV === "production" : signingEnabledRaw === "true";
  const privateKey = env.SLO_SIGNING_PRIVATE_KEY;
  const kid = env.SLO_SIGNING_KID ?? "k1";

  return appendAuditLedgerEntry({
    ledgerPath,
    type: args.type,
    targetId: args.targetId,
    payload: args.payload,
    signature: signingEnabled && privateKey ? { kid, privateKeyPem: privateKey } : undefined
  });
}
