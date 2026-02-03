import { describe, expect, it } from "vitest";
import {
  ArtifactRequested_v1,
  ForgeJobRequested_v1,
  ArtifactGenerated_v1,
  ArtifactEvaluated_v1,
  ArtifactRejected_v1,
  RegenerationRequested_v1,
  ArtifactStored_v1,
  ArtifactSealed_v1,
  PerformanceSignalsIngested_v1
} from "../src/index";

const baseMeta = {
  eventId: "evt-1",
  occurredAt: "2026-02-03T12:00:00Z"
};

const artifactMeta = {
  artifactId: "art-1",
  requestId: "req-1",
  artifactType: "BrandBible",
  schemaVersion: "1.0.0",
  lineage: {
    parentArtifactIds: [],
    sourceEventId: "evt-0",
    attempt: 1
  }
};

const evalReport = {
  reportId: "rep-1",
  artifactId: "art-1",
  artifactType: "BrandBible",
  schemaVersion: "1.0.0",
  overallScore: 0.9,
  recommendation: "accept",
  gateResults: [
    {
      gateId: "gate-1",
      status: "pass",
      reasonCodes: ["LOW_SCORE"],
      summary: "good",
      metrics: [
        { name: "clarity", score: 0.9, threshold: 0.7, weight: 0.4 }
      ]
    }
  ]
};

describe("brand event contracts", () => {
  it("validates event payloads", () => {
    expect(ArtifactRequested_v1.parse({
      ...baseMeta,
      eventVersion: "1.0.0",
      requestId: "req-1",
      artifactType: "BrandBible",
      brandId: "brand-1",
      personaId: "persona-1",
      targetSchemaVersion: "1.0.0",
      input: { brandId: "brand-1" },
      attempt: 1
    })).toBeTruthy();

    expect(ForgeJobRequested_v1.parse({
      ...baseMeta,
      eventVersion: "1.0.0",
      requestId: "req-1",
      jobType: "forge",
      artifactType: "BrandBible",
      brandId: "brand-1",
      input: { prompt: "ship" },
      attempt: 1,
      priority: "normal"
    })).toBeTruthy();

    expect(ArtifactGenerated_v1.parse({
      ...baseMeta,
      eventVersion: "1.0.0",
      requestId: "req-1",
      artifactId: "art-1",
      artifactType: "BrandBible",
      artifactMeta,
      artifact: { title: "Brand Bible" }
    })).toBeTruthy();

    expect(ArtifactEvaluated_v1.parse({
      ...baseMeta,
      eventVersion: "1.0.0",
      artifactId: "art-1",
      report: evalReport
    })).toBeTruthy();

    expect(ArtifactRejected_v1.parse({
      ...baseMeta,
      eventVersion: "1.0.0",
      artifactId: "art-1",
      reportId: "rep-1",
      reasonCodes: ["OUT_OF_BRAND"],
      notes: "adjust tone"
    })).toBeTruthy();

    expect(RegenerationRequested_v1.parse({
      ...baseMeta,
      eventVersion: "1.0.0",
      artifactId: "art-1",
      requestId: "req-2",
      directive: {
        regen: true,
        maxAttempts: 3,
        strategy: "rewrite",
        focusAreas: ["clarity"],
        notes: "tighten"
      }
    })).toBeTruthy();

    expect(ArtifactStored_v1.parse({
      ...baseMeta,
      eventVersion: "1.0.0",
      artifactId: "art-1",
      storageKey: "s3://bucket/key",
      checksum: "sha256:abc"
    })).toBeTruthy();

    expect(ArtifactSealed_v1.parse({
      ...baseMeta,
      eventVersion: "1.0.0",
      artifactId: "art-1",
      sealVersion: "1.0.0",
      signer: "falcon"
    })).toBeTruthy();

    expect(PerformanceSignalsIngested_v1.parse({
      ...baseMeta,
      eventVersion: "1.0.0",
      brandId: "brand-1",
      period: { startDate: "2026-01-01", endDate: "2026-01-31" },
      signals: [
        { channel: "youtube", metric: "views", value: 1000 }
      ]
    })).toBeTruthy();
  });
});
