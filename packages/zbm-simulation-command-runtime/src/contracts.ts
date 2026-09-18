import { z } from 'zod';

export const identifierSchema = z.string().min(1).max(160).regex(/^[A-Za-z0-9][A-Za-z0-9._-]*(?![\s\S])/);
export const keySchema = identifierSchema.max(128);
export const versionSchema = z.string().max(19).regex(/^(0|[1-9][0-9]*)(?![\s\S])/)
  .refine(value => /^(0|[1-9][0-9]*)(?![\s\S])/.test(value) && value.length <= 19 && BigInt(value) <= 9223372036854775807n);
export const hashSchema = z.string().regex(/^[a-f0-9]{64}(?![\s\S])/);
export const scopeSchema = z.object({ tenantId: identifierSchema, campaignId: identifierSchema }).strict();
export const commandSchema = z.object({
  kind: z.literal('ADVANCE_SIMULATION_PROBE'), contractVersion: z.literal(1), scope: scopeSchema,
  probeId: identifierSchema, expectedVersion: versionSchema, expectedPayloadSha256: hashSchema,
  nextPayloadSha256: hashSchema, completion: z.enum(['STATE_ONLY', 'FAKE_RECEIPT']),
  approvalIds: z.tuple([identifierSchema]), idempotencyKey: keySchema
}).strict();
export const resultRequestSchema = z.object({ scope: scopeSchema, idempotencyKey: keySchema }).strict();
export type Scope = z.infer<typeof scopeSchema>;
export type AdvanceSimulationProbeV1 = z.infer<typeof commandSchema>;
export type ResultRequest = z.infer<typeof resultRequestSchema>;

export const effectSchema = z.object({
  status: z.enum(['NOT_REQUIRED', 'PENDING', 'LEASED', 'COMPLETED', 'FAILED', 'UNKNOWN_PENDING_RECONCILIATION']),
  parked: z.boolean(), receiptId: z.string().uuid().optional(),
  reason: z.string().min(1).max(96).regex(/^[A-Z][A-Z0-9_]*(?![\s\S])/).optional()
}).strict().superRefine((value, ctx) => {
  if ((value.status === 'COMPLETED') !== (value.receiptId !== undefined)
    || (value.parked && value.status !== 'UNKNOWN_PENDING_RECONCILIATION')) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid effect state' });
  }
});
export const acceptedResultSchema = z.object({
  found: z.literal(true), commandId: z.string().uuid(), acceptance: z.literal('ACCEPTED'),
  execution: z.literal('COMPLETED'), resultingVersion: versionSchema, probeId: identifierSchema,
  replay: z.boolean(), effect: effectSchema
}).strict();
export const lookupResultSchema = z.union([z.object({ found: z.literal(false) }).strict(), acceptedResultSchema]);
export type AcceptedResult = z.infer<typeof acceptedResultSchema>;
export type ErrorCategory = 'invalid' | 'unauthenticated' | 'denied' | 'conflict' | 'unavailable' | 'internal';
export class RuntimeError extends Error {
  constructor(
    public readonly statusCode: 400 | 401 | 403 | 409 | 500 | 503,
    public readonly category: ErrorCategory,
    public readonly uncertain = false,
    public readonly connectionFailure = false
  ) { super('Simulation runtime request failed'); }
}
export function parseRequest<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new RuntimeError(400, 'invalid');
  return parsed.data;
}
