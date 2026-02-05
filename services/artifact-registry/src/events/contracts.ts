import { z } from "zod";

export const EventName = z.enum(["ArtifactStored", "ArtifactSealed"]);
export type EventName = z.infer<typeof EventName>;

export const BaseEvent = z.object({
  schemaVersion: z.literal(1),
  eventId: z.string().min(10),
  eventName: EventName,
  occurredAt: z.string().datetime(),
  trace: z.object({
    requestId: z.string().min(1),
    artifactId: z.string().min(10)
  })
});

export const ArtifactStoredEvent = BaseEvent.extend({
  eventName: z.literal("ArtifactStored"),
  data: z.object({
    artifactType: z.string().min(1),
    attempt: z.number().int().min(0),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    sizeBytes: z.number().int().min(1),
    supersedesArtifactId: z.string().min(10).optional()
  })
});

export const ArtifactSealedEvent = BaseEvent.extend({
  eventName: z.literal("ArtifactSealed"),
  data: z.object({
    sealedBy: z.string().min(1),
    sealReason: z.string().min(1).max(256).optional()
  })
});

export const AnyArtifactEvent = z.union([ArtifactStoredEvent, ArtifactSealedEvent]);
export type AnyArtifactEvent = z.infer<typeof AnyArtifactEvent>;
export type ArtifactStoredEvent = z.infer<typeof ArtifactStoredEvent>;
export type ArtifactSealedEvent = z.infer<typeof ArtifactSealedEvent>;
