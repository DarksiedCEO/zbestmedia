import { timingSafeEqual } from "node:crypto";
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
  determinismInput: unknown;
};

export type SupersedesChainEntry = {
  artifactId: string;
  artifactType?: string;
  schemaVersion?: number;
  sealedAt?: string;
  missing?: true;
};

type DbArtifactRow = {
  tenant_id: string;
  artifact_id: string;
  artifact_type: string;
  schema_version: number;
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
          payload,
          determinism_input
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11::jsonb)
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
          JSON.stringify(args.payload),
          JSON.stringify(determinismInput)
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
    return withTenant(this.pool, args.tenantId, async (client) => {
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
