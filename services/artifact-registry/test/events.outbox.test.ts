import { describe, expect, it, vi } from "vitest";
import { StringCodec } from "nats";
import { enqueueOutbox, OutboxConflictError, relayOutboxBatch, RETRY_CLASSES, type OutboxRow } from "../src/events/outbox.js";

const payload = (eventId: string) => ({ schemaVersion: 1, eventId, eventName: "ArtifactStored", occurredAt: "2026-08-18T00:00:00.000Z", trace: { requestId: "req", artifactId: "artifact-01" }, data: { artifactType: "test", attempt: 0, sha256: "a".repeat(64), sizeBytes: 1 } });

function memoryStore(initial: OutboxRow[] = []) {
  const rows = new Map(initial.map((row) => [row.id, row]));
  const matches = (row: any, where: any): boolean => {
    if (where.id && row.id !== where.id) return false;
    if (where.publishedAt === null && row.publishedAt !== null) return false;
    if (where.terminalAt === null && row.terminalAt !== null) return false;
    if (where.leaseOwner && row.leaseOwner !== where.leaseOwner) return false;
    if (where.nextAttemptAt?.lte && row.nextAttemptAt > where.nextAttemptAt.lte) return false;
    if (where.OR && !where.OR.some((condition: any) => condition.leaseExpiresAt === null ? row.leaseExpiresAt === null : row.leaseExpiresAt <= condition.leaseExpiresAt.lte)) return false;
    return true;
  };
  return { rows, eventOutbox: {
    findUnique: async ({ where }: any) => rows.get(where.id) ?? null,
    create: async ({ data }: any) => { const row = { ...data, publishedAt: null, attemptCount: 0, nextAttemptAt: new Date(0), leaseOwner: null, leaseExpiresAt: null, terminalAt: null } as OutboxRow; rows.set(row.id, row); return row; },
    findMany: async ({ where, take }: any) => [...rows.values()].filter((row) => matches(row, where)).slice(0, take),
    updateMany: async ({ where, data }: any) => { const row = rows.get(where.id); if (!row || !matches(row, where)) return { count: 0 }; rows.set(row.id, { ...row, ...data }); return { count: 1 }; },
  } };
}

const row = (id: string): OutboxRow => ({ id, subject: "events", payload: payload(id), publishedAt: null, attemptCount: 0, nextAttemptAt: new Date(0), leaseOwner: null, leaseExpiresAt: null, terminalAt: null });
const ack = { stream: "EVENTS", seq: 1, duplicate: false };

