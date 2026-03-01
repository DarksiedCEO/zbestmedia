import { z } from "zod";

export const PolicyResolveInputSchema = z.object({
  policyKey: z.string().min(1).default("performance_limits"),
  client_id: z.string().min(1),
  campaign_id: z.string().min(1),
  role: z.string().min(1),
  asOf: z.string().datetime().optional()
});

export type PolicyResolveInput = z.input<typeof PolicyResolveInputSchema>;
export type ParsedPolicyResolveInput = z.output<typeof PolicyResolveInputSchema>;

export const PolicyResolveMetaSchema = z
  .object({
    resolution_hash: z.string().min(1),
    policy_id: z.string().optional(),
    active_version: z.string().optional()
  })
  .passthrough();

export const PolicyResolveOutputSchema = z
  .object({
    resolved: z.unknown(),
    meta: PolicyResolveMetaSchema
  })
  .passthrough();

export type PolicyResolveOutput = z.infer<typeof PolicyResolveOutputSchema>;

export type PolicySdkConfig = {
  baseUrl: string;
  apiKey?: string;
  timeoutMs?: number;
  userAgent?: string;
};
