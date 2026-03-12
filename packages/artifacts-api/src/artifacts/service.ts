import { timingSafeEqual } from "node:crypto";
import type { Pool } from "pg";

import { canonicalJson, computeArtifactId, sha256Hex, signArtifact } from "../crypto";
import { withTenant } from "../db/withTenant";
import { buildArtifactReplayFreeze, type ReplayFreezeResult } from "./freeze";
import type { ArtifactGenerateRequest, ArtifactGenerationFailureClass, ArtifactGenerationLineage, ArtifactGenerationStatus } from "./generation";
import {
  ArtifactGenerationStateError,
  assertArtifactGenerationTransition,
  buildInitialArtifactGenerationRecord
} from "./generation";

export type ArtifactRecord = {
  tenantId: string;
  artifactId: string;
  artifactType: string;
  schemaVersion: number;
  generationStatus?: ArtifactGenerationStatus;
  requestHash?: string | null;
  inputHash?: string | null;
  outputHash?: string | null;
  inputSnapshot?: unknown;
  lineageSeed?: ArtifactGenerationLineage | null;
  failureClass?: ArtifactGenerationFailureClass | null;
  failureMessage?: string | null;
  failureDetails?: unknown;
  outputSnapshot?: unknown;
  generationMetadata?: unknown;
  startedAt?: string | null;
  completedAt?: string | null;
  failedAt?: string | null;
  updatedAt?: string;
  createdAt: string;
  sealedAt: string;
  signature: string;
  sourceArtifactIds: string[];
  supersedesArtifactId: string | null;
  evalReport: unknown;
  payload: unknown;
  determinismInput: unknown;
};

export type SupersedesChainEntry = {
  artifactId: string;
  artifactType?: string;
  schemaVersion?: number;
  sealedAt?: string;
  missing?: true;
};

export type ListArtifactsArgs = {
  tenantId: string;
  status?: ArtifactGenerationStatus;
  artifactType?: string;
  createdAfter?: string;
  createdBefore?: string;
  limit: number;
  offset: number;
};

type DbArtifactRow = {
  tenant_id: string;
  artifact_id: string;
  artifact_type: string;
  schema_version: number;
  generation_status: ArtifactGenerationStatus | null;
  request_hash: string | null;
  input_hash: string | null;
  output_hash: string | null;
  input_snapshot: unknown;
  lineage_seed: unknown;
  failure_class: ArtifactGenerationFailureClass | null;
  failure_message: string | null;
  failure_details: unknown;
  output_snapshot: unknown;
  generation_metadata: unknown;
  started_at: string | Date | null;
  completed_at: string | Date | null;
  failed_at: string | Date | null;
  updated_at: string | Date;
  created_at: string | Date;
  sealed_at: string | Date;
  signature: string;
  source_artifact_ids: string[];
  supersedes_artifact_id: string | null;
  eval_report: unknown;
  payload: unknown;
  determinism_input: unknown;
};

type DbChainRow = {
  artifact_id: string;
  artifact_type: string;
  schema_version: number;
  sealed_at: string | Date;
  supersedes_artifact_id: string | null;
};

