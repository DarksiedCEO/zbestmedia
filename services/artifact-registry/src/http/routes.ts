import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import {
  HeaderRequiredError,
  ServiceAuthError,
  authenticateBearerToken,
  authorizeTenant,
  extractBearerToken,
  readTenantHeader,
  type ServiceAuthConfig,
  type ServiceIdentity
} from "@zbest/service-auth";
import { StoreRequestSchema, SealRequestSchema } from "./validators";
import { prisma as defaultPrisma } from "../db/prisma";
import { getArtifact, sealArtifact, storeArtifact } from "../domain/registry";
import { getLineage } from "../domain/lineage";
import { RegistryError } from "../domain/errors";
import { withContext } from "../log";
import type { NatsConnection } from "nats";

// The authenticated caller resolved by the onRequest hook is stashed here so
// every handler can authorize against it without re-parsing the token.
declare module "fastify" {
  interface FastifyRequest {
    serviceIdentity?: ServiceIdentity;
  }
}

const WORKSPACE_ID_HEADER = "x-workspace-id";

// GET routes carry no body, so the caller's claimed workspace comes from a
// required header, validated by the SHARED tenant-id schema (same strictness
// as brandgraph's x-tenant-id).
function requireWorkspaceHeader(request: FastifyRequest): string {
  return readTenantHeader(request.headers[WORKSPACE_ID_HEADER], { code: "WORKSPACE_ID_REQUIRED" });
}

// Authorization step, shared by all handlers: the identity was already
// authenticated in the onRequest hook (so it is present here), we just check
// it is allowed to act on this workspace.
function authorize(request: FastifyRequest, workspaceId: string): void {
  // Defensive: the hook guarantees this, but never trust an absent identity.
  if (!request.serviceIdentity) {
    throw new ServiceAuthError(401, "UNAUTHENTICATED", "Missing authenticated identity");
  }
  authorizeTenant(request.serviceIdentity, workspaceId);
}

// Structural auth: registering this onRequest hook on an (encapsulated)
// Fastify instance makes authentication impossible to forget — EVERY route
// added to that instance, now or in the future, is authenticated before its
// handler runs (and therefore before any body/schema validation). This is
// the guarantee the previous per-handler-call design could not make.
export function registerServiceAuthHook(instance: FastifyInstance, authConfig: ServiceAuthConfig): void {
  instance.addHook("onRequest", async (request) => {
    const token = extractBearerToken(request.headers.authorization);
    request.serviceIdentity = authenticateBearerToken(token, authConfig); // throws 401
  });
  instance.setErrorHandler(handleError);
}

export async function registerRoutes(
  app: FastifyInstance,
  nc: NatsConnection,
  authConfig: ServiceAuthConfig,
  deps?: { prisma?: PrismaClient }
) {
  const prisma = deps?.prisma ?? defaultPrisma;

  // Encapsulated plugin: the auth hook + error handler apply to every route
  // registered inside, and to nothing outside (e.g. /health on the root app
  // stays open). New routes added here inherit auth automatically.
  await app.register(async (instance) => {
    registerServiceAuthHook(instance, authConfig);

    instance.post("/registry/store", async (request, reply) => {
      const start = Date.now();
      const body = StoreRequestSchema.parse(request.body);
      authorize(request, body.workspaceId);

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
    });

    instance.post("/registry/seal", async (request, reply) => {
      const start = Date.now();
      const body = SealRequestSchema.parse(request.body);
      authorize(request, body.workspaceId);

      const log = withContext({ artifactId: body.artifactId, operation: "seal" });
      const artifact = await sealArtifact(prisma, nc, body);
      log.info({ artifactId: artifact.artifactId, durationMs: Date.now() - start }, "artifact sealed");
      return reply.send({ artifactId: artifact.artifactId, immutableAt: artifact.immutableAt });
    });

    instance.get("/registry/artifacts/:id", async (request, reply) => {
      const workspaceId = requireWorkspaceHeader(request);
      authorize(request, workspaceId);

      const id = (request.params as { id: string }).id;
      const artifact = await getArtifact(prisma, workspaceId, id);
      return reply.send(artifact);
    });

    instance.get("/registry/lineage/:id", async (request, reply) => {
      const workspaceId = requireWorkspaceHeader(request);
      authorize(request, workspaceId);

      const id = (request.params as { id: string }).id;
      const lineage = await getLineage(prisma, workspaceId, id, 10);
      return reply.send(lineage);
    });
  });
}

function handleError(err: unknown, _request: FastifyRequest, reply: FastifyReply) {
  if (err instanceof z.ZodError) {
    return reply.status(400).send({ error: "VALIDATION", message: err.message });
  }
  if (err instanceof ServiceAuthError) {
    return reply.status(err.statusCode).send({ error: err.code, message: err.message });
  }
  if (err instanceof HeaderRequiredError) {
    return reply.status(err.statusCode).send({ error: err.code, message: err.message });
  }
  if (err instanceof RegistryError) {
    return reply.status(err.status).send({ error: err.code, message: err.message });
  }
  if (err instanceof Error) {
    return reply.status(500).send({ error: "INTERNAL", message: err.message });
  }
  return reply.status(500).send({ error: "INTERNAL", message: "Unknown error" });
}
