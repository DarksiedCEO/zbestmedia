import { z } from "zod";

import { POLICY_KEYS } from "../policyKeys";

const approvalRoleSchema = z.enum(["sebastian", "finance", "legal", "ceo"]);

export const createDraftSchema = z
  .object({
    scopeType: z.enum(["global", "client", "campaign"]),
    scopeId: z.string().uuid().nullable().optional(),
    clientId: z.string().uuid().nullable().optional(),
    policyKey: z.enum(POLICY_KEYS),
    valueJson: z.unknown(),
    effectiveAt: z.string().datetime(),
    expiresAt: z.string().datetime().nullable().optional(),
    changeReason: z.string().min(3).max(500),
    requiredRoles: z.array(approvalRoleSchema).min(1)
  })
  .refine((v) => (v.scopeType !== "campaign") || Boolean(v.clientId), {
    message: "clientId required for campaign policies",
    path: ["clientId"]
  })
  .refine((v) => (v.scopeType !== "campaign") || Boolean(v.expiresAt), {
    message: "expiresAt required for campaign policies",
    path: ["expiresAt"]
  });

export const approveSchema = z.object({
  role: approvalRoleSchema,
  decision: z.enum(["approved", "rejected"]),
  notes: z.string().max(1000).optional()
});

export const rollbackSchema = z.object({
  reason: z.string().min(3).max(500)
});

export const resolveQuerySchema = z.object({
  policyKey: z.enum(POLICY_KEYS),
  clientId: z.string().uuid().optional(),
  campaignId: z.string().uuid().optional()
});
