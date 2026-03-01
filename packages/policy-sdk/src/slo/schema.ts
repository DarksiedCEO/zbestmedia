import { z } from "zod";

export const loadRunSloEventSchema = z.object({
  event_id: z.string().min(1),
  ts: z.string().datetime(),
  source: z.enum(["ci", "prod"]),
  service: z.string().min(1),
  target_id: z.string().min(1),
  baseline: z.object({
    path: z.string().min(1),
    hash: z.string().min(1),
    accepted_at: z.string().datetime().optional()
  }),
  candidate: z.object({
    path: z.string().min(1),
    hash: z.string().min(1)
  }),
  verdict: z.object({
    passed: z.boolean(),
    reasons: z.array(z.string())
  }),
  metrics: z.object({
    latency: z.object({
      p50: z.number().nonnegative(),
      p95: z.number().nonnegative(),
      p99: z.number().nonnegative(),
      max: z.number().nonnegative()
    }),
    throughput_rps: z.number().nonnegative(),
    error_rate_total: z.number().nonnegative(),
    error_rate_4xx: z.number().nonnegative(),
    error_rate_5xx: z.number().nonnegative(),
    error_rate_timeout: z.number().nonnegative(),
    breaker_open_rate: z.number().nonnegative(),
    retry_amplification: z.number().nonnegative()
  }),
  deltas: z.object({
    latency_p50_ratio: z.number(),
    latency_p95_ratio: z.number(),
    latency_p99_ratio: z.number(),
    latency_max_ratio: z.number(),
    throughput_rps_delta: z.number(),
    error_rate_total_delta: z.number(),
    error_rate_4xx_delta: z.number(),
    error_rate_5xx_delta: z.number(),
    error_rate_timeout_delta: z.number(),
    breaker_open_rate_delta: z.number(),
    retry_amplification_delta: z.number()
  }),
  tags: z.array(z.string()).default([])
});

export type LoadRunSloEvent = z.infer<typeof loadRunSloEventSchema>;

export function parseLoadRunSloEvent(input: unknown): LoadRunSloEvent {
  return loadRunSloEventSchema.parse(input);
}
