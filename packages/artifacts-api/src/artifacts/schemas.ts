import { z } from "zod";

export const EvalGateSchema = z.object({
  gateId: z.string().min(1),
  passed: z.boolean(),
  score: z.number().optional(),
  details: z.record(z.unknown()).optional()
});

export const EvalReportSchema = z.object({
  gates: z.array(EvalGateSchema).min(1),
  summary: z.string().min(1)
});

export const CreateArtifactBodySchema = z.object({
  artifactType: z.string().min(1),
  schemaVersion: z.number().int().positive(),
  sourceArtifactIds: z.array(z.string().min(1)).default([]),
  evalReport: EvalReportSchema,
  payload: z.record(z.unknown())
});

export const SupersedeArtifactBodySchema = z.object({
  newArtifactType: z.string().min(1),
  newSchemaVersion: z.number().int().positive(),
  newEvalReport: EvalReportSchema,
  newPayload: z.record(z.unknown())
});

export const ArtifactIdParamSchema = z.object({
  id: z.string().min(1)
});
