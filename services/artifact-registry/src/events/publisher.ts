import { ArtifactSealed_v1, ArtifactStored_v1 } from "@zbest/brand-events-contracts";
import { sha256Hex } from "@zbest/id-core";
import { logger } from "../log";

export type ArtifactStoredEvent = ReturnType<typeof ArtifactStored_v1.parse>;
export type ArtifactSealedEvent = ReturnType<typeof ArtifactSealed_v1.parse>;

function buildEventId(seed: string) {
  return sha256Hex(seed);
}

export function createArtifactStoredEvent(payload: Omit<ArtifactStoredEvent, "eventId" | "occurredAt">): ArtifactStoredEvent {
  const occurredAt = new Date().toISOString();
  const eventId = buildEventId(`${payload.artifactId}|ArtifactStored|${occurredAt}`);
  return ArtifactStored_v1.parse({
    ...payload,
    eventId,
    occurredAt
  });
}

export function createArtifactSealedEvent(payload: Omit<ArtifactSealedEvent, "eventId" | "occurredAt">): ArtifactSealedEvent {
  const occurredAt = new Date().toISOString();
  const eventId = buildEventId(`${payload.artifactId}|ArtifactSealed|${occurredAt}`);
  return ArtifactSealed_v1.parse({
    ...payload,
    eventId,
    occurredAt
  });
}

export interface EventPublisher {
  publishArtifactStored(event: ArtifactStoredEvent): Promise<void>;
  publishArtifactSealed(event: ArtifactSealedEvent): Promise<void>;
}

export class NoopPublisher implements EventPublisher {
  async publishArtifactStored(event: ArtifactStoredEvent): Promise<void> {
    logger.info({ event }, "ArtifactStored event queued (noop)");
  }

  async publishArtifactSealed(event: ArtifactSealedEvent): Promise<void> {
    logger.info({ event }, "ArtifactSealed event queued (noop)");
  }
}
