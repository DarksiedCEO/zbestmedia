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

const DEFAULT_MIN_CONTRACT_VERSION = "policy-resolve@1.0.0";

export type ResolveOptions = {
  correlationId?: string;
  cacheTtlMs?: number;
  cacheMode?: CacheMode;
};

type ParsedContractVersion = {
  contract: string;
  major: number;
  minor: number;
  patch: number;
};

function parseContractVersion(version: string): ParsedContractVersion | null {
  const match = version.trim().match(/^([a-z0-9_-]+)@(\d+)\.(\d+)\.(\d+)$/i);
  if (!match) return null;
  return {
    contract: match[1],
    major: Number(match[2]),
    minor: Number(match[3]),
    patch: Number(match[4])
  };
}

function compareContractVersions(a: ParsedContractVersion, b: ParsedContractVersion): number {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  return a.patch - b.patch;
}

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

  private validateContractVersion(versionHeader: string | null, correlationId?: string): void {
    const minContractVersion = this.cfg.minContractVersion ?? DEFAULT_MIN_CONTRACT_VERSION;
    const enforceContractVersion = this.cfg.enforceContractVersion ?? false;

    if (!versionHeader) {
      if (enforceContractVersion) {
        throw new PolicySdkError("CONTRACT_VERSION_MISSING", "Missing x-policy-contract-version response header");
      }
      this.log.warn(
        { correlationId, minContractVersion, enforceContractVersion },
        "policy.resolve response missing contract version header"
      );
      return;
    }

    const actualParsed = parseContractVersion(versionHeader);
    const minParsed = parseContractVersion(minContractVersion);

    if (!actualParsed || !minParsed) {
      if (enforceContractVersion) {
        throw new PolicySdkError("CONTRACT_VERSION_INVALID", "Invalid policy contract version format", {
          details: { versionHeader, minContractVersion }
        });
      }
      this.log.warn(
        { correlationId, versionHeader, minContractVersion, enforceContractVersion },
        "policy.resolve contract version format is invalid"
      );
      return;
    }

    if (actualParsed.contract !== minParsed.contract) {
      if (enforceContractVersion) {
        throw new PolicySdkError("CONTRACT_VERSION_MISMATCH", "Policy contract name does not match expected contract", {
          details: {
            actual: versionHeader,
            minimum: minContractVersion
          }
        });
      }
      this.log.warn(
        { correlationId, actualContractVersion: versionHeader, minContractVersion },
        "policy.resolve contract name mismatch"
      );
      return;
    }

    const cmp = compareContractVersions(actualParsed, minParsed);
    if (cmp < 0) {
      if (enforceContractVersion) {
        throw new PolicySdkError("CONTRACT_VERSION_TOO_OLD", "Policy contract version is lower than required minimum", {
          details: {
            actual: versionHeader,
            minimum: minContractVersion
          }
        });
      }
      this.log.warn(
        { correlationId, actualContractVersion: versionHeader, minContractVersion },
        "policy.resolve contract version is older than configured minimum"
      );
      return;
    }
    if (cmp > 0) {
      this.log.warn(
        { correlationId, actualContractVersion: versionHeader, minContractVersion },
        "policy.resolve contract version is newer than configured minimum"
      );
    }
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
          this.validateContractVersion(res.headers.get("x-policy-contract-version"), opts.correlationId);
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
  const minContractVersion = env.POLICY_MIN_CONTRACT_VERSION ?? DEFAULT_MIN_CONTRACT_VERSION;
  const enforceContractVersion = String(env.POLICY_ENFORCE_CONTRACT_VERSION ?? "false").toLowerCase() === "true";

  if (!baseUrl) throw new Error("Missing POLICY_API_BASE_URL");

  return new PolicyClient({ baseUrl, apiKey, minContractVersion, enforceContractVersion }, log ?? noopLogger);
}
