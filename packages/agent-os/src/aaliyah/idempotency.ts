import type { AaliyahMutationIdempotencyRecord, AaliyahMutationOperation } from "./idempotency-types.js";
import type { AgentOsRepository } from "../persistence/repository.js";

type IdempotentMutationArgs<TResult> = {
  tenantId: string;
  actorId: string;
  principalContext: "founder" | "operator";
  operationName: AaliyahMutationOperation;
  idempotencyKey?: string | null;
  requestFingerprint: string;
  startedAt?: string;
  execute: () => Promise<TResult>;
  serializeResult: (result: TResult) => Record<string, unknown>;
  deserializeResult: (payload: Record<string, unknown>) => TResult;
};

export class AaliyahIdempotencyConflictError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export class AaliyahIdempotencyService {
  constructor(private readonly repository: AgentOsRepository) {}

  async execute<TResult>(args: IdempotentMutationArgs<TResult>): Promise<TResult> {
    if (!args.idempotencyKey) {
      return args.execute();
    }

    const startedAt = args.startedAt ?? new Date().toISOString();
    const claim = await this.repository.claimAaliyahMutationIdempotency({
      tenantId: args.tenantId,
      actorId: args.actorId,
      principalContext: args.principalContext,
      operationName: args.operationName,
      idempotencyKey: args.idempotencyKey,
      requestFingerprint: args.requestFingerprint,
      createdAt: startedAt
    });

    if (claim.status === "completed" && claim.record.responsePayload) {
      return args.deserializeResult(claim.record.responsePayload);
    }

    if (claim.status === "conflict") {
      throw new AaliyahIdempotencyConflictError("aaliyah_idempotency_key_reused_with_different_request");
    }

    if (claim.status === "in_progress") {
      throw new AaliyahIdempotencyConflictError("aaliyah_idempotency_operation_in_progress");
    }

    try {
      const result = await args.execute();
      await this.repository.completeAaliyahMutationIdempotency({
        tenantId: args.tenantId,
        actorId: args.actorId,
        principalContext: args.principalContext,
        operationName: args.operationName,
        idempotencyKey: args.idempotencyKey,
        responsePayload: args.serializeResult(result),
        completedAt: startedAt
      });
      return result;
    } catch (error) {
      await this.repository.failAaliyahMutationIdempotency({
        tenantId: args.tenantId,
        actorId: args.actorId,
        principalContext: args.principalContext,
        operationName: args.operationName,
        idempotencyKey: args.idempotencyKey,
        errorCode: error instanceof Error ? error.message : "aaliyah_idempotency_execution_failed",
        failedAt: startedAt
      });
      throw error;
    }
  }
}

export function stableRequestFingerprint(parts: Array<string | null | undefined | number | boolean | Record<string, unknown>>): string {
  return JSON.stringify(
    parts.map((part) => {
      if (part === null || part === undefined) {
        return null;
      }
      if (typeof part === "object" && !Array.isArray(part)) {
        return Object.keys(part)
          .sort()
          .reduce<Record<string, unknown>>((acc, key) => {
            acc[key] = (part as Record<string, unknown>)[key];
            return acc;
          }, {});
      }
      return part;
    })
  );
}

export function toIdempotencyRecordPayload(record: AaliyahMutationIdempotencyRecord): Record<string, unknown> {
  return {
    tenantId: record.tenantId,
    actorId: record.actorId,
    principalContext: record.principalContext,
    operationName: record.operationName,
    idempotencyKey: record.idempotencyKey,
    requestFingerprint: record.requestFingerprint,
    state: record.state,
    responsePayload: record.responsePayload,
    errorCode: record.errorCode,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    completedAt: record.completedAt
  };
}
