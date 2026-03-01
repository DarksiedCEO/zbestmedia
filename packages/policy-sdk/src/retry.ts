import { shouldRetry } from "./http";

export type RetryOpts = {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  onRetry?: (event: { attempt: number; backoffMs: number; reason?: string }) => void;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOpts): Promise<T> {
  let attempt = 0;
  let lastErr: unknown;

  while (attempt <= opts.maxRetries) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!shouldRetry(err) || attempt === opts.maxRetries) throw err;

      const jitter = Math.floor(Math.random() * 25);
      const backoff = Math.min(opts.maxDelayMs, opts.baseDelayMs * Math.pow(2, attempt)) + jitter;
      opts.onRetry?.({
        attempt: attempt + 1,
        backoffMs: backoff,
        reason: (err as { code?: string })?.code
      });
      await sleep(backoff);
      attempt++;
    }
  }

  throw lastErr;
}
