import { canonicalJson, sha256Hex } from "../crypto";
import type { ArtifactRecord } from "./service";
import type { ArtifactGenerationFailureClass, ArtifactGenerationStatus } from "./generation";

type ReplayEvalMetadata = {
  provider?: string;
  model?: string;
  usage?: Record<string, unknown> | null;
  latencyMs?: number | null;
  finishReason?: string | null;
  warnings?: string[];
  responseCorrelationId?: string | null;
};

export type ArtifactReplayEvalSnapshot = {
  artifactId: string;
  tenantId: string;
  artifactType: string;
  status: ArtifactGenerationStatus;
  requestHash: string | null;
  inputHash: string | null;
  outputHash: string | null;
  inputSnapshot: unknown;
  outputSnapshot: unknown | null;
  lineage: unknown;
  metadata: ReplayEvalMetadata;
  failure: {
    failureClass: ArtifactGenerationFailureClass;
    message: string;
    details: unknown;
  } | null;
  timestamps: {
    createdAt: string;
    startedAt: string | null;
    completedAt: string | null;
    failedAt: string | null;
  };
  snapshotHash: string;
};

function mapReplayMetadata(raw: unknown): ReplayEvalMetadata {
  if (!raw || typeof raw !== "object") {
    return {};
  }
  const metadata = raw as Record<string, unknown>;
  return {
    provider: typeof metadata.provider === "string" ? metadata.provider : undefined,
    model: typeof metadata.model === "string" ? metadata.model : undefined,
    usage: (metadata.usage as Record<string, unknown> | null | undefined) ?? null,
    latencyMs: typeof metadata.latencyMs === "number" ? metadata.latencyMs : null,
    finishReason: typeof metadata.finishReason === "string" ? metadata.finishReason : null,
    warnings: Array.isArray(metadata.warnings) ? metadata.warnings.filter((v): v is string => typeof v === "string") : [],
    responseCorrelationId: typeof metadata.responseCorrelationId === "string" ? metadata.responseCorrelationId : null
  };
}

export function buildArtifactReplayEvalSnapshot(record: ArtifactRecord): ArtifactReplayEvalSnapshot {
  const status = (record.generationStatus ?? "COMPLETED") as ArtifactGenerationStatus;
  const failure =
    record.failureClass && record.failureMessage
      ? {
          failureClass: record.failureClass,
          message: record.failureMessage,
          details: record.failureDetails ?? null
        }
      : null;

  const envelope = {
    artifactId: record.artifactId,
    tenantId: record.tenantId,
    artifactType: record.artifactType,
    status,
    requestHash: record.requestHash ?? null,
    inputHash: record.inputHash ?? null,
    outputHash: record.outputHash ?? null,
    inputSnapshot: record.inputSnapshot ?? null,
    outputSnapshot: record.outputSnapshot ?? null,
    lineage: record.lineageSeed ?? null,
    metadata: mapReplayMetadata(record.generationMetadata),
    failure,
    timestamps: {
      createdAt: record.createdAt,
      startedAt: record.startedAt ?? null,
      completedAt: record.completedAt ?? null,
      failedAt: record.failedAt ?? null
    }
  };

  return {
    ...envelope,
    snapshotHash: sha256Hex(canonicalJson(envelope))
  };
}
