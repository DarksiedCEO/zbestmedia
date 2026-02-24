import type { Pool } from "pg";

import { computeArtifactId, signArtifact } from "../crypto";
import { withTenant } from "../db/withTenant";

export type ArtifactRecord = {
  tenantId: string;
  artifactId: string;
  artifactType: string;
  schemaVersion: number;
  createdAt: string;
  sealedAt: string;
  signature: string;
  sourceArtifactIds: string[];
  supersedesArtifactId: string | null;
  evalReport: unknown;
  payload: unknown;
};

type DbArtifactRow = {
  tenant_id: string;
  artifact_id: string;
  artifact_type: string;
  schema_version: number;
  created_at: string;
  sealed_at: string;
  signature: string;
  source_artifact_ids: string[];
  supersedes_artifact_id: string | null;
  eval_report: unknown;
  payload: unknown;
};

function mapRow(row: DbArtifactRow): ArtifactRecord {
  return {
    tenantId: row.tenant_id,
    artifactId: row.artifact_id,
    artifactType: row.artifact_type,
    schemaVersion: row.schema_version,
    createdAt: row.created_at,
    sealedAt: row.sealed_at,
    signature: row.signature,
    sourceArtifactIds: row.source_artifact_ids,
    supersedesArtifactId: row.supersedes_artifact_id,
    evalReport: row.eval_report,
    payload: row.payload
  };
}

export class ArtifactService {
  constructor(
    private readonly pool: Pool,
    private readonly signingKey: string
  ) {}

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
      artifactType: args.artifactType,
      schemaVersion: args.schemaVersion,
      sourceArtifactIds: args.sourceArtifactIds,
      evalReport: args.evalReport,
      payload: args.payload,
      sealedAt
    };
    const { artifactId } = computeArtifactId(determinismInput);
    const signature = signArtifact({
      signingKey: this.signingKey,
      artifactId,
      sealedAtIso: sealedAt
    });

    await withTenant(this.pool, args.tenantId, async (client) => {
      await client.query(
        `
        INSERT INTO artifacts (
          tenant_id,
          artifact_id,
          artifact_type,
          schema_version,
          sealed_at,
          signature,
          source_artifact_ids,
          supersedes_artifact_id,
          eval_report,
          payload
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb)
        `,
        [
          args.tenantId,
          artifactId,
          args.artifactType,
          args.schemaVersion,
          sealedAt,
          signature,
          args.sourceArtifactIds,
          args.supersedesArtifactId ?? null,
          JSON.stringify(args.evalReport),
          JSON.stringify(args.payload)
        ]
      );
    });

    return { artifactId, sealedAt, signature };
  }

  async getById(args: { tenantId: string; artifactId: string }): Promise<ArtifactRecord | null> {
    return withTenant(this.pool, args.tenantId, async (client) => {
      const res = await client.query<DbArtifactRow>(
        `
        SELECT
          tenant_id,
          artifact_id,
          artifact_type,
          schema_version,
          created_at,
          sealed_at,
          signature,
          source_artifact_ids,
          supersedes_artifact_id,
          eval_report,
          payload
        FROM artifacts
        WHERE artifact_id = $1
        LIMIT 1
        `,
        [args.artifactId]
      );

      const row = res.rows[0];
      return row ? mapRow(row) : null;
    });
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
}
