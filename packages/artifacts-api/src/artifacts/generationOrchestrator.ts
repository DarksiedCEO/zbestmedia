import type { FastifyBaseLogger } from "fastify";

import type { ArtifactService } from "./service";
import type { ArtifactGenerateRequest, ArtifactGenerationError, ArtifactGenerationResponse } from "./generation";

export type OrcaGenerationResult = {
  id: string;
  provider: string;
  model: string;
  outputText: string;
  usage?: Record<string, unknown> | null;
  latencyMs?: number | null;
  finishReason?: string | null;
  warnings?: string[];
  responseCorrelationId?: string | null;
  durationMsHeader?: string | null;
};

export type OrcaGenerationClient = {
  generate(args: {
    correlationId: string;
    tenantId: string;
    artifactType: string;
    templateKey?: string;
    workflowKey?: string;
    input: unknown;
    providerOverrides?: Record<string, unknown>;
  }): Promise<OrcaGenerationResult>;
};

function toFailure(err: unknown): ArtifactGenerationError {
  const e = err as {
    failureClass?: string;
    message?: string;
    httpStatus?: number;
    retryCount?: number;
    details?: Record<string, unknown>;
  };
  const failureClass =
    (e.failureClass as ArtifactGenerationError["failureClass"]) ??
    (typeof e.httpStatus === "number" && (e.httpStatus === 401 || e.httpStatus === 403) ? "AUTH_ERROR" : "GENERATION_ERROR");
  return {
    failureClass,
    message: e.message ?? "artifact generation failed",
    httpStatus: e.httpStatus,
    retryCount: e.retryCount,
    details: e.details
  };
}

function parseOutputSnapshot(outputText: string): unknown {
  const text = outputText.trim();
  if (!text) return { outputText: "" };
  const fence = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const candidate = fence ? fence[1].trim() : text;
  try {
    return JSON.parse(candidate);
  } catch {
    return { outputText: text };
  }
}

function mapResponse(args: {
  request: ArtifactGenerateRequest;
  record: Awaited<ReturnType<ArtifactService["getById"]>>;
  error: ArtifactGenerationError | null;
}): ArtifactGenerationResponse {
  if (!args.record) {
    throw new Error("artifact record missing after generation");
  }
  const record = args.record;
  return {
    artifactId: record.artifactId,
    artifactType: record.artifactType,
    status: record.generationStatus ?? "FAILED",
    createdAt: record.createdAt,
    completedAt: record.completedAt ?? null,
    request: args.request,
    output: record.outputSnapshot ?? undefined,
    metadata: {
      provider: (record.generationMetadata as Record<string, unknown> | null)?.provider as string | undefined,
      model: (record.generationMetadata as Record<string, unknown> | null)?.model as string | undefined,
      usage: (record.generationMetadata as Record<string, unknown> | null)?.usage as Record<string, unknown> | undefined,
      latencyMs: (record.generationMetadata as Record<string, unknown> | null)?.latencyMs as number | undefined,
      finishReason: (record.generationMetadata as Record<string, unknown> | null)?.finishReason as string | undefined,
      warnings:
        ((record.generationMetadata as Record<string, unknown> | null)?.warnings as string[] | undefined) ?? []
    },
    lineage:
      (record.lineageSeed as ArtifactGenerationResponse["lineage"]) ??
      {
        requestContractVersion: "1.0",
        inputHash: record.inputHash ?? "",
        correlationId: args.request.correlationId
      },
    error: args.error,
    updatedAt: record.updatedAt ?? record.createdAt
  };
}

export class ArtifactGenerationOrchestrator {
  constructor(
    private readonly service: ArtifactService,
    private readonly orcaClient: OrcaGenerationClient
  ) {}

  async generateArtifact(args: {
    request: ArtifactGenerateRequest;
    logger: FastifyBaseLogger;
  }): Promise<ArtifactGenerationResponse> {
    const started = Date.now();
    let artifactId: string | null = null;

    args.logger.info({
      event: "artifact_generation_started",
      correlationId: args.request.correlationId,
      tenantId: args.request.tenantId,
      artifactType: args.request.artifactType
    });

    try {
      const created = await this.service.createArtifactRecord({
        request: args.request,
        workflowVersion: args.request.workflowKey,
        templateVersion: args.request.templateKey
      });
      artifactId = created.artifactId;

      await this.service.markArtifactGenerating({ tenantId: args.request.tenantId, artifactId });
      args.logger.info({
        event: "artifact_generation_marked_generating",
        artifactId,
        correlationId: args.request.correlationId,
        tenantId: args.request.tenantId
      });

      const out = await this.orcaClient.generate({
        correlationId: args.request.correlationId,
        tenantId: args.request.tenantId,
        artifactType: args.request.artifactType,
        templateKey: args.request.templateKey,
        workflowKey: args.request.workflowKey,
        input: args.request.input,
        providerOverrides: args.request.providerOverrides
      });

      const outputSnapshot = parseOutputSnapshot(out.outputText);

      await this.service.completeArtifactGeneration({
        tenantId: args.request.tenantId,
        artifactId,
        outputSnapshot,
        metadata: {
          provider: out.provider,
          model: out.model,
          usage: out.usage ?? null,
          latencyMs: out.latencyMs ?? null,
          finishReason: out.finishReason ?? null,
          warnings: out.warnings ?? [],
          responseCorrelationId: out.responseCorrelationId ?? null,
          durationMsHeader: out.durationMsHeader ?? null
        },
        lineagePatch: {
          provider: out.provider,
          model: out.model,
          retryCount: 0
        }
      });

      const record = await this.service.getById({ tenantId: args.request.tenantId, artifactId });
      args.logger.info({
        event: "artifact_generation_completed",
        artifactId,
        correlationId: args.request.correlationId,
        tenantId: args.request.tenantId,
        provider: out.provider,
        model: out.model,
        durationMs: Date.now() - started,
        status: "COMPLETED"
      });
      return mapResponse({ request: args.request, record, error: null });
    } catch (err) {
      const failure = toFailure(err);
      if (artifactId) {
        await this.service.failArtifactGeneration({
          tenantId: args.request.tenantId,
          artifactId,
          failureClass: failure.failureClass,
          failureMessage: failure.message,
          failureDetails: failure.details
        });
      }

      const record = artifactId ? await this.service.getById({ tenantId: args.request.tenantId, artifactId }) : null;
      args.logger.error({
        event: "artifact_generation_failed",
        artifactId,
        correlationId: args.request.correlationId,
        tenantId: args.request.tenantId,
        artifactType: args.request.artifactType,
        durationMs: Date.now() - started,
        status: "FAILED",
        failureClass: failure.failureClass,
        httpStatus: failure.httpStatus ?? null
      });

      if (record) {
        return mapResponse({ request: args.request, record, error: failure });
      }
      throw err;
    }
  }
}
