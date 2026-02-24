import type { FastifyBaseLogger } from "fastify";

export function warnIfSlow(
  log: FastifyBaseLogger,
  startedAtMs: number,
  budgetMs: number,
  context: Record<string, unknown>,
  message: string
): void {
  const elapsed = Date.now() - startedAtMs;
  if (elapsed > budgetMs) {
    log.warn({ ...context, elapsedMs: elapsed, budgetMs }, message);
  }
}
