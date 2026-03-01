export type ResolveStartEvent = {
  key: string;
  correlationId?: string;
};

export type ResolveEndEvent = {
  key: string;
  correlationId?: string;
  ok: boolean;
  latencyMs: number;
  status?: number;
  errorCode?: string;
};

export type CacheEvent = {
  key: string;
  correlationId?: string;
  resolutionHash?: string;
};

export type RetryEvent = {
  key: string;
  correlationId?: string;
  attempt: number;
  backoffMs: number;
  reason?: string;
};

export type PolicyTelemetry = {
  onResolveStart?: (event: ResolveStartEvent) => void;
  onResolveEnd?: (event: ResolveEndEvent) => void;
  onCacheHit?: (event: CacheEvent) => void;
  onCacheMiss?: (event: CacheEvent) => void;
  onCacheRevalidated?: (event: CacheEvent) => void;
  onCircuitOpen?: (event: { key: string; correlationId?: string; mode: "READ" | "MUTATE" }) => void;
  onRetry?: (event: RetryEvent) => void;
};

export const noopTelemetry: PolicyTelemetry = {};
