import { z } from "zod";

const stringNumberRecord = z.record(z.string(), z.number().int().nonnegative());

export const loadRunSchema = z.object({
  config: z.object({
    target_base_url: z.string().url(),
    precheck_path: z.string().min(1),
    read_path: z.string().min(1),
    mutate_path: z.string().min(1),
    concurrency: z.number().int().positive(),
    total: z.number().int().positive(),
    mutate_ratio: z.number().min(0).max(1),
    seed: z.number().int(),
    timeout_sec: z.number().positive(),
    policy_key: z.string().optional(),
    role: z.string().optional(),
    client_pool_size: z.number().int().positive().optional(),
    campaign_pool_size: z.number().int().positive().optional()
  }),
  preflight: z.object({
    ok: z.boolean(),
    status: z.number().int().nonnegative().optional(),
    url: z.string().url(),
    error_type: z.string().optional(),
    error: z.string().optional()
  }),
  counts: z.object({
    success: z.number().int().nonnegative(),
    fail_status: z.number().int().nonnegative(),
    transport_failures: z.number().int().nonnegative(),
    status: stringNumberRecord,
    error_codes: stringNumberRecord,
    blocked_mutate: stringNumberRecord,
    transport_failure_types: stringNumberRecord,
    transport_failure_samples: z.array(z.record(z.string(), z.string())).default([]),
    bad_request_samples: z.array(z.unknown()).optional()
  }),
  latency_ms: z.object({
    mean: z.number().nonnegative(),
    p50: z.number().nonnegative(),
    p95: z.number().nonnegative(),
    p99: z.number().nonnegative()
  }),
  breaker_states: stringNumberRecord,
  retry_count_distribution: stringNumberRecord,
  cache_states: stringNumberRecord
});

export type LoadRun = z.infer<typeof loadRunSchema>;

export function parseLoadRun(input: unknown): LoadRun {
  return loadRunSchema.parse(input);
}
