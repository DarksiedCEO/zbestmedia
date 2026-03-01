import { afterEach, describe, expect, it, vi } from "vitest";

import { PolicyClient } from "../src/client";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("PolicyClient conditional revalidation", () => {
  it("reuses cached payload on 304 and emits revalidated telemetry", async () => {
    const telemetryEvents: string[] = [];
    let call = 0;

    globalThis.fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      call += 1;
      if (call === 1) {
        return new Response(
          JSON.stringify({
            resolved: { mode: "ok" },
            meta: { resolution_hash: "abc123", policy_id: "p1", active_version: "1" }
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
              etag: '"abc123"'
            }
          }
        );
      }

      const headers = new Headers(init?.headers);
      expect(headers.get("if-none-match")).toBe('"abc123"');
      return new Response(null, {
        status: 304,
        headers: {
          etag: '"abc123"'
        }
      });
    }) as typeof fetch;

    const client = new PolicyClient(
      {
        baseUrl: "http://policy.local",
        timeoutMs: 2_000
      },
      {
        info: () => undefined,
        warn: () => undefined,
        error: () => undefined
      },
      {
        onCacheRevalidated: () => {
          telemetryEvents.push("cache_revalidated");
        }
      }
    );

    const input = {
      policyKey: "performance_limits",
      client_id: "client-a",
      campaign_id: "campaign-a",
      role: "sebastian"
    };

    const first = await client.resolvePolicy(input, { cacheMode: "READ", cacheTtlMs: 1 });
    await new Promise((r) => setTimeout(r, 5));
    const second = await client.resolvePolicy(input, { cacheMode: "READ", cacheTtlMs: 1 });

    expect(second).toEqual(first);
    expect(telemetryEvents).toContain("cache_revalidated");
    expect(call).toBe(2);
  });
});
