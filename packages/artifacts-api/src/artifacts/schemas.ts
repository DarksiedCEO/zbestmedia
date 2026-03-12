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

export const ListArtifactsQuerySchema = z.object({
  status: z.enum(["PENDING", "GENERATING", "COMPLETED", "FAILED"]).optional(),
  artifactType: z.string().min(1).optional(),
  createdAfter: z.string().datetime().optional(),
  createdBefore: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0)
});

export const GenerateArtifactBodySchema = z
  .object({
    artifactType: z.string().min(1),
    templateKey: z.string().min(1).optional(),
    workflowKey: z.string().min(1).optional(),
    input: z.record(z.unknown()),
    idempotencyKey: z.string().min(1).max(256).optional(),
    generationMode: z.enum(["sync"]).default("sync"),
    providerOverrides: z
      .object({
        provider: z.string().min(1).optional(),
        model: z.string().min(1).optional(),
        temperature: z.number().min(0).max(2).optional(),
        maxTokens: z.number().int().positive().optional()
      })
      .strict()
      .optional()
  })
  .strict()
  .refine((v) => Boolean(v.templateKey || v.workflowKey), {
    message: "Either templateKey or workflowKey is required",
    path: ["templateKey"]
  });
