import { z } from "zod";

export const TenantIdSchema = z
  .string()
  .min(3)
  .max(128)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/);

export type TenantId = z.infer<typeof TenantIdSchema>;

export function tenantKey(tenantId: string, id: string): string {
  return `${tenantId}::${id}`;
}
