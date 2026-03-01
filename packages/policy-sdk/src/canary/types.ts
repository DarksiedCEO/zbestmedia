import { z } from "zod";

export const canaryStepSchema = z.union([z.literal(5), z.literal(25), z.literal(50), z.literal(100)]);
export type CanaryStep = z.infer<typeof canaryStepSchema>;

export const canaryStateSchema = z.enum([
  "IDLE",
  "APPLY_5",
  "OBSERVE_5",
  "APPLY_25",
  "OBSERVE_25",
  "APPLY_50",
  "OBSERVE_50",
  "APPLY_100",
  "DONE",
  "ROLLBACK",
  "FAILED"
]);
export type CanaryState = z.infer<typeof canaryStateSchema>;

export const canaryPlanSchema = z.object({
  plan_id: z.string(),
  generated_at: z.string().datetime(),
  target: z.string().min(1),
  defaults_proposal_file: z.string().min(1),
  defaults_proposal_sha256: z.string().min(1),
  steps: z.array(canaryStepSchema).min(1),
  observe_window_minutes: z.number().int().positive(),
  guardrail_profile: z.string().min(1),
  rollback_packet_pointer: z.string().min(1),
  expected_governance_fingerprint: z.string().min(1),
  approvals: z.array(
    z.object({
      by: z.string().min(1),
      at: z.string().datetime(),
      reason: z.string().min(3)
    })
  )
});
export type CanaryPlan = z.infer<typeof canaryPlanSchema>;

export const canaryObservationSchema = z.object({
  step: canaryStepSchema,
  drift_passed: z.boolean(),
  error_rate_passed: z.boolean(),
  current_governance_fingerprint: z.string().min(1),
  reasons: z.array(z.string()).default([])
});
export type CanaryObservation = z.infer<typeof canaryObservationSchema>;

export const canaryTransitionSchema = z.object({
  at: z.string().datetime(),
  from: canaryStateSchema,
  to: canaryStateSchema,
  reason: z.string().min(1),
  step: canaryStepSchema.optional(),
  metadata: z.record(z.string(), z.unknown()).optional()
});
export type CanaryTransition = z.infer<typeof canaryTransitionSchema>;

export const canaryRolloutSchema = z.object({
  rollout_id: z.string(),
  plan_id: z.string(),
  started_at: z.string().datetime(),
  finished_at: z.string().datetime().nullable(),
  status: z.enum(["RUNNING", "DONE", "FAILED", "ABORTED"]),
  state: canaryStateSchema,
  current_step: canaryStepSchema.nullable(),
  transitions: z.array(canaryTransitionSchema),
  apply_artifacts: z.array(z.string()),
  observation_artifacts: z.array(z.string()),
  rollback_artifact: z.string().nullable(),
  failure_reason: z.string().nullable()
});
export type CanaryRollout = z.infer<typeof canaryRolloutSchema>;

export function parseCanaryPlan(input: unknown): CanaryPlan {
  return canaryPlanSchema.parse(input);
}

export function parseCanaryRollout(input: unknown): CanaryRollout {
  return canaryRolloutSchema.parse(input);
}

export function parseCanaryObservation(input: unknown): CanaryObservation {
  return canaryObservationSchema.parse(input);
}
