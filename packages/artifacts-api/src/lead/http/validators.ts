import { z } from "zod";

const emailSchema = z.string().email();
const phoneSchema = z.string().min(7).max(20);
const shortString = (min: number, max: number) => z.string().min(min).max(max);
const attributesSchema = z
  .record(z.union([z.string(), z.number(), z.boolean(), z.null()]))
  .refine((value) => Object.keys(value).length <= 50, "attributes must contain at most 50 keys");

export const intakeSchema = z.object({
  email: emailSchema.optional(),
  phone: phoneSchema.optional(),
  firstName: shortString(1, 80).optional(),
  lastName: shortString(1, 80).optional(),
  companyName: shortString(1, 120).optional(),
  companyDomain: shortString(3, 255).optional(),
  source: z.enum(["website", "linkedin", "referral", "outbound", "inbound", "partner", "other"]),
  channel: shortString(1, 64).optional(),
  sourceRef: shortString(1, 128).optional(),
  attributes: attributesSchema.optional()
});

export const eventSchema = z.object({
  type: shortString(1, 64),
  payload: z.record(z.any()).default({}),
  actor: shortString(1, 120).optional(),
  recomputeScore: z.boolean().optional()
});

export const conversionSchema = z.object({
  type: shortString(1, 64),
  valueUsd: z.number().nonnegative().max(999_999_999).optional(),
  meta: z.record(z.any()).default({}),
  recomputeScore: z.boolean().optional()
});

export function parseBoundedLimit(raw: unknown, def = 20, max = 50): number {
  const n = typeof raw === "string" ? Number(raw) : typeof raw === "number" ? raw : def;
  if (!Number.isFinite(n)) return def;
  return Math.max(1, Math.min(max, Math.floor(n)));
}
