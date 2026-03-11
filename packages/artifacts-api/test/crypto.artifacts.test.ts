import { describe, expect, it } from "vitest";

import { computeArtifactId, signArtifact, verifyArtifactSignature, type ArtifactDeterminismInput } from "../src/crypto";

describe("crypto: artifacts determinism + sealing", () => {
  const base: ArtifactDeterminismInput = {
    artifactType: "brand.positioning",
    schemaVersion: 1,
    sourceArtifactIds: ["a1", "a2"],
    evalReport: { gates: [{ gateId: "G1", passed: true }], summary: "ok" },
    payload: { headline: "Revenue Intelligence" },
    sealedAt: "2026-02-23T12:00:00.000Z"
  };

  it("same determinism input yields same artifactId", () => {
    const a = computeArtifactId(base).artifactId;
    const b = computeArtifactId({ ...base }).artifactId;
    expect(a).toBe(b);
  });

  it("changing payload changes artifactId", () => {
    const a = computeArtifactId(base).artifactId;
    const b = computeArtifactId({ ...base, payload: { headline: "Different" } }).artifactId;
    expect(a).not.toBe(b);
  });

  it("signature changes if sealedAt changes", () => {
    const { artifactId } = computeArtifactId(base);
    const sigA = signArtifact({ signingKey: "k".repeat(64), artifactId, sealedAtIso: base.sealedAt });
    const sigB = signArtifact({
      signingKey: "k".repeat(64),
      artifactId,
      sealedAtIso: "2026-02-23T12:00:01.000Z"
    });
    expect(sigA).not.toBe(sigB);
  });

  it("signature changes if signingKey changes", () => {
    const { artifactId } = computeArtifactId(base);
    const sigA = signArtifact({ signingKey: "a".repeat(64), artifactId, sealedAtIso: base.sealedAt });
    const sigB = signArtifact({ signingKey: "b".repeat(64), artifactId, sealedAtIso: base.sealedAt });
    expect(sigA).not.toBe(sigB);
  });

  it("verifies a valid signature and rejects a mismatched one", () => {
    const { artifactId } = computeArtifactId(base);
    const signature = signArtifact({ signingKey: "k".repeat(64), artifactId, sealedAtIso: base.sealedAt });

    expect(
      verifyArtifactSignature({
        signingKey: "k".repeat(64),
        artifactId,
        sealedAtIso: base.sealedAt,
        signature
      })
    ).toBe(true);
    expect(
      verifyArtifactSignature({
        signingKey: "k".repeat(64),
        artifactId,
        sealedAtIso: "2026-02-23T12:00:01.000Z",
        signature
      })
    ).toBe(false);
  });
});
