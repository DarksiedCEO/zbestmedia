import { describe, expect, it } from "vitest";

import { canonicalJson, computeArtifactId, sha256Hex } from "../src/crypto";

describe("artifact replay computation", () => {
  it("recomputed hash from canonical determinism input matches computeArtifactId", () => {
    const determinismInput = {
      artifactType: "brand.positioning",
      schemaVersion: 3,
      sourceArtifactIds: ["a1", "a2"],
      evalReport: { gates: [{ gateId: "G1", passed: true }], summary: "ok" },
      payload: { headline: "Revenue Intelligence", body: "Own your category." },
      sealedAt: "2026-02-24T00:00:00.000Z"
    };

    const canonical = canonicalJson(determinismInput);
    const recomputed = sha256Hex(canonical);
    const { artifactId } = computeArtifactId(determinismInput);

    expect(recomputed).toBe(artifactId);
  });
});