describe("transactional outbox", () => {
  it("enqueues deterministically and rejects same-id content mutation", async () => {
    const store = memoryStore();
    expect(await enqueueOutbox(store, { eventId: "event-00001", subject: "events", payload: payload("event-00001") })).toBe("ENQUEUED");
    expect(await enqueueOutbox(store, { eventId: "event-00001", subject: "events", payload: payload("event-00001") })).toBe("ALREADY_ENQUEUED");
    await expect(enqueueOutbox(store, { eventId: "event-00001", subject: "other", payload: payload("event-00001") })).rejects.toBeInstanceOf(OutboxConflictError);
  });

  it("recovers a stranded row and records delivery only after broker acknowledgement", async () => {
    const store = memoryStore([row("event-00002")]);
    const publish = vi.fn(async (_s, bytes, options) => { expect(StringCodec().decode(bytes)).toContain("event-00002"); expect(options.msgID).toBe("event-00002"); return ack; });
    const nc = { jetstream: () => ({ publish }) } as any;
    const result = await relayOutboxBatch(store, nc, { workerId: "relay-a", now: new Date(10), classify: () => "UNKNOWN" });
    expect(result.published).toEqual(["event-00002"]);
    expect(publish).toHaveBeenCalledTimes(1);
    expect(store.rows.get("event-00002")?.publishedAt).toBeInstanceOf(Date);
  });

  it("prevents concurrent workers from double-publishing the same leased row", async () => {
    const store = memoryStore([row("event-00003")]);
    const publish = vi.fn(async () => ack);
    const nc = { jetstream: () => ({ publish }) } as any;
    await Promise.all([
      relayOutboxBatch(store, nc, { workerId: "a", now: new Date(10), classify: () => "UNKNOWN" }),
      relayOutboxBatch(store, nc, { workerId: "b", now: new Date(10), classify: () => "UNKNOWN" }),
    ]);
    expect(publish).toHaveBeenCalledTimes(1);
  });

  it("bounds transient retries and fails permanent errors terminally", async () => {
    const transient = memoryStore([row("event-00004")]);
    const failing = { jetstream: () => ({ publish: vi.fn(async () => { throw new Error("down"); }) }) } as any;
    const first = await relayOutboxBatch(transient, failing, { workerId: "a", now: new Date(10), maxAttempts: 2, classify: () => "TRANSIENT" });
    expect(first.deferred).toEqual(["event-00004"]);
    const due = transient.rows.get("event-00004")!; due.nextAttemptAt = new Date(0);
    const second = await relayOutboxBatch(transient, failing, { workerId: "a", now: new Date(20), maxAttempts: 2, classify: () => "TRANSIENT" });
    expect(second.terminal).toEqual(["event-00004"]);

    const permanent = memoryStore([row("event-00005")]);
    expect((await relayOutboxBatch(permanent, failing, { workerId: "a", now: new Date(10), classify: () => "PERMANENT" })).terminal).toEqual(["event-00005"]);
  });

  it("keeps the retry class denominator exact and ordered", () => {
    expect(RETRY_CLASSES).toEqual(["PERMANENT", "TRANSIENT", "THROTTLED", "UNKNOWN"]);
  });

  it("does not claim delivery for a forged or incomplete broker acknowledgement", async () => {
    const store = memoryStore([row("event-00006")]);
    const nc = { jetstream: () => ({ publish: vi.fn(async () => ({ duplicate: false })) }) } as any;
    const result = await relayOutboxBatch(store, nc, { workerId: "a", now: new Date(10), maxAttempts: 2, classify: () => "UNKNOWN" });
    expect(result.published).toEqual([]);
    expect(result.deferred).toEqual(["event-00006"]);
    expect(store.rows.get("event-00006")?.publishedAt).toBeNull();
  });

  it("accepts a duplicate broker acknowledgement as final without resurrecting the row", async () => {
    const store = memoryStore([row("event-00007")]);
    const publish = vi.fn(async () => ({ ...ack, duplicate: true }));
    const nc = { jetstream: () => ({ publish }) } as any;
    expect((await relayOutboxBatch(store, nc, { workerId: "a", now: new Date(10), classify: () => "UNKNOWN" })).published).toEqual(["event-00007"]);
    expect((await relayOutboxBatch(store, nc, { workerId: "b", now: new Date(20), classify: () => "UNKNOWN" })).published).toEqual([]);
    expect(publish).toHaveBeenCalledTimes(1);
  });

  it("recovers an expired lease and never revives a terminal poison message", async () => {
    const stale = row("event-00008"); stale.leaseOwner = "dead"; stale.leaseExpiresAt = new Date(5);
    const poison = row("event-00009"); poison.terminalAt = new Date(1);
    const store = memoryStore([stale, poison]);
    const publish = vi.fn(async () => ack);
    const result = await relayOutboxBatch(store, { jetstream: () => ({ publish }) } as any, { workerId: "live", now: new Date(10), classify: () => "UNKNOWN" });
    expect(result.published).toEqual(["event-00008"]);
    expect(publish).toHaveBeenCalledTimes(1);
  });

  it("fails closed on unsafe retry and lease configuration", async () => {
    const store = memoryStore([row("event-00010")]);
    const nc = { jetstream: () => ({ publish: vi.fn() }) } as any;
    await expect(relayOutboxBatch(store, nc, { workerId: "a", now: new Date(10), maxAttempts: 0, classify: () => "UNKNOWN" })).rejects.toThrow("maxAttempts");
    await expect(relayOutboxBatch(store, nc, { workerId: "a", now: new Date(10), leaseMs: 0, classify: () => "UNKNOWN" })).rejects.toThrow("leaseMs");
  });
});
