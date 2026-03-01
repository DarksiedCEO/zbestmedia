import type { ParsedPolicyResolveInput, PolicyResolveOutput } from "./types";

export type CacheMode = "READ" | "MUTATE";

export type CacheEntry = {
  value: PolicyResolveOutput;
  storedAtMs: number;
  ttlMs: number;
};

export class PolicyCache {
  private readonly map = new Map<string, CacheEntry>();

  makeKey(input: ParsedPolicyResolveInput): string {
    const asOf = input.asOf ?? "NOW";
    return `policy:${input.policyKey}:${input.client_id}:${input.campaign_id}:${input.role}:${asOf}`;
  }

  get(key: string): CacheEntry | undefined {
    const e = this.map.get(key);
    if (!e) return undefined;
    if (Date.now() - e.storedAtMs > e.ttlMs) {
      return undefined;
    }
    return e;
  }

  getStale(key: string): PolicyResolveOutput | undefined {
    return this.map.get(key)?.value;
  }

  getStaleEntry(key: string): CacheEntry | undefined {
    return this.map.get(key);
  }

  set(key: string, value: PolicyResolveOutput, ttlMs: number): void {
    this.map.set(key, { value, storedAtMs: Date.now(), ttlMs });
  }
}
