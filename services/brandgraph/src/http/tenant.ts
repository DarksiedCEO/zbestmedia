import { z } from "zod";
import type { FastifyRequest } from "fastify";

export const TenantIdSchema = z
  .string()
  .min(3)
  .max(128)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/, "tenantId must be URL/header safe");

export function getTenantId(req: FastifyRequest): string {
  const raw = req.headers["x-tenant-id"];
  const value = Array.isArray(raw) ? raw[0] : raw;

  const parsed = TenantIdSchema.safeParse(value);
  if (!parsed.success) {
    throw Object.assign(new Error("Missing or invalid tenant id"), {
      statusCode: 400,
      code: "TENANT_ID_REQUIRED"
    });
  }

  return parsed.data;
}
