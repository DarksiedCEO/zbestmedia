import { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";
import { ArtifactMetaSchema, BrandTrinitySchemas } from "@zbest/brand-trinity-schemas";
import { EvalReportSchema } from "@zbest/eval-gates-schemas";
import { canonicalize, deterministicArtifactId, sha256Hex } from "@zbest/id-core";
import { Errors } from "./errors";
import { makeEventId } from "../events/eventId.js";
import { publishOutboxOnce } from "../events/outbox.js";
import type { NatsConnection } from "nats";

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
  workspaceId: string;
  artifactId: string;
  sealedBy: string;
  sealedReason: string;
};

export async function storeArtifact(prisma: PrismaClient, nc: NatsConnection, args: StoreArgs) {
  const artifactId = deterministicArtifactId({
    workspaceId: args.workspaceId,
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

  if (args.supersedesArtifactId) {
    // Cross-tenant link check: without this, a caller could stitch its
    // artifact into another workspace's lineage chain by guessing/reusing
    // that workspace's artifactId.
    const superseded = await prisma.artifact.findFirst({
      where: { artifactId: args.supersedesArtifactId, workspaceId: args.workspaceId }
    });
    if (!superseded) {
      throw Errors.Validation("supersedesArtifactId must reference an artifact in the same workspace");
    }
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
      payload: args.payload as Prisma.InputJsonValue,
      meta: meta as Prisma.InputJsonValue,
      evalReport: (evalReport ?? undefined) as Prisma.InputJsonValue,
      supersedesArtifactId: args.supersedesArtifactId ?? undefined
    }
  });

  const subject = "zbest.artifacts.stored.v1";
  const eventId = makeEventId({
    schemaVersion: 1,
    eventName: "ArtifactStored",
    artifactId,
    requestId: args.requestId,
    attempt: args.attempt,
  });

  await publishOutboxOnce({
    prisma,
    nc,
    subject,
    eventId,
    payload: {
      schemaVersion: 1,
      eventId,
      eventName: "ArtifactStored",
      occurredAt: new Date().toISOString(),
      trace: { requestId: args.requestId, artifactId },
      data: {
        artifactType: args.artifactType,
        attempt: args.attempt,
        sha256: inputHash,
        sizeBytes: (args.payload as any)?.sizeBytes ?? 1, // fallback if not present
        supersedesArtifactId: args.supersedesArtifactId,
      },
    },
  });

  return created;
}

export async function sealArtifact(prisma: PrismaClient, nc: NatsConnection, args: SealArgs) {
  // Scoped by workspaceId, not just artifactId: a wrong-workspace caller
  // must see the same NotFound as a nonexistent id — no existence oracle.
  const existing = await prisma.artifact.findFirst({
    where: { artifactId: args.artifactId, workspaceId: args.workspaceId }
  });
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

  const subject = "zbest.artifacts.sealed.v1";
  const eventId = makeEventId({
    schemaVersion: 1,
    eventName: "ArtifactSealed",
    artifactId: sealed.artifactId,
    requestId: sealed.requestId,
  });

  await publishOutboxOnce({
    prisma,
    nc,
    subject,
    eventId,
    payload: {
      schemaVersion: 1,
      eventId,
      eventName: "ArtifactSealed",
      occurredAt: new Date().toISOString(),
      trace: { requestId: sealed.requestId, artifactId: sealed.artifactId },
      data: {
        sealedBy: args.sealedBy,
        sealReason: args.sealedReason,
      },
    },
  });

  return sealed;
}

export async function getArtifact(prisma: PrismaClient, workspaceId: string, artifactId: string) {
  // findFirst on (artifactId, workspaceId), not findUnique on artifactId
  // alone: closes the "global bucket" read + existence-oracle finding.
  const artifact = await prisma.artifact.findFirst({ where: { artifactId, workspaceId } });
  if (!artifact) {
    throw Errors.NotFound("artifact not found");
  }
  return artifact;
}
