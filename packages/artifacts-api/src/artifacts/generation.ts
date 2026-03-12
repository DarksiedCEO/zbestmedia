import { z } from "zod";

import { canonicalJson, sha256Hex } from "../crypto";

export const ArtifactGenerationStatusSchema = z.enum(["PENDING", "GENERATING", "COMPLETED", "FAILED"]);
export type ArtifactGenerationStatus = z.infer<typeof ArtifactGenerationStatusSchema>;

export const ArtifactGenerationFailureClassSchema = z.enum([
  "VALIDATION_ERROR",
  "ARTIFACT_PERSISTENCE_ERROR",
  "GENERATION_ERROR",
  "REPLAY_DATA_ERROR",
  "STATE_TRANSITION_ERROR",
  "CONFIG_ERROR",
  "AUTH_ERROR",
  "TENANT_ERROR",
  "UPSTREAM_4XX",
  "UPSTREAM_5XX",
  "TIMEOUT",
  "NETWORK_ERROR",
  "INVALID_RESPONSE"
]);
export type ArtifactGenerationFailureClass = z.infer<typeof ArtifactGenerationFailureClassSchema>;

export const ArtifactProviderOverrideSchema = z
  .object({
    provider: z.string().min(1).optional(),
    model: z.string().min(1).optional(),
    temperature: z.number().min(0).max(2).optional(),
    maxTokens: z.number().int().positive().optional()
  })
  .strict();

export const ArtifactGenerateRequestSchema = z
  .object({
    artifactType: z.string().min(1),
    templateKey: z.string().min(1).optional(),
    workflowKey: z.string().min(1).optional(),
    input: z.record(z.unknown()),
    tenantId: z.string().min(1),
    requestedBy: z.string().min(1),
    correlationId: z.string().min(1),
    idempotencyKey: z.string().min(1).max(256).optional(),
    generationMode: z.enum(["sync"]).default("sync"),
    providerOverrides: ArtifactProviderOverrideSchema.optional(),
    requestSource: z.string().min(1).default("artifacts-api")
  })
  .strict()
  .refine((v) => Boolean(v.templateKey || v.workflowKey), {
    message: "Either templateKey or workflowKey is required",
    path: ["templateKey"]
  });
export type ArtifactGenerateRequest = z.infer<typeof ArtifactGenerateRequestSchema>;

export const ArtifactGenerationErrorSchema = z
  .object({
    failureClass: ArtifactGenerationFailureClassSchema,
    message: z.string().min(1),
    httpStatus: z.number().int().positive().optional(),
    retryCount: z.number().int().nonnegative().optional(),
    details: z.record(z.unknown()).optional()
  })
  .strict();
export type ArtifactGenerationError = z.infer<typeof ArtifactGenerationErrorSchema>;

export const ArtifactGenerationLineageSchema = z
  .object({
    requestContractVersion: z.literal("1.0"),
    workflowVersion: z.string().min(1).optional(),
    templateVersion: z.string().min(1).optional(),
    provider: z.string().min(1).optional(),
    model: z.string().min(1).optional(),
    promptFingerprint: z.string().min(1).optional(),
    inputHash: z.string().min(1),
    outputHash: z.string().min(1).optional(),
    correlationId: z.string().min(1),
    runtimeVersion: z.string().min(1).optional(),
    environment: z.string().min(1).optional(),
    retryCount: z.number().int().nonnegative().optional()
  })
  .strict();
export type ArtifactGenerationLineage = z.infer<typeof ArtifactGenerationLineageSchema>;

export const ArtifactGenerationResponseSchema = z
  .object({
    artifactId: z.string().min(1),
    artifactType: z.string().min(1),
    status: ArtifactGenerationStatusSchema,
    createdAt: z.string().datetime(),
    completedAt: z.string().datetime().nullable().optional(),
    request: ArtifactGenerateRequestSchema,
    output: z.unknown().optional(),
    metadata: z
      .object({
        provider: z.string().min(1).optional(),
        model: z.string().min(1).optional(),
        usage: z.record(z.unknown()).optional(),
        latencyMs: z.number().nonnegative().optional(),
        finishReason: z.string().min(1).optional(),
        warnings: z.array(z.string()).default([])
      })
      .strict()
      .default({ warnings: [] }),
    lineage: ArtifactGenerationLineageSchema,
    error: ArtifactGenerationErrorSchema.nullable().optional(),
    updatedAt: z.string().datetime()
  })
  .strict();
export type ArtifactGenerationResponse = z.infer<typeof ArtifactGenerationResponseSchema>;

const VALID_TRANSITIONS: Record<ArtifactGenerationStatus, ArtifactGenerationStatus[]> = {
  PENDING: ["GENERATING", "FAILED"],
  GENERATING: ["COMPLETED", "FAILED"],
  COMPLETED: [],
  FAILED: []
};

export class ArtifactGenerationStateError extends Error {
  code: ArtifactGenerationFailureClass = "STATE_TRANSITION_ERROR";
  from: ArtifactGenerationStatus;
  to: ArtifactGenerationStatus;

  constructor(args: { from: ArtifactGenerationStatus; to: ArtifactGenerationStatus }) {
    super(`Invalid generation state transition: ${args.from} -> ${args.to}`);
    this.name = "ArtifactGenerationStateError";
    this.from = args.from;
    this.to = args.to;
  }
}

export function canTransitionArtifactGenerationStatus(
  from: ArtifactGenerationStatus,
  to: ArtifactGenerationStatus
): boolean {
  return VALID_TRANSITIONS[from].includes(to);
}

export function assertArtifactGenerationTransition(
  from: ArtifactGenerationStatus,
  to: ArtifactGenerationStatus
): void {
  if (!canTransitionArtifactGenerationStatus(from, to)) {
    throw new ArtifactGenerationStateError({ from, to });
  }
}

export function buildInitialArtifactGenerationRecord(args: {
  request: ArtifactGenerateRequest;
  workflowVersion?: string;
  templateVersion?: string;
  runtimeVersion?: string;
  environment?: string;
}): {
  artifactId: string;
  status: ArtifactGenerationStatus;
  requestHash: string;
  inputHash: string;
  inputSnapshot: unknown;
  lineage: ArtifactGenerationLineage;
  createdAt: string;
  updatedAt: string;
} {
  const now = new Date().toISOString();
  const inputSnapshot = args.request.input;
  const inputCanonical = canonicalJson(inputSnapshot);
  const inputHash = sha256Hex(inputCanonical);
  const requestHash = sha256Hex(canonicalJson(args.request));
  const artifactId = sha256Hex(
    canonicalJson({
      requestHash,
      correlationId: args.request.correlationId,
      artifactType: args.request.artifactType,
      templateKey: args.request.templateKey ?? null,
      workflowKey: args.request.workflowKey ?? null
    })
  );

  return {
    artifactId,
    status: "PENDING",
    requestHash,
    inputHash,
    inputSnapshot,
    lineage: {
      requestContractVersion: "1.0",
      workflowVersion: args.workflowVersion,
      templateVersion: args.templateVersion,
      inputHash,
      correlationId: args.request.correlationId,
      runtimeVersion: args.runtimeVersion,
      environment: args.environment
    },
    createdAt: now,
    updatedAt: now
  };
}
