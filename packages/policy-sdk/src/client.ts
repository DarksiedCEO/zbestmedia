import {
  PolicyResolveInputSchema,
  PolicyResolveOutputSchema,
  type PolicyResolveInput,
  type PolicyResolveOutput,
  type PolicySdkConfig
} from "./types";
import { httpPostJson } from "./http";
import { withRetry } from "./retry";
import { CircuitBreaker } from "./circuitBreaker";
import { PolicyCache, type CacheMode } from "./cache";
import { PolicySdkError } from "./errors";
import { noopLogger, type PolicyLogger } from "./logger";

export type ResolveOptions = {
  correlationId?: string;
  cacheTtlMs?: number;
  cacheMode?: CacheMode;
};

export class PolicyClient {
  private readonly cfg: Required<Pick<PolicySdkConfig, "timeoutMs" | "userAgent">> & PolicySdkConfig;
  private readonly breaker = new CircuitBreaker({ failureThreshold: 5, resetAfterMs: 15_000 });
  private readonly cache = new PolicyCache();

  constructor(cfg: PolicySdkConfig, private readonly log: PolicyLogger = noopLogger) {
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

    const cached = this.cache.get(key);
    if (cached) {
      this.log.info(
        { correlationId: opts.correlationId, cache: "hit", key, resolution_hash: cached.value.meta?.resolution_hash },
        "policy.resolve cache hit"
      );
      return cached.value;
    }

    if (!this.breaker.canRequest()) {
      if (cacheMode === "READ") {
        throw new PolicySdkError("CIRCUIT_OPEN_NO_CACHE", "Circuit open and no cached policy available");
      }
      throw new PolicySdkError("CIRCUIT_OPEN", "Circuit open; blocking policy resolve for mutate path");
    }

    const url = `${this.cfg.baseUrl.replace(/\/+$/, "")}/v1/policies/resolve`;

    const headers: Record<string, string> = {
      "user-agent": this.cfg.userAgent,
      ...(opts.correlationId ? { "x-correlation-id": opts.correlationId } : {})
    };
    if (this.cfg.apiKey) headers.authorization = `Bearer ${this.cfg.apiKey}`;

    const started = Date.now();

    try {
      const out = await withRetry(
        async () => {
          const res = await httpPostJson<unknown>(url, parsedInput, { timeoutMs: this.cfg.timeoutMs, headers });
          return PolicyResolveOutputSchema.parse(res.json);
        },
        { maxRetries: 2, baseDelayMs: 80, maxDelayMs: 400 }
      );

      this.breaker.onSuccess();

      const latencyMs = Date.now() - started;
      this.log.info(
        {
          correlationId: opts.correlationId,
          latencyMs,
          cache: "miss",
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
