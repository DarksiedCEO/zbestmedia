import type { PrismaClient } from "@prisma/client";
import type { NatsConnection } from "nats";
import { publishEvent } from "./publisher.js";

export async function publishOutboxOnce(deps: {
  prisma: PrismaClient;
  nc: NatsConnection;
  subject: string;
  eventId: string;
  payload: unknown;
}) {
  const { prisma, nc, subject, eventId, payload } = deps;

  // idempotent insert (if exists, skip insert)
  await prisma.eventOutbox.upsert({
    where: { id: eventId },
    create: {
      id: eventId,
      subject,
      payload: payload as any,
    },
    update: {},
  });

  const row = await prisma.eventOutbox.findUnique({ where: { id: eventId } });
  if (!row) throw new Error("outbox row missing after upsert");

  if (row.publishedAt) return { status: "ALREADY_PUBLISHED" as const };

  // publish + mark
  publishEvent(nc, subject, row.payload);

  await prisma.eventOutbox.update({
    where: { id: eventId },
    data: { publishedAt: new Date() },
  });

  return { status: "PUBLISHED" as const };
}
