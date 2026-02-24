import { z } from "zod";

const Id = z.string().min(1);
const SemVer = z.string().regex(/^\d+\.\d+\.\d+$/);

export const GateStatusSchema = z.enum(["pass", "fail", "regen"]);

export const ReasonCodeBaseSchema = z.enum([
  "LOW_SCORE",
  "OUT_OF_BRAND",
  "INCOHERENT",
  "INCOMPLETE",
  "SAFETY_RISK",
  "POLICY_VIOLATION"
]);

export const ReasonCodeSchema = z.union([ReasonCodeBaseSchema, z.string().min(1)]);

export const MetricSchema = z.object({
  name: z.string().min(1),
  score: z.number().min(0).max(1),
  threshold: z.number().min(0).max(1),
  weight: z.number().min(0).max(1),
  notes: z.string().min(1).optional()
});

export const RegenDirectiveSchema = z.object({
  regen: z.boolean(),
  maxAttempts: z.number().int().positive(),
  strategy: z.enum(["tune", "rewrite", "style-shift", "content-augment"]),
  focusAreas: z.array(z.string().min(1)),
  notes: z.string().min(1).optional()
});

export const GateResultSchema = z.object({
  gateId: Id,
  status: GateStatusSchema,
  reasonCodes: z.array(ReasonCodeSchema),
  summary: z.string().min(1),
  metrics: z.array(MetricSchema),
  regenDirective: RegenDirectiveSchema.optional()
});

export const EvalReportSchema = z.object({
  reportId: Id,
  artifactId: Id,
  artifactType: z.string().min(1),
  schemaVersion: SemVer,
  overallScore: z.number().min(0).max(1),
  recommendation: z.enum(["accept", "reject", "regen"]),
  gateResults: z.array(GateResultSchema)
});

export type GateStatus = z.infer<typeof GateStatusSchema>;
export type ReasonCode = z.infer<typeof ReasonCodeSchema>;
export type Metric = z.infer<typeof MetricSchema>;
export type RegenDirective = z.infer<typeof RegenDirectiveSchema>;
export type GateResult = z.infer<typeof GateResultSchema>;
export type EvalReport = z.infer<typeof EvalReportSchema>;

export const EvalGatesSchemas = {
  GateStatus: GateStatusSchema,
  ReasonCode: ReasonCodeSchema,
  Metric: MetricSchema,
  RegenDirective: RegenDirectiveSchema,
  GateResult: GateResultSchema,
  EvalReport: EvalReportSchema
} as const;
