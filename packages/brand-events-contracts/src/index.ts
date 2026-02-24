import { z } from "zod";
import { ArtifactMetaSchema } from "@zbest/brand-trinity-schemas";
import { EvalReportSchema, RegenDirectiveSchema } from "@zbest/eval-gates-schemas";

const Id = z.string().min(1);
const SemVer = z.string().regex(/^\d+\.\d+\.\d+$/);
const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const EventMetaSchema = z.object({
  eventId: Id,
  occurredAt: z.string().min(1)
});

export const ArtifactRequested_v1 = EventMetaSchema.extend({
  eventVersion: z.literal("1.0.0"),
  requestId: Id,
  artifactType: z.string().min(1),
  brandId: Id,
  personaId: Id.optional(),
  targetSchemaVersion: SemVer,
  input: z.unknown(),
  attempt: z.number().int().nonnegative()
});

export const ForgeJobRequested_v1 = EventMetaSchema.extend({
  eventVersion: z.literal("1.0.0"),
  requestId: Id,
  jobType: z.string().min(1),
  artifactType: z.string().min(1),
  brandId: Id,
  input: z.unknown(),
  attempt: z.number().int().nonnegative(),
  priority: z.enum(["low", "normal", "high"])
});

export const ArtifactGenerated_v1 = EventMetaSchema.extend({
  eventVersion: z.literal("1.0.0"),
  requestId: Id,
  artifactId: Id,
  artifactType: z.string().min(1),
  artifactMeta: ArtifactMetaSchema,
  artifact: z.unknown()
});

export const ArtifactEvaluated_v1 = EventMetaSchema.extend({
  eventVersion: z.literal("1.0.0"),
  artifactId: Id,
  report: EvalReportSchema
});

export const ArtifactRejected_v1 = EventMetaSchema.extend({
  eventVersion: z.literal("1.0.0"),
  artifactId: Id,
  reportId: Id,
  reasonCodes: z.array(z.string().min(1)),
  notes: z.string().min(1).optional()
});

export const RegenerationRequested_v1 = EventMetaSchema.extend({
  eventVersion: z.literal("1.0.0"),
  artifactId: Id,
  requestId: Id,
  directive: RegenDirectiveSchema
});

export const ArtifactStored_v1 = EventMetaSchema.extend({
  eventVersion: z.literal("1.0.0"),
  artifactId: Id,
  storageKey: z.string().min(1),
  checksum: z.string().min(1)
});

export const ArtifactSealed_v1 = EventMetaSchema.extend({
  eventVersion: z.literal("1.0.0"),
  artifactId: Id,
  sealVersion: SemVer,
  signer: z.string().min(1)
});

export const PerformanceSignalsIngested_v1 = EventMetaSchema.extend({
  eventVersion: z.literal("1.0.0"),
  brandId: Id,
  period: z.object({
    startDate: IsoDate,
    endDate: IsoDate
  }),
  signals: z.array(
    z.object({
      channel: z.string().min(1),
      metric: z.string().min(1),
      value: z.number()
    })
  )
});

export const BrandEventSchemas = {
  ArtifactRequested: {
    "1.0.0": ArtifactRequested_v1
  },
  ForgeJobRequested: {
    "1.0.0": ForgeJobRequested_v1
  },
  ArtifactGenerated: {
    "1.0.0": ArtifactGenerated_v1
  },
  ArtifactEvaluated: {
    "1.0.0": ArtifactEvaluated_v1
  },
  ArtifactRejected: {
    "1.0.0": ArtifactRejected_v1
  },
  RegenerationRequested: {
    "1.0.0": RegenerationRequested_v1
  },
  ArtifactStored: {
    "1.0.0": ArtifactStored_v1
  },
  ArtifactSealed: {
    "1.0.0": ArtifactSealed_v1
  },
  PerformanceSignalsIngested: {
    "1.0.0": PerformanceSignalsIngested_v1
  }
} as const;