function toIsoString(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function mapRow(row: DbArtifactRow): ArtifactRecord {
  return {
    tenantId: row.tenant_id,
    artifactId: row.artifact_id,
    artifactType: row.artifact_type,
    schemaVersion: row.schema_version,
    generationStatus: row.generation_status ?? undefined,
    requestHash: row.request_hash ?? null,
    inputHash: row.input_hash ?? null,
    outputHash: row.output_hash ?? null,
    inputSnapshot: row.input_snapshot ?? null,
    lineageSeed: (row.lineage_seed as ArtifactGenerationLineage | null) ?? null,
    failureClass: row.failure_class ?? null,
    failureMessage: row.failure_message ?? null,
    failureDetails: row.failure_details ?? null,
    outputSnapshot: row.output_snapshot ?? null,
    generationMetadata: row.generation_metadata ?? null,
    startedAt: row.started_at ? toIsoString(row.started_at) : null,
    completedAt: row.completed_at ? toIsoString(row.completed_at) : null,
    failedAt: row.failed_at ? toIsoString(row.failed_at) : null,
    updatedAt: toIsoString(row.updated_at),
    createdAt: toIsoString(row.created_at),
    sealedAt: toIsoString(row.sealed_at),
    signature: row.signature,
    sourceArtifactIds: row.source_artifact_ids,
    supersedesArtifactId: row.supersedes_artifact_id,
    evalReport: row.eval_report,
    payload: row.payload,
    determinismInput: row.determinism_input
  };
}

export class ArtifactService {
  constructor(
    private readonly pool: Pool,
    private readonly signingKey: string,
    private readonly runWithTenant: typeof withTenant = withTenant
  ) {}

  async createArtifactRecord(args: {
    request: ArtifactGenerateRequest;
    workflowVersion?: string;
    templateVersion?: string;
    runtimeVersion?: string;
    environment?: string;
  }): Promise<{
    artifactId: string;
    status: ArtifactGenerationStatus;
    createdAt: string;
    updatedAt: string;
    requestHash: string;
    inputHash: string;
    lineageSeed: ArtifactGenerationLineage;
  }> {
    const initial = buildInitialArtifactGenerationRecord({
      request: args.request,
      workflowVersion: args.workflowVersion,
      templateVersion: args.templateVersion,
      runtimeVersion: args.runtimeVersion,
      environment: args.environment
    });
    const signature = signArtifact({
      signingKey: this.signingKey,
      artifactId: initial.artifactId,
      sealedAtIso: initial.createdAt
    });
    const generationMetadata = {
      requestSource: args.request.requestSource,
      generationMode: args.request.generationMode,
      idempotencyKey: args.request.idempotencyKey ?? null,
      providerOverrides: args.request.providerOverrides ?? null
    };

    await this.runWithTenant(this.pool, args.request.tenantId, async (client) => {
      await client.query(
        `
        INSERT INTO artifacts (
          tenant_id,
          artifact_id,
          artifact_type,
          schema_version,
          generation_status,
          request_hash,
          input_hash,
          output_hash,
          input_snapshot,
          lineage_seed,
          generation_metadata,
          started_at,
          completed_at,
          failed_at,
          updated_at,
          sealed_at,
          signature,
          source_artifact_ids,
          supersedes_artifact_id,
          eval_report,
          payload,
          determinism_input
        ) VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, NULL, $8::jsonb, $9::jsonb, $10::jsonb,
          NULL, NULL, NULL, now(),
          $11, $12, '{}'::text[], NULL, $13::jsonb, $14::jsonb, $15::jsonb
        )
        `,
        [
          args.request.tenantId,
          initial.artifactId,
          args.request.artifactType,
          1,
          initial.status,
          initial.requestHash,
          initial.inputHash,
          JSON.stringify(initial.inputSnapshot),
          JSON.stringify(initial.lineage),
          JSON.stringify(generationMetadata),
          initial.createdAt,
          signature,
          JSON.stringify({ gates: [{ gateId: "generation.pending", passed: true }], summary: "pending generation" }),
          JSON.stringify({}),
          JSON.stringify({ request: args.request, initial })
        ]
      );
    });

    return {
      artifactId: initial.artifactId,
      status: initial.status,
      createdAt: initial.createdAt,
      updatedAt: initial.updatedAt,
      requestHash: initial.requestHash,
      inputHash: initial.inputHash,
      lineageSeed: initial.lineage
    };
  }

  async markArtifactGenerating(args: { tenantId: string; artifactId: string }): Promise<{ status: ArtifactGenerationStatus; startedAt: string }> {
    const startedAt = new Date().toISOString();
    const res = await this.runWithTenant(this.pool, args.tenantId, async (client) => {
      return client.query<{ generation_status: ArtifactGenerationStatus; started_at: string | Date }>(
        `
        UPDATE artifacts
        SET generation_status = 'GENERATING',
            started_at = $3,
            updated_at = now()
        WHERE tenant_id = $1
          AND artifact_id = $2
          AND generation_status = 'PENDING'
        RETURNING generation_status, started_at
        `,
        [args.tenantId, args.artifactId, startedAt]
      );
    });

    const row = res.rows[0];
    if (!row) {
      await this.assertTransitionable(args.tenantId, args.artifactId, "PENDING", "GENERATING");
      throw new Error("not_found");
    }
    return {
      status: row.generation_status,
      startedAt: toIsoString(row.started_at)
    };
  }

  async completeArtifactGeneration(args: {
    tenantId: string;
    artifactId: string;
    outputSnapshot: unknown;
    metadata?: unknown;
    lineagePatch?: Partial<ArtifactGenerationLineage>;
  }): Promise<{ status: ArtifactGenerationStatus; completedAt: string }> {
    const completedAt = new Date().toISOString();
    const outputHash = sha256Hex(canonicalJson(args.outputSnapshot ?? {}));
    const res = await this.runWithTenant(this.pool, args.tenantId, async (client) => {
      return client.query<{ generation_status: ArtifactGenerationStatus; completed_at: string | Date }>(
        `
        UPDATE artifacts
        SET generation_status = 'COMPLETED',
            output_snapshot = $3::jsonb,
            output_hash = $4,
            generation_metadata = COALESCE(generation_metadata, '{}'::jsonb) || COALESCE($5::jsonb, '{}'::jsonb),
            lineage_seed = COALESCE(lineage_seed, '{}'::jsonb) || COALESCE($6::jsonb, '{}'::jsonb),
            completed_at = $7,
            failed_at = NULL,
            failure_class = NULL,
            failure_message = NULL,
            failure_details = NULL,
            updated_at = now()
        WHERE tenant_id = $1
          AND artifact_id = $2
          AND generation_status = 'GENERATING'
        RETURNING generation_status, completed_at
        `,
        [
          args.tenantId,
          args.artifactId,
          JSON.stringify(args.outputSnapshot),
          outputHash,
          JSON.stringify(args.metadata ?? {}),
          JSON.stringify({ ...(args.lineagePatch ?? {}), outputHash }),
          completedAt
        ]
      );
    });

    const row = res.rows[0];
    if (!row) {
      await this.assertTransitionable(args.tenantId, args.artifactId, "GENERATING", "COMPLETED");
      throw new Error("not_found");
    }
    return {
      status: row.generation_status,
      completedAt: toIsoString(row.completed_at)
    };
  }

  async failArtifactGeneration(args: {
    tenantId: string;
    artifactId: string;
    failureClass: ArtifactGenerationFailureClass;
    failureMessage: string;
    failureDetails?: unknown;
  }): Promise<{ status: ArtifactGenerationStatus; failedAt: string }> {
    const failedAt = new Date().toISOString();
    const res = await this.runWithTenant(this.pool, args.tenantId, async (client) => {
      return client.query<{ generation_status: ArtifactGenerationStatus; failed_at: string | Date }>(
        `
        UPDATE artifacts
        SET generation_status = 'FAILED',
            failure_class = $3,
            failure_message = $4,
            failure_details = COALESCE($5::jsonb, '{}'::jsonb),
            failed_at = $6,
            updated_at = now()
        WHERE tenant_id = $1
          AND artifact_id = $2
          AND generation_status IN ('PENDING', 'GENERATING')
        RETURNING generation_status, failed_at
        `,
        [args.tenantId, args.artifactId, args.failureClass, args.failureMessage, JSON.stringify(args.failureDetails ?? {}), failedAt]
      );
    });

    const row = res.rows[0];
    if (!row) {
      const current = await this.getCurrentStatus(args.tenantId, args.artifactId);
      if (!current) {
        throw new Error("not_found");
      }
      throw new ArtifactGenerationStateError({ from: current, to: "FAILED" });
    }
    return {
      status: row.generation_status,
      failedAt: toIsoString(row.failed_at)
    };
  }

  async createAndSeal(args: {
    tenantId: string;
    actorId: string;
    artifactType: string;
    schemaVersion: number;
    sourceArtifactIds: string[];
    evalReport: unknown;
    payload: unknown;
    supersedesArtifactId?: string | null;
  }): Promise<{ artifactId: string; sealedAt: string; signature: string }> {
    const sealedAt = new Date().toISOString();

    const determinismInput = {
      tenantId: args.tenantId,
      artifactType: args.artifactType,
      schemaVersion: args.schemaVersion,
      sourceArtifactIds: args.sourceArtifactIds,
      evalReport: args.evalReport,
      payload: args.payload,
      sealedAt,
      ...(args.supersedesArtifactId
        ? { supersedesArtifactId: args.supersedesArtifactId }
        : {})
    };
    const { artifactId } = computeArtifactId(determinismInput);
    const signature = signArtifact({
      signingKey: this.signingKey,
      artifactId,
      sealedAtIso: sealedAt
    });

    const inputSnapshot = {
      sourceArtifactIds: args.sourceArtifactIds,
      evalReport: args.evalReport,
      payload: args.payload
    };
    const inputHash = sha256Hex(canonicalJson(inputSnapshot));
    const outputHash = sha256Hex(canonicalJson(args.payload ?? {}));
    const requestHash = sha256Hex(
      canonicalJson({
        tenantId: args.tenantId,
        artifactType: args.artifactType,
        schemaVersion: args.schemaVersion,
        sourceArtifactIds: args.sourceArtifactIds,
        supersedesArtifactId: args.supersedesArtifactId ?? null
      })
    );

    await this.runWithTenant(this.pool, args.tenantId, async (client) => {
      await client.query(
        `
        INSERT INTO artifacts (
          tenant_id,
          artifact_id,
          artifact_type,
          schema_version,
          generation_status,
          request_hash,
          input_hash,
          output_hash,
          input_snapshot,
          lineage_seed,
          output_snapshot,
          generation_metadata,
          started_at,
          completed_at,
          failed_at,
          updated_at,
          sealed_at,
          signature,
          source_artifact_ids,
          supersedes_artifact_id,
          eval_report,
          payload,
          determinism_input
        ) VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8, $9::jsonb, $10::jsonb, $11::jsonb,
          $12::jsonb, $13, $14, NULL, now(),
          $15, $16, $17, $18, $19::jsonb, $20::jsonb, $21::jsonb
        )
        `,
        [
          args.tenantId,
          artifactId,
          args.artifactType,
          args.schemaVersion,
          "COMPLETED",
          requestHash,
          inputHash,
          outputHash,
          JSON.stringify(inputSnapshot),
          JSON.stringify({
            requestContractVersion: "legacy.v1",
            inputHash,
            outputHash
          }),
          JSON.stringify(args.payload),
          JSON.stringify({ provider: "sealed_artifact", model: "n/a", warnings: [] }),
          sealedAt,
          sealedAt,
          sealedAt,
          signature,
          args.sourceArtifactIds,
          args.supersedesArtifactId ?? null,
          JSON.stringify(args.evalReport),
          JSON.stringify(args.payload),
          JSON.stringify(determinismInput)
        ]
      );
    });

    return { artifactId, sealedAt, signature };
  }

  async getById(args: { tenantId: string; artifactId: string }): Promise<ArtifactRecord | null> {
    return this.runWithTenant(this.pool, args.tenantId, async (client) => {
      const res = await client.query<DbArtifactRow>(
        `
        SELECT
          tenant_id,
          artifact_id,
          artifact_type,
          schema_version,
          generation_status,
          request_hash,
          input_hash,
          output_hash,
          input_snapshot,
          lineage_seed,
          failure_class,
          failure_message,
          failure_details,
          output_snapshot,
          generation_metadata,
          started_at,
          completed_at,
          failed_at,
          updated_at,
          created_at,
          sealed_at,
          signature,
          source_artifact_ids,
          supersedes_artifact_id,
          eval_report,
          payload,
          determinism_input
        FROM artifacts
        WHERE tenant_id = $1
          AND artifact_id = $2
        LIMIT 1
        `,
        [args.tenantId, args.artifactId]
      );

      const row = res.rows[0];
      return row ? mapRow(row) : null;
    });
  }

  async listArtifacts(args: ListArtifactsArgs): Promise<ArtifactRecord[]> {
    return this.runWithTenant(this.pool, args.tenantId, async (client) => {
      const where: string[] = ["tenant_id = $1"];
      const values: unknown[] = [args.tenantId];
      let idx = 2;

      if (args.status) {
        where.push(`generation_status = $${idx}`);
        values.push(args.status);
        idx += 1;
      }
      if (args.artifactType) {
        where.push(`artifact_type = $${idx}`);
        values.push(args.artifactType);
        idx += 1;
      }
      if (args.createdAfter) {
        where.push(`created_at >= $${idx}`);
        values.push(args.createdAfter);
        idx += 1;
      }
      if (args.createdBefore) {
        where.push(`created_at <= $${idx}`);
        values.push(args.createdBefore);
        idx += 1;
      }

      values.push(args.limit);
      values.push(args.offset);

      const res = await client.query<DbArtifactRow>(
        `
        SELECT
          tenant_id,
          artifact_id,
          artifact_type,
          schema_version,
          generation_status,
          request_hash,
          input_hash,
          output_hash,
          input_snapshot,
          lineage_seed,
          failure_class,
          failure_message,
          failure_details,
          output_snapshot,
          generation_metadata,
          started_at,
          completed_at,
          failed_at,
          updated_at,
          created_at,
          sealed_at,
          signature,
          source_artifact_ids,
          supersedes_artifact_id,
          eval_report,
          payload,
          determinism_input
        FROM artifacts
        WHERE ${where.join(" AND ")}
        ORDER BY created_at DESC
        LIMIT $${idx}
        OFFSET $${idx + 1}
        `,
        values
      );

      return res.rows.map(mapRow);
    });
  }

  async getReplayFreeze(args: { tenantId: string; artifactId: string }): Promise<ReplayFreezeResult | null> {
    const artifact = await this.getById(args);
    if (!artifact) {
      return null;
    }
    return buildArtifactReplayFreeze(artifact);
  }

  async supersede(args: {
    tenantId: string;
    actorId: string;
    supersedesArtifactId: string;
    newArtifactType: string;
    newSchemaVersion: number;
    newEvalReport: unknown;
    newPayload: unknown;
  }): Promise<{ artifactId: string; sealedAt: string; signature: string }> {
    const existing = await this.getById({
      tenantId: args.tenantId,
      artifactId: args.supersedesArtifactId
    });
    if (!existing) {
      const err = new Error("not_found");
      (err as Error & { statusCode?: number }).statusCode = 404;
      throw err;
    }

    return this.createAndSeal({
      tenantId: args.tenantId,
      actorId: args.actorId,
      artifactType: args.newArtifactType,
      schemaVersion: args.newSchemaVersion,
      sourceArtifactIds: [args.supersedesArtifactId],
      evalReport: args.newEvalReport,
      payload: args.newPayload,
      supersedesArtifactId: args.supersedesArtifactId
    });
  }

  verifyArtifactSeal(artifact: Pick<ArtifactRecord, "artifactId" | "sealedAt" | "signature">): boolean {
    const expected = this.getExpectedSignature(artifact);

    return secureHexEquals(expected, artifact.signature);
  }

  getExpectedSignature(artifact: Pick<ArtifactRecord, "artifactId" | "sealedAt">): string {
    return signArtifact({
      signingKey: this.signingKey,
      artifactId: artifact.artifactId,
      sealedAtIso: artifact.sealedAt
    });
  }

  async getSupersedesChain(args: {
    tenantId: string;
    startArtifactId: string;
    maxDepth: number;
  }): Promise<SupersedesChainEntry[]> {
    return this.runWithTenant(this.pool, args.tenantId, async (client) => {
      const chain: SupersedesChainEntry[] = [];
      let currentId: string | null = args.startArtifactId;
      let depth = 0;

      while (currentId && depth < args.maxDepth) {
        const res: { rows: DbChainRow[] } = await client.query<DbChainRow>(
          `
          SELECT artifact_id, artifact_type, schema_version, sealed_at, supersedes_artifact_id
          FROM artifacts
          WHERE tenant_id = $1
            AND artifact_id = $2
          LIMIT 1
          `,
          [args.tenantId, currentId]
        );
        const row: DbChainRow | undefined = res.rows[0];
        if (!row) {
          chain.push({ artifactId: currentId, missing: true });
          break;
        }

        chain.push({
          artifactId: row.artifact_id,
          artifactType: row.artifact_type,
          schemaVersion: row.schema_version,
          sealedAt: toIsoString(row.sealed_at)
        });

        currentId = row.supersedes_artifact_id;
        depth += 1;
      }

      return chain;
    });
  }

  private async assertTransitionable(
    tenantId: string,
    artifactId: string,
    from: ArtifactGenerationStatus,
    to: ArtifactGenerationStatus
  ): Promise<void> {
    assertArtifactGenerationTransition(from, to);
    const current = await this.runWithTenant(this.pool, tenantId, async (client) => {
      const out = await client.query<{ generation_status: ArtifactGenerationStatus }>(
        `
        SELECT generation_status
        FROM artifacts
        WHERE tenant_id = $1 AND artifact_id = $2
        LIMIT 1
        `,
        [tenantId, artifactId]
      );
      return out.rows[0]?.generation_status ?? null;
    });

    if (!current) {
      throw new Error("not_found");
    }
    throw new ArtifactGenerationStateError({ from: current, to });
  }

  private async getCurrentStatus(tenantId: string, artifactId: string): Promise<ArtifactGenerationStatus | null> {
    return this.runWithTenant(this.pool, tenantId, async (client) => {
      const out = await client.query<{ generation_status: ArtifactGenerationStatus }>(
        `
        SELECT generation_status
        FROM artifacts
        WHERE tenant_id = $1 AND artifact_id = $2
        LIMIT 1
        `,
        [tenantId, artifactId]
      );
      return out.rows[0]?.generation_status ?? null;
    });
  }
}

function secureHexEquals(a: string, b: string): boolean {
  try {
    const left = Buffer.from(a, "hex");
    const right = Buffer.from(b, "hex");
    if (left.length === 0 || right.length === 0 || left.length !== right.length) {
      return false;
    }
    return timingSafeEqual(left, right);
  } catch {
    return false;
  }
}
