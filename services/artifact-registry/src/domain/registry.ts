import { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";
import { ArtifactMetaSchema, BrandTrinitySchemas } from "@zbest/brand-trinity-schemas";
import { EvalReportSchema } from "@zbest/eval-gates-schemas";
import { canonicalize, deterministicArtifactId, sha256Hex } from "@zbest/id-core";
import { Errors } from "./errors";
import { createArtifactSealedEvent, createArtifactStoredEvent, EventPublisher } from "../events/publisher";

const SupersedesEdge = "supersedes";

function jsonEqual(a: unknown, b: unknown): boolean {
  return canonicalize(a) === canonicalize(b);
}

function validateMeta(args: {
  meta: unknown;
  artifactId: string;
  artifactType: string;
  artifactVersion: string;
  requestId: string;
  attempt: number;
}) {
  const meta = ArtifactMetaSchema.parse(args.meta);
  if (meta.artifactId !== args.artifactId) {
    throw Errors.Validation("meta.artifactId must match deterministic artifactId");
  }
  if (meta.artifactType !== args.artifactType) {
    throw Errors.Validation("meta.artifactType must match artifactType");
  }
  if (meta.requestId !== args.requestId) {
    throw Errors.Validation("meta.requestId must match requestId");
  }
  if (meta.schemaVersion !== args.artifactVersion) {
    throw Errors.Validation("meta.schemaVersion must match artifactVersion");
  }
  if (meta.lineage.attempt !== args.attempt) {
    throw Errors.Validation("meta.lineage.attempt must match attempt");
  }
  return meta;
}

function validatePayload(artifactType: string, payload: unknown) {
  const schema = (BrandTrinitySchemas as Record<string, z.ZodTypeAny>)[artifactType];
  if (schema) {
    schema.parse(payload);
  }
}

export type StoreArgs = {
  requestId: string;
  workspaceId: string;
  brandId: string;
  artifactType: string;
  artifactVersion: string;
  attempt: number;
  input: unknown;
  payload: unknown;
  meta: unknown;
  evalReport?: unknown;
  supersedesArtifactId?: string;
};

export type SealArgs = {
  artifactId: string;
  sealedBy: string;
  sealedReason: string;
};

export async function storeArtifact(prisma: PrismaClient, publisher: EventPublisher, args: StoreArgs) {
  const artifactId = deterministicArtifactId({
    requestId: args.requestId,
    artifactType: args.artifactType,
    input: args.input,
    attempt: args.attempt
  });
  const inputHash = sha256Hex(canonicalize(args.input));

  const meta = validateMeta({
    meta: args.meta,
    artifactId,
    artifactType: args.artifactType,
    artifactVersion: args.artifactVersion,
    requestId: args.requestId,
    attempt: args.attempt
  });

  validatePayload(args.artifactType, args.payload);

  let evalReport: unknown | null = null;
  if (args.evalReport) {
    evalReport = EvalReportSchema.parse(args.evalReport);
  }

  const existing = await prisma.artifact.findUnique({ where: { artifactId } });
  if (existing) {
    if (existing.immutableAt) {
      throw Errors.Immutable("artifact is sealed and cannot be updated");
    }

    const same =
      existing.requestId === args.requestId &&
      existing.workspaceId === args.workspaceId &&
      existing.brandId === args.brandId &&
      existing.artifactType === args.artifactType &&
      existing.artifactVersion === args.artifactVersion &&
      existing.attempt === args.attempt &&
      existing.inputHash === inputHash &&
      existing.supersedesArtifactId === (args.supersedesArtifactId ?? null) &&
      jsonEqual(existing.payload, args.payload) &&
      jsonEqual(existing.meta, meta) &&
      jsonEqual(existing.evalReport ?? null, evalReport ?? null);

    if (!same) {
      throw Errors.Conflict("artifact with same deterministic id already exists with different payload");
    }

    return existing;
  }

  const created = await prisma.artifact.create({
    data: {
      artifactId,
      workspaceId: args.workspaceId,
      brandId: args.brandId,
      requestId: args.requestId,
      artifactType: args.artifactType,
      artifactVersion: args.artifactVersion,
      attempt: args.attempt,
      inputHash,
      payload: args.payload,
      meta,
      evalReport: evalReport ?? undefined,
      supersedesArtifactId: args.supersedesArtifactId ?? undefined
    }
  });

  const event = createArtifactStoredEvent({
    eventVersion: "1.0.0",
    artifactId,
    storageKey: `db:${artifactId}`,
    checksum: inputHash
  });
  await publisher.publishArtifactStored(event);

  return created;
}

export async function sealArtifact(prisma: PrismaClient, publisher: EventPublisher, args: SealArgs) {
  const existing = await prisma.artifact.findUnique({ where: { artifactId: args.artifactId } });
  if (!existing) {
    throw Errors.NotFound("artifact not found");
  }

  if (existing.immutableAt) {
    return existing;
  }

  const sealed = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const updated = await tx.artifact.update({
      where: { artifactId: args.artifactId },
      data: { immutableAt: new Date() }
    });

    if (updated.supersedesArtifactId) {
      await tx.artifactLineageEdge.upsert({
        where: {
          fromArtifactId_toArtifactId_edgeType: {
            fromArtifactId: updated.supersedesArtifactId,
            toArtifactId: updated.artifactId,
            edgeType: SupersedesEdge
          }
        },
        update: {},
        create: {
          fromArtifactId: updated.supersedesArtifactId,
          toArtifactId: updated.artifactId,
          edgeType: SupersedesEdge
        }
      });
    }

    return updated;
  });

  const event = createArtifactSealedEvent({
    eventVersion: "1.0.0",
    artifactId: sealed.artifactId,
    sealVersion: sealed.artifactVersion,
    signer: args.sealedBy
  });
  await publisher.publishArtifactSealed(event);

  return sealed;
}

export async function getArtifact(prisma: PrismaClient, artifactId: string) {
  const artifact = await prisma.artifact.findUnique({ where: { artifactId } });
  if (!artifact) {
    throw Errors.NotFound("artifact not found");
  }
  return artifact;
}
