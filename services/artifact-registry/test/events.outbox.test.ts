import { describe, it, expect, vi, beforeEach } from "vitest";
import { publishOutboxOnce } from "../src/events/outbox.js";
import { PrismaClient } from "@prisma/client";
import { NatsConnection, StringCodec } from "nats";

const sc = StringCodec();

describe("publishOutboxOnce", () => {
  let prisma: any;
  let nc: any;

  beforeEach(() => {
    prisma = {
      eventOutbox: {
        upsert: vi.fn().mockResolvedValue({}),
        findUnique: vi.fn(),
        update: vi.fn().mockResolvedValue({}),
      },
    };
    nc = {
      publish: vi.fn(),
    };
  });

  it("publishes an event and marks it as published", async () => {
    const eventId = "test-event-id-123456";
    const subject = "test.subject";
    const payload = {
      schemaVersion: 1,
      eventId,
      eventName: "ArtifactStored",
      occurredAt: new Date().toISOString(),
      trace: { requestId: "req-1", artifactId: "artifact-00001" },
      data: {
        artifactType: "test",
        attempt: 0,
        sha256: "a".repeat(64),
        sizeBytes: 100,
      },
    };

    prisma.eventOutbox.findUnique.mockResolvedValue({
      id: eventId,
      subject,
      payload,
      publishedAt: null,
    });

    const result = await publishOutboxOnce({
      prisma: prisma as unknown as PrismaClient,
      nc: nc as unknown as NatsConnection,
      subject,
      eventId,
      payload,
    });

    expect(result.status).toBe("PUBLISHED");
    expect(nc.publish).toHaveBeenCalledWith(subject, sc.encode(JSON.stringify(payload)));
    expect(prisma.eventOutbox.update).toHaveBeenCalledWith({
      where: { id: eventId },
      data: { publishedAt: expect.any(Date) },
    });
  });

  it("does not republish if already published", async () => {
    const eventId = "test-event-id-123456";
    const subject = "test.subject";
    const payload = { id: 1 };

    prisma.eventOutbox.findUnique.mockResolvedValue({
      id: eventId,
      subject,
      payload,
      publishedAt: new Date(),
    });

    const result = await publishOutboxOnce({
      prisma: prisma as unknown as PrismaClient,
      nc: nc as unknown as NatsConnection,
      subject,
      eventId,
      payload,
    });

    expect(result.status).toBe("ALREADY_PUBLISHED");
    expect(nc.publish).not.toHaveBeenCalled();
    expect(prisma.eventOutbox.update).not.toHaveBeenCalled();
  });
});
