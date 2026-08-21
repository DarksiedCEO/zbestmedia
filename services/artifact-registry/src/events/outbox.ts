import type { NatsConnection, PubAck } from "nats";
import { canonicalize } from "@zbest/id-core";
import { encodeEvent } from "./publisher.js";

export const RETRY_CLASSES = ["PERMANENT", "TRANSIENT", "THROTTLED", "UNKNOWN"] as const;
export type RetryClass = (typeof RETRY_CLASSES)[number];

export type OutboxRow = {
  id: string; subject: string; payload: unknown; publishedAt: Date | null;
  attemptCount: number; nextAttemptAt: Date; leaseOwner: string | null;
  leaseExpiresAt: Date | null; terminalAt: Date | null;
};

export type OutboxStore = { eventOutbox: {
  findUnique(args: unknown): Promise<OutboxRow | null>;
  create(args: unknown): Promise<OutboxRow>;
  findMany(args: unknown): Promise<OutboxRow[]>;
  updateMany(args: unknown): Promise<{ count: number }>;
} };

export class OutboxConflictError extends Error {}

/** Insert using the caller's transaction client. This function never publishes. */
export async function enqueueOutbox(tx: OutboxStore, event: {
  eventId: string; subject: string; payload: unknown;
}): Promise<"ENQUEUED" | "ALREADY_ENQUEUED"> {
  const existing = await tx.eventOutbox.findUnique({ where: { id: event.eventId } });
  if (existing) {
    if (existing.subject !== event.subject || canonicalize(existing.payload) !== canonicalize(event.payload)) {
      throw new OutboxConflictError("deterministic event id already exists with different content");
    }
    return "ALREADY_ENQUEUED";
  }
  await tx.eventOutbox.create({ data: {
    id: event.eventId, subject: event.subject, payload: event.payload,
  } });
  return "ENQUEUED";
}

export type RelayPolicy = {
  workerId: string; now: Date; batchSize?: number; leaseMs?: number; maxAttempts?: number;
  classify(error: unknown): RetryClass;
};
export type RelayResult = { published: string[]; deferred: string[]; terminal: string[]; lostLease: string[] };

const backoffMs = (attempt: number, retryClass: RetryClass) => {
  const base = retryClass === "THROTTLED" ? 5_000 : retryClass === "UNKNOWN" ? 2_000 : 500;
  return Math.min(60_000, base * 2 ** Math.min(attempt, 7));
};

function requireDurableAck(ack: PubAck): void {
  if (!ack || typeof ack.stream !== "string" || ack.stream.length === 0 ||
      !Number.isSafeInteger(ack.seq) || ack.seq < 1 || typeof ack.duplicate !== "boolean") {
    throw new Error("broker returned an invalid durable acknowledgement");
  }
}

/** Claim, publish with broker de-duplication, flush, then mark delivered. */
export async function relayOutboxBatch(store: OutboxStore, nc: NatsConnection, policy: RelayPolicy): Promise<RelayResult> {
  const leaseMs = policy.leaseMs ?? 30_000;
  const maxAttempts = policy.maxAttempts ?? 8;
  const batchSize = policy.batchSize ?? 100;
  if (!policy.workerId || !Number.isFinite(policy.now.getTime())) throw new Error("invalid relay identity or clock");
  if (!Number.isSafeInteger(leaseMs) || leaseMs < 1) throw new Error("leaseMs must be a positive integer");
  if (!Number.isSafeInteger(maxAttempts) || maxAttempts < 1) throw new Error("maxAttempts must be a positive integer");
  if (!Number.isSafeInteger(batchSize) || batchSize < 1) throw new Error("batchSize must be a positive integer");
  const result: RelayResult = { published: [], deferred: [], terminal: [], lostLease: [] };
  const due = await store.eventOutbox.findMany({ where: {
    publishedAt: null, terminalAt: null, nextAttemptAt: { lte: policy.now },
    OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lte: policy.now } }],
  }, orderBy: [{ nextAttemptAt: "asc" }, { createdAt: "asc" }, { id: "asc" }], take: batchSize });

  for (const row of due) {
    const claimed = await store.eventOutbox.updateMany({ where: {
      id: row.id, publishedAt: null, terminalAt: null, nextAttemptAt: { lte: policy.now },
      OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lte: policy.now } }],
    }, data: { leaseOwner: policy.workerId, leaseExpiresAt: new Date(policy.now.getTime() + leaseMs) } });
    if (claimed.count !== 1) { result.lostLease.push(row.id); continue; }
    try {
      // JetStream persists before acknowledging and de-duplicates by msgID.
      // This closes the crash-after-publish/before-database-mark duplicate window.
      const ack = await nc.jetstream().publish(row.subject, encodeEvent(row.payload), { msgID: row.id });
      requireDurableAck(ack);
      const marked = await store.eventOutbox.updateMany({ where: {
        id: row.id, publishedAt: null, leaseOwner: policy.workerId,
      }, data: { publishedAt: new Date(), leaseOwner: null, leaseExpiresAt: null, lastError: null, lastRetryClass: null } });
      (marked.count === 1 ? result.published : result.lostLease).push(row.id);
    } catch (error) {
      const retryClass = policy.classify(error);
      const attemptCount = row.attemptCount + 1;
      const terminal = retryClass === "PERMANENT" || attemptCount >= maxAttempts;
      const recorded = await store.eventOutbox.updateMany({ where: {
        id: row.id, publishedAt: null, leaseOwner: policy.workerId,
      }, data: {
        attemptCount, lastRetryClass: retryClass,
        lastError: error instanceof Error ? error.message.slice(0, 1024) : "unknown publish failure",
        nextAttemptAt: terminal ? row.nextAttemptAt : new Date(policy.now.getTime() + backoffMs(attemptCount, retryClass)),
        terminalAt: terminal ? new Date() : null, leaseOwner: null, leaseExpiresAt: null,
      } });
      if (recorded.count !== 1) result.lostLease.push(row.id);
      else (terminal ? result.terminal : result.deferred).push(row.id);
    }
  }
  return result;
}
