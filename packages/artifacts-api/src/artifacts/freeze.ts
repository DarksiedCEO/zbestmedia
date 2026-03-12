import { canonicalJson, sha256Hex } from "../crypto";
import type { ArtifactGenerationStatus } from "./generation";
import type { ArtifactRecord } from "./service";

export type ReplayFreezeResult = {
  artifactId: string;
  tenantId: string;
  status: ArtifactGenerationStatus;
  requestHash: {
    stored: string | null;
    computed: string;
    matches: boolean;
  };
  inputHash: {
    stored: string | null;
    computed: string;
    matches: boolean;
  };
  outputHash: {
    stored: string | null;
    computed: string | null;
    matches: boolean;
  };
  freezeHash: string;
  freezeBundle: unknown;
};

export function buildArtifactReplayFreeze(record: ArtifactRecord): ReplayFreezeResult {
  const determinismInput = (record.determinismInput ?? {}) as Record<string, unknown>;
  const requestForHash =
    determinismInput && typeof determinismInput === "object" && determinismInput.request
      ? determinismInput.request
      : {
          tenantId: record.tenantId,
          artifactType: record.artifactType,
          schemaVersion: record.schemaVersion,
          sourceArtifactIds: record.sourceArtifactIds,
          supersedesArtifactId: record.supersedesArtifactId ?? null
        };

  const computedRequestHash = sha256Hex(canonicalJson(requestForHash));
  const computedInputHash = sha256Hex(canonicalJson(record.inputSnapshot ?? {}));
  const computedOutputHash = record.outputSnapshot == null ? null : sha256Hex(canonicalJson(record.outputSnapshot));

  const freezeBundle = {
    artifactId: record.artifactId,
    tenantId: record.tenantId,
    artifactType: record.artifactType,
    status: record.generationStatus ?? "COMPLETED",
    requestHash: computedRequestHash,
    inputHash: computedInputHash,
    outputHash: computedOutputHash,
    inputSnapshot: record.inputSnapshot ?? null,
    outputSnapshot: record.outputSnapshot ?? null,
    lineageSeed: record.lineageSeed ?? null,
    generationMetadata: record.generationMetadata ?? null,
    timestamps: {
      createdAt: record.createdAt,
      startedAt: record.startedAt ?? null,
      completedAt: record.completedAt ?? null,
      failedAt: record.failedAt ?? null,
      updatedAt: record.updatedAt ?? record.createdAt
    }
  };

  return {
    artifactId: record.artifactId,
    tenantId: record.tenantId,
    status: record.generationStatus ?? "COMPLETED",
    requestHash: {
      stored: record.requestHash ?? null,
      computed: computedRequestHash,
      matches: record.requestHash === computedRequestHash
    },
    inputHash: {
      stored: record.inputHash ?? null,
      computed: computedInputHash,
      matches: record.inputHash === computedInputHash
    },
    outputHash: {
      stored: record.outputHash ?? null,
      computed: computedOutputHash,
      matches: record.outputHash === computedOutputHash
    },
    freezeBundle,
    freezeHash: sha256Hex(canonicalJson(freezeBundle))
  };
}
