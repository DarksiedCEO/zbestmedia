import { createPrivateKey, createPublicKey, sign, verify } from "node:crypto";

import { z } from "zod";

import type { AuditKeyring } from "./keyring";

export const AUDIT_SIGNATURE_ALGO = "ed25519" as const;

const signatureEnvelopeSchema = z.object({
  kid: z.string().min(1),
  algo: z.literal(AUDIT_SIGNATURE_ALGO),
  created_at: z.string().datetime(),
  signature: z.string().min(1)
});

export type SignatureEnvelope = z.infer<typeof signatureEnvelopeSchema>;

function toBase64Url(buffer: Buffer): string {
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromBase64Url(input: string): Buffer {
  const base64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4 || 4)) % 4);
  return Buffer.from(padded, "base64");
}

export function signMessageEd25519(args: {
  message: string;
  privateKeyPem: string;
  kid: string;
  createdAt?: string;
}): SignatureEnvelope {
  const createdAt = args.createdAt ?? new Date().toISOString();
  const privateKey = createPrivateKey(args.privateKeyPem);
  const signatureBytes = sign(null, Buffer.from(args.message, "utf8"), privateKey);
  return signatureEnvelopeSchema.parse({
    kid: args.kid,
    algo: AUDIT_SIGNATURE_ALGO,
    created_at: createdAt,
    signature: toBase64Url(signatureBytes)
  });
}

export function verifyMessageEd25519(args: {
  message: string;
  signature: SignatureEnvelope;
  keyring: AuditKeyring;
}): { ok: boolean; reason?: string } {
  const parsed = signatureEnvelopeSchema.parse(args.signature);
  const key = args.keyring.keys[parsed.kid];
  if (!key) {
    return { ok: false, reason: `unknown_kid:${parsed.kid}` };
  }
  if (key.algo !== AUDIT_SIGNATURE_ALGO) {
    return { ok: false, reason: `unsupported_algo:${key.algo}` };
  }
  const publicKey = createPublicKey(key.public_key_pem);
  const ok = verify(null, Buffer.from(args.message, "utf8"), publicKey, fromBase64Url(parsed.signature));
  return ok ? { ok: true } : { ok: false, reason: "invalid_signature" };
}

export function parseSignatureEnvelope(input: unknown): SignatureEnvelope {
  return signatureEnvelopeSchema.parse(input);
}
