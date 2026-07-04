import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import {
  ServiceAuthError,
  authenticateAndAuthorize,
  extractBearerToken,
  type ServiceAuthConfig
} from "@zbest/service-auth";
import { StoreRequestSchema, SealRequestSchema } from "./validators";
import { prisma as defaultPrisma } from "../db/prisma";
import { getArtifact, sealArtifact, storeArtifact } from "../domain/registry";
import { getLineage } from "../domain/lineage";
import { RegistryError } from "../domain/errors";
import { withContext } from "../log";
import type { NatsConnection } from "nats";

const WorkspaceIdHeaderSchema = z.string().min(1);

// GET routes take no body, so the caller's claimed workspace comes from a
// required header — mirrors brandgraph's x-tenant-id pattern.
function requireWorkspaceHeader(request: FastifyRequest): string {
  const raw = request.headers["x-workspace-id"];
  const value = Array.isArray(raw) ? raw[0] : raw;
  const parsed = WorkspaceIdHeaderSchema.safeParse(value);
  if (!parsed.success) {
    throw Object.assign(new Error("Missing or invalid x-workspace-id header"), {
      statusCode: 400,
      code: "WORKSPACE_ID_REQUIRED"
    });
  }
  return parsed.data;
}

export async function registerRoutes(
  app: FastifyInstance,
  nc: NatsConnection,
  authConfig: ServiceAuthConfig,
  deps?: { prisma?: PrismaClient }
) {
  const prisma = deps?.prisma ?? defaultPrisma;

  app.post("/registry/store", async (request, reply) => {
    const start = Date.now();
    try {
      const token = extractBearerToken(request.headers.authorization);
      const body = StoreRequestSchema.parse(request.body);
      authenticateAndAuthorize(token, body.workspaceId, authConfig);

      const log = withContext({
        requestId: body.requestId,
        artifactType: body.artifactType,
        workspaceId: body.workspaceId,
        brandId: body.brandId,
        operation: "store"
      });

      const artifact = await storeArtifact(prisma, nc, {
        requestId: body.requestId,
        workspaceId: body.workspaceId,
        brandId: body.brandId,
        artifactType: body.artifactType,
        artifactVersion: body.artifactVersion,
        attempt: body.attempt,
        input: body.input,
        payload: body.payload,
        meta: body.meta,
        evalReport: body.evalReport,
        supersedesArtifactId: body.supersedesArtifactId
      });
      log.info({ artifactId: artifact.artifactId, durationMs: Date.now() - start }, "artifact stored");
      return reply.send({ artifactId: artifact.artifactId, immutableAt: artifact.immutableAt });
    } catch (err) {
      return handleError(err, reply);
    }
  });

  app.post("/registry/seal", async (request, reply) => {
    const start = Date.now();
    try {
      const token = extractBearerToken(request.headers.authorization);
      const body = SealRequestSchema.parse(request.body);
      authenticateAndAuthorize(token, body.workspaceId, authConfig);

      const log = withContext({ artifactId: body.artifactId, operation: "seal" });

      const artifact = await sealArtifact(prisma, nc, body);
      log.info({ artifactId: artifact.artifactId, durationMs: Date.now() - start }, "artifact sealed");
      return reply.send({ artifactId: artifact.artifactId, immutableAt: artifact.immutableAt });
    } catch (err) {
      return handleError(err, reply);
    }
  });

  app.get("/registry/artifacts/:id", async (request, reply) => {
    try {
      const token = extractBearerToken(request.headers.authorization);
      const workspaceId = requireWorkspaceHeader(request);
      authenticateAndAuthorize(token, workspaceId, authConfig);

      const id = (request.params as { id: string }).id;
      const artifact = await getArtifact(prisma, workspaceId, id);
      return reply.send(artifact);
    } catch (err) {
      return handleError(err, reply);
    }
  });

  app.get("/registry/lineage/:id", async (request, reply) => {
    try {
      const token = extractBearerToken(request.headers.authorization);
      const workspaceId = requireWorkspaceHeader(request);
      authenticateAndAuthorize(token, workspaceId, authConfig);

      const id = (request.params as { id: string }).id;
      const lineage = await getLineage(prisma, workspaceId, id, 10);
      return reply.send(lineage);
    } catch (err) {
      return handleError(err, reply);
    }
  });
}

function handleError(err: unknown, reply: FastifyReply) {
  if (err instanceof z.ZodError) {
    return reply.status(400).send({ error: "VALIDATION", message: err.message });
  }
  if (err instanceof ServiceAuthError) {
    return reply.status(err.statusCode).send({ error: err.code, message: err.message });
  }
  if (err instanceof RegistryError) {
    return reply.status(err.status).send({ error: err.code, message: err.message });
  }
  if (err && typeof err === "object" && "statusCode" in err && "code" in err) {
    const typed = err as { statusCode: number; code: string; message?: string };
    return reply.status(typed.statusCode).send({ error: typed.code, message: typed.message ?? "Request failed" });
  }
  if (err instanceof Error) {
    return reply.status(500).send({ error: "INTERNAL", message: err.message });
  }
  return reply.status(500).send({ error: "INTERNAL", message: "Unknown error" });
}
