import { FastifyInstance } from "fastify";
import { z } from "zod";
import { StoreRequestSchema, SealRequestSchema } from "./validators";
import { prisma } from "../db/prisma";
import { NoopPublisher } from "../events/publisher";
import { getArtifact, sealArtifact, storeArtifact } from "../domain/registry";
import { getLineage } from "../domain/lineage";
import { RegistryError } from "../domain/errors";
import { withContext } from "../log";

const publisher = new NoopPublisher();

export async function registerRoutes(app: FastifyInstance) {
  app.post("/registry/store", async (request, reply) => {
    const start = Date.now();
    try {
      const body = StoreRequestSchema.parse(request.body);
      const log = withContext({
        requestId: body.requestId,
        artifactType: body.artifactType,
        workspaceId: body.workspaceId,
        brandId: body.brandId,
        operation: "store"
      });

      const artifact = await storeArtifact(prisma, publisher, body);
      log.info({ artifactId: artifact.artifactId, durationMs: Date.now() - start }, "artifact stored");
      return reply.send({ artifactId: artifact.artifactId, immutableAt: artifact.immutableAt });
    } catch (err) {
      return handleError(err, reply);
    }
  });

  app.post("/registry/seal", async (request, reply) => {
    const start = Date.now();
    try {
      const body = SealRequestSchema.parse(request.body);
      const log = withContext({ artifactId: body.artifactId, operation: "seal" });

      const artifact = await sealArtifact(prisma, publisher, body);
      log.info({ artifactId: artifact.artifactId, durationMs: Date.now() - start }, "artifact sealed");
      return reply.send({ artifactId: artifact.artifactId, immutableAt: artifact.immutableAt });
    } catch (err) {
      return handleError(err, reply);
    }
  });

  app.get("/registry/artifacts/:id", async (request, reply) => {
    try {
      const id = (request.params as { id: string }).id;
      const artifact = await getArtifact(prisma, id);
      return reply.send(artifact);
    } catch (err) {
      return handleError(err, reply);
    }
  });

  app.get("/registry/lineage/:id", async (request, reply) => {
    try {
      const id = (request.params as { id: string }).id;
      const lineage = await getLineage(prisma, id, 10);
      return reply.send(lineage);
    } catch (err) {
      return handleError(err, reply);
    }
  });
}

function handleError(err: unknown, reply: FastifyInstance["reply"]) {
  if (err instanceof z.ZodError) {
    return reply.status(400).send({ error: "VALIDATION", message: err.message });
  }
  if (err instanceof RegistryError) {
    return reply.status(err.status).send({ error: err.code, message: err.message });
  }
  if (err instanceof Error) {
    return reply.status(500).send({ error: "INTERNAL", message: err.message });
  }
  return reply.status(500).send({ error: "INTERNAL", message: "Unknown error" });
}
