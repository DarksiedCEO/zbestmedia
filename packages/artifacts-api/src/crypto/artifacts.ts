import { canonicalJson } from "./canonical";
import { hmacSha256Hex, sha256Hex } from "./sha";

export type ArtifactDeterminismInput = {
  artifactType: string;
  schemaVersion: number;
  sourceArtifactIds: string[];
  evalReport: unknown;
  payload: unknown;
  sealedAt: string;
};

export function computeArtifactId(input: ArtifactDeterminismInput): {
  artifactId: string;
  canonical: string;
} {
  const canonical = canonicalJson(input);
  const artifactId = sha256Hex(canonical);
  return { artifactId, canonical };
}

export function signArtifact(args: {
  signingKey: string;
  artifactId: string;
  sealedAtIso: string;
}): string {
  return hmacSha256Hex(args.signingKey, `${args.artifactId}:${args.sealedAtIso}`);
}

export function verifyArtifactSignature(args: {
  signingKey: string;
  artifactId: string;
  sealedAtIso: string;
  signature: string;
}): boolean {
  return signArtifact({
    signingKey: args.signingKey,
    artifactId: args.artifactId,
    sealedAtIso: args.sealedAtIso
  }) === args.signature;
}
