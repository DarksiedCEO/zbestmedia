import type { FastifyRequest } from "fastify";
import pino, { type Logger } from "pino";

export type RequestLogContext = {
  requestId: string;
  tenantId?: string;
  actorId?: string;
};

export function createLogger(): Logger {
  return pino({
    level: process.env.LOG_LEVEL ?? "info",
    base: { service: "artifacts-api" }
  });
}

export function getRequestLogContext(
  request: Pick<FastifyRequest, "id" | "headers"> & {
    user?: { tenantId?: string; actorId?: string };
  }
): RequestLogContext {
  const headerRequestId = request.headers["x-request-id"];
  const requestId = typeof headerRequestId === "string" && headerRequestId.length > 0 ? headerRequestId : request.id;
  const tenantId =
    request.user?.tenantId ??
    (typeof request.headers["x-tenant-id"] === "string" ? request.headers["x-tenant-id"] : undefined);
  const actorId =
    request.user?.actorId ??
    (typeof request.headers["x-actor-id"] === "string" ? request.headers["x-actor-id"] : undefined);

  return { requestId, tenantId, actorId };
}

export function bindRequestLogger(logger: Logger, context: RequestLogContext): Logger {
  return logger.child(context);
}
