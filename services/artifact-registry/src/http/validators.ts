import { z } from "zod";
import { ArtifactMetaSchema } from "@zbest/brand-trinity-schemas";
import { EvalReportSchema } from "@zbest/eval-gates-schemas";

const Id = z.string().min(1);

export const StoreRequestSchema = z.object({
  requestId: Id,
  workspaceId: Id,
  brandId: Id,
  artifactType: z.string().min(1),
  artifactVersion: z.string().min(1),
  attempt: z.number().int().nonnegative(),
  input: z.unknown(),
  payload: z.unknown(),
  meta: ArtifactMetaSchema,
  evalReport: EvalReportSchema.optional(),
  supersedesArtifactId: Id.optional()
});

export const SealRequestSchema = z.object({
  workspaceId: Id,
  artifactId: Id,
  sealedBy: z.string().min(1),
  sealedReason: z.string().min(1)
});

export type StoreRequest = z.infer<typeof StoreRequestSchema>;
export type SealRequest = z.infer<typeof SealRequestSchema>;
