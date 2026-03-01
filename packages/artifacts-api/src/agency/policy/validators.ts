import { z } from "zod";

import { HARD_INVARIANTS } from "./hardInvariants";
import type { PolicyKey } from "./policyKeys";

const pct = z.number().min(0).max(1);

export const performanceLimitsSchema = z.object({
  maxCPA: z.number().int().min(1).max(1_000_000),
  maxRouteLatencyP95: z.number().int().min(1).max(60_000),
  maxErrorRate: pct,
  maxPodFailureRate: pct,
  minMargin: pct.optional()
});

export const creativeLimitsSchema = z.object({
  minCreativeScore: z.number().min(0).max(1),
  brandRiskTolerance: z.enum(["low", "med", "high"]),
  experimentationLevel: z.enum(["low", "moderate", "high"]),
  maxRevisionCycles: z.number().int().min(1).max(HARD_INVARIANTS.maxRevisionCycles).optional()
});

export const salesLimitsSchema = z.object({
  leadScoreThresholdForSales: z.number().int().min(0).max(100),
  enterpriseDealThreshold: z.number().int().min(1),
  maxNegotiationCycles: z.number().int().min(1).max(HARD_INVARIANTS.maxNegotiationCycles).optional(),
  enterpriseDealsRequireHuman: z.literal(true).optional(),
  customPricingRequiresHuman: z.literal(true).optional()
});

export const financeLimitsSchema = z.object({
  minMargin: pct,
  absoluteMarginFloor: pct.default(HARD_INVARIANTS.absoluteMarginFloor)
});

export const policySchemaByKey: Record<PolicyKey, z.ZodTypeAny> = {
  performance_limits: performanceLimitsSchema,
  creative_limits: creativeLimitsSchema,
  sales_limits: salesLimitsSchema,
  finance_limits: financeLimitsSchema
};

export function validatePolicyValue(policyKey: PolicyKey, valueJson: unknown) {
  const schema = policySchemaByKey[policyKey];
  return schema.safeParse(valueJson);
}
