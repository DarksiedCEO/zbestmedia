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

export type PolicyResolveReceipt = {
  contract_version: string;
  resolution_hash: string;
  policy_id?: string;
  active_version?: string;
  issued_at: string;
};

export const PolicyResolveMetaSchema = z
  .object({
    resolution_hash: z.string().min(1),
    policy_id: z.string().optional(),
    active_version: z.string().optional(),
    policy_receipt_header: z.string().optional(),
    policy_receipt: z.custom<PolicyResolveReceipt>().optional(),
    policy_receipt_sig: z.string().optional(),
    policy_receipt_kid: z.string().optional(),
    receipt_verified: z.boolean().optional(),
    receipt_verify_reason: z.string().optional()
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
  minContractVersion?: string;
  enforceContractVersion?: boolean;
  receiptVerifyEnabled?: boolean;
  receiptVerifyEnforce?: boolean;
  receiptHmacKeys?: Record<string, string>;
};
