export type BrandPipelineStep =
  | "brandyn_direction_approved"
  | "jordyn_visual_alignment_approved"
  | "kobe_distribution_queued"
  | "oracle_performance_evaluated"
  | "titan_monetization_feedback_recorded";

export const BRAND_PIPELINE_SEQUENCE: BrandPipelineStep[] = [
  "brandyn_direction_approved",
  "jordyn_visual_alignment_approved",
  "kobe_distribution_queued",
  "oracle_performance_evaluated",
  "titan_monetization_feedback_recorded"
];

export function isValidBrandPipelineProgression(steps: BrandPipelineStep[]): boolean {
  return steps.every((step, index) => BRAND_PIPELINE_SEQUENCE[index] === step);
}
