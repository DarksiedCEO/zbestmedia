import fs from "node:fs";

import { z } from "zod";

import { canonicalJson, sha256Hex } from "../audit/common";
import { loadAuditKeyring, type AuditKeyring } from "../audit/keyring";
import { signMessageEd25519, verifyMessageEd25519, type SignatureEnvelope } from "../audit/signing";

const guardrailThresholdsSchema = z.object({
  p95InflationRatioCap: z.number(),
  p99InflationRatioCap: z.number(),
  errorRateIncreasePctPointsCap: z.number(),
  timeoutIncreasePctPointsCap: z.number(),
  breakerOpenRateIncreasePctPointsCap: z.number(),
  retryAmplificationIncreaseCap: z.number()
});

const contractEntrySchema = z.object({
  guardrails_profile_key: z.string().min(1),
  thresholds: guardrailThresholdsSchema,
  budgets: z.record(z.string(), z.number()).default({}),
  severity_rules: z.record(z.string(), z.string()).default({})
});

const sloContractsSchema = z.object({
  version: z.string().min(1),
  effective_at: z.string().datetime(),
  contracts: z.record(z.string(), contractEntrySchema)
});

const signedDocumentSchema = z.object({
  payload_hash: z.string().regex(/^[a-f0-9]{64}$/),
  signature: z.object({
    kid: z.string().min(1),
    algo: z.literal("ed25519"),
    created_at: z.string().datetime(),
    signature: z.string().min(1)
  })
});

export type SloContracts = z.infer<typeof sloContractsSchema>;
export type SignedDocument = z.infer<typeof signedDocumentSchema>;

export function parseSloContracts(input: unknown): SloContracts {
  return sloContractsSchema.parse(input);
}

export function parseSignedDocument(input: unknown): SignedDocument {
  return signedDocumentSchema.parse(input);
}

export function computeContractPayloadHash(contracts: SloContracts): string {
  return sha256Hex(canonicalJson(contracts));
}

export function signSloContracts(args: {
  contracts: SloContracts;
  kid: string;
  privateKeyPem: string;
  createdAt?: string;
}): SignedDocument {
  const payloadHash = computeContractPayloadHash(args.contracts);
  const signature = signMessageEd25519({
    message: payloadHash,
    privateKeyPem: args.privateKeyPem,
    kid: args.kid,
    createdAt: args.createdAt
  });
  return signedDocumentSchema.parse({
    payload_hash: payloadHash,
    signature
  });
}

export function verifySloContractsSignature(args: {
  contracts: SloContracts;
  signed: SignedDocument;
  keyring: AuditKeyring;
}): { ok: boolean; reason?: string } {
  const payloadHash = computeContractPayloadHash(args.contracts);
  if (payloadHash !== args.signed.payload_hash) {
    return { ok: false, reason: "payload_hash_mismatch" };
  }
  return verifyMessageEd25519({
    message: payloadHash,
    signature: args.signed.signature as SignatureEnvelope,
    keyring: args.keyring
  });
}

export function loadContractsAndSignature(args: {
  contractsPath: string;
  signaturePath: string;
}): { contracts: SloContracts; signed: SignedDocument } {
  const contracts = parseSloContracts(JSON.parse(fs.readFileSync(args.contractsPath, "utf8")));
  const signed = parseSignedDocument(JSON.parse(fs.readFileSync(args.signaturePath, "utf8")));
  return { contracts, signed };
}

export function loadContractsKeyring(keyringPath: string): AuditKeyring {
  return loadAuditKeyring(keyringPath);
}
