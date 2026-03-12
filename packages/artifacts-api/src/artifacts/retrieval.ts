import type { ArtifactRecord } from "./service";
import type { ArtifactGenerationFailureClass, ArtifactGenerationStatus } from "./generation";

export type ArtifactGenerationDetail = {
  artifactId: string;
  tenantId: string;
  artifactType: string;
  status: ArtifactGenerationStatus;
  requestHash: string | null;
  inputHash: string | null;
  outputHash: string | null;
  inputSnapshot: unknown;
  lineage: unknown;
  output: unknown;
  metadata: unknown;
  error: {
    failureClass: ArtifactGenerationFailureClass;
    message: string;
    details: unknown;
  } | null;
  timestamps: {
    createdAt: string;
    updatedAt: string;
    startedAt: string | null;
    completedAt: string | null;
    failedAt: string | null;
  };
};

export type ArtifactGenerationSummary = {
  artifactId: string;
  artifactType: string;
  status: ArtifactGenerationStatus;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  failedAt: string | null;
};

export function mapArtifactRecordToDetail(record: ArtifactRecord): ArtifactGenerationDetail {
  const status = (record.generationStatus ?? "COMPLETED") as ArtifactGenerationStatus;
  const error =
    record.failureClass && record.failureMessage
      ? {
          failureClass: record.failureClass,
          message: record.failureMessage,
          details: record.failureDetails ?? null
        }
      : null;

  return {
    artifactId: record.artifactId,
    tenantId: record.tenantId,
    artifactType: record.artifactType,
    status,
    requestHash: record.requestHash ?? null,
    inputHash: record.inputHash ?? null,
    outputHash: record.outputHash ?? null,
    inputSnapshot: record.inputSnapshot ?? null,
    lineage: record.lineageSeed ?? null,
    output: record.outputSnapshot ?? record.payload ?? null,
    metadata: record.generationMetadata ?? null,
    error,
    timestamps: {
      createdAt: record.createdAt,
      updatedAt: record.updatedAt ?? record.createdAt,
      startedAt: record.startedAt ?? null,
      completedAt: record.completedAt ?? null,
      failedAt: record.failedAt ?? null
    }
  };
}

export function mapArtifactRecordToSummary(record: ArtifactRecord): ArtifactGenerationSummary {
  return {
    artifactId: record.artifactId,
    artifactType: record.artifactType,
    status: (record.generationStatus ?? "COMPLETED") as ArtifactGenerationStatus,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt ?? record.createdAt,
    completedAt: record.completedAt ?? null,
    failedAt: record.failedAt ?? null
  };
}
