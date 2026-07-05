import type { FastifyRequest } from "fastify";
import { readTenantHeader, tenantIdSchema } from "@zbest/service-auth";

// Kept as a named re-export so existing imports (and any future validation
// needs) resolve to the SHARED schema, not a service-local copy that could
// drift from artifact-registry's.
export const TenantIdSchema = tenantIdSchema;

export function getTenantId(req: FastifyRequest): string {
  return readTenantHeader(req.headers["x-tenant-id"], { code: "TENANT_ID_REQUIRED" });
}
