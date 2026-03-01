import type { FastifyRequest } from "fastify";

export function requireRole(req: FastifyRequest, role: string): void {
  const roles = req.auth?.roles ?? [];
  if (!Array.isArray(roles) || !roles.includes(role)) {
    const err = new Error("FORBIDDEN") as Error & { statusCode?: number; code?: string };
    err.statusCode = 403;
    err.code = "FORBIDDEN";
    throw err;
  }
}
