import {
  PolicyResolveInputSchema,
  PolicyResolveOutputSchema,
  type PolicyResolveInput,
  type PolicyResolveOutput,
  type PolicySdkConfig
} from "./types";
import { httpGetJson } from "./http";
import { withRetry } from "./retry";
import { CircuitBreaker } from "./circuitBreaker";
import { PolicyCache, type CacheMode } from "./cache";
import { PolicySdkError } from "./errors";
import { noopLogger, type PolicyLogger } from "./logger";
import { noopTelemetry, type PolicyTelemetry } from "./telemetry";

export type ResolveOptions = {
  correlationId?: string;
  cacheTtlMs?: number;
  cacheMode?: CacheMode;
};

export class PolicyClient {
  private readonly cfg: Required<Pick<PolicySdkConfig, "timeoutMs" | "userAgent">> & PolicySdkConfig;
  private readonly breaker = new CircuitBreaker({ failureThreshold: 5, resetAfterMs: 15_000 });
  private readonly cache = new PolicyCache();

  constructor(
    cfg: PolicySdkConfig,
    private readonly log: PolicyLogger = noopLogger,
    private readonly telemetry: PolicyTelemetry = noopTelemetry
  ) {
    if (!cfg.baseUrl) throw new Error("PolicyClient requires baseUrl");
    this.cfg = {
      ...cfg,
      timeoutMs: cfg.timeoutMs ?? 2000,
      userAgent: cfg.userAgent ?? "@zbest/policy-sdk"
    };
  }

  async resolvePolicy(input: PolicyResolveInput, opts: ResolveOptions = {}): Promise<PolicyResolveOutput> {
    const parsedInput = PolicyResolveInputSchema.parse(input);

    const key = this.cache.makeKey(parsedInput);
    const cacheTtlMs = opts.cacheTtlMs ?? 120_000;
    const cacheMode = opts.cacheMode ?? "READ";
    this.telemetry.onResolveStart?.({ key, correlationId: opts.correlationId });

    const cached = this.cache.get(key);
    if (cached) {
      this.telemetry.onCacheHit?.({
        key,
        correlationId: opts.correlationId,
        resolutionHash: cached.value.meta?.resolution_hash
      });
      this.telemetry.onResolveEnd?.({ key, correlationId: opts.correlationId, ok: true, latencyMs: 0, status: 200 });
      this.log.info(
        { correlationId: opts.correlationId, cache: "hit", key, resolution_hash: cached.value.meta?.resolution_hash },
        "policy.resolve cache hit"
      );
      return cached.value;
    }

    const staleEntry = this.cache.getStaleEntry(key);

    if (!this.breaker.canRequest()) {
      this.telemetry.onCircuitOpen?.({ key, correlationId: opts.correlationId, mode: cacheMode });
      if (cacheMode === "READ") {
        throw new PolicySdkError("CIRCUIT_OPEN_NO_CACHE", "Circuit open and no cached policy available");
      }
      throw new PolicySdkError("CIRCUIT_OPEN", "Circuit open; blocking policy resolve for mutate path");
    }

    const query = new URLSearchParams({
      policyKey: parsedInput.policyKey,
      clientId: parsedInput.client_id,
      campaignId: parsedInput.campaign_id
    });
    const url = `${this.cfg.baseUrl.replace(/\/+$/, "")}/v1/policies/resolve?${query.toString()}`;

    const headers: Record<string, string> = {
      "user-agent": this.cfg.userAgent,
      ...(opts.correlationId ? { "x-correlation-id": opts.correlationId } : {})
    };
    const staleHash = staleEntry?.value.meta?.resolution_hash;
    if (staleHash) {
      headers["if-none-match"] = `"${staleHash}"`;
    }
    if (this.cfg.apiKey) headers.authorization = `Bearer ${this.cfg.apiKey}`;

    const started = Date.now();

    try {
      this.telemetry.onCacheMiss?.({
        key,
        correlationId: opts.correlationId,
        resolutionHash: staleHash
      });
      const out = await withRetry(
        async () => {
          const res = await httpGetJson<unknown>(url, { timeoutMs: this.cfg.timeoutMs, headers });
          if (res.status === 304) {
            if (!staleEntry) {
              throw new PolicySdkError("REVALIDATION_CACHE_MISS", "Server returned 304 but no cached policy is available");
            }
            return staleEntry.value;
          }
          return PolicyResolveOutputSchema.parse(res.json);
        },
        {
          maxRetries: 2,
          baseDelayMs: 80,
          maxDelayMs: 400,
          onRetry: ({ attempt, backoffMs, reason }) => {
            this.telemetry.onRetry?.({ key, correlationId: opts.correlationId, attempt, backoffMs, reason });
          }
        }
      );

      this.breaker.onSuccess();

      const latencyMs = Date.now() - started;
      const revalidated = staleHash != null && staleHash === out.meta?.resolution_hash;
      if (revalidated) {
        this.telemetry.onCacheRevalidated?.({
          key,
          correlationId: opts.correlationId,
          resolutionHash: out.meta?.resolution_hash
        });
      }
      this.telemetry.onResolveEnd?.({ key, correlationId: opts.correlationId, ok: true, latencyMs, status: revalidated ? 304 : 200 });
      this.log.info(
        {
          correlationId: opts.correlationId,
          latencyMs,
          cache: revalidated ? "revalidated" : "miss",
          key,
          policy_id: out.meta?.policy_id,
          active_version: out.meta?.active_version,
          resolution_hash: out.meta?.resolution_hash
        },
        "policy.resolve ok"
      );

      this.cache.set(key, out, cacheTtlMs);
      return out;
    } catch (e: any) {
      this.breaker.onFailure();

      const latencyMs = Date.now() - started;
      const code = e?.code ?? "UNKNOWN";
      this.telemetry.onResolveEnd?.({
        key,
        correlationId: opts.correlationId,
        ok: false,
        latencyMs,
        status: e?.status,
        errorCode: code
      });
      this.log.error(
        { correlationId: opts.correlationId, latencyMs, key, code, status: e?.status, details: e?.details },
        "policy.resolve failed"
      );

      if (cacheMode === "READ") {
        const stale = this.cache.getStale(key);
        if (stale) {
          this.log.warn(
            { correlationId: opts.correlationId, key, resolution_hash: stale.meta?.resolution_hash },
            "policy.resolve using last-known-good fallback"
          );
          return stale;
        }
      }

      throw e;
    }
  }
}

export function createPolicyClientFromEnv(env: Record<string, string | undefined>, log?: PolicyLogger): PolicyClient {
  const baseUrl = env.POLICY_API_BASE_URL;
  const apiKey = env.POLICY_API_KEY;

  if (!baseUrl) throw new Error("Missing POLICY_API_BASE_URL");

  return new PolicyClient({ baseUrl, apiKey }, log ?? noopLogger);
}
