import { describe, expect, it } from "vitest";

import { PolicyClient } from "../src/client";

const BASE_URL = process.env.ARTIFACTS_CONTRACT_TEST_URL;
const TOKEN = process.env.ARTIFACTS_CONTRACT_TEST_TOKEN;
const POLICY_KEY = process.env.ARTIFACTS_CONTRACT_POLICY_KEY ?? "performance_limits";
const CLIENT_ID = process.env.ARTIFACTS_CONTRACT_CLIENT_ID ?? "11111111-1111-4111-8111-111111111111";
const CAMPAIGN_ID = process.env.ARTIFACTS_CONTRACT_CAMPAIGN_ID ?? "22222222-2222-4222-8222-222222222222";

describe.runIf(Boolean(BASE_URL && TOKEN))("policy-sdk <-> artifacts-api resolve contract", () => {
  it("returns ETag equal to resolution_hash and supports 304 revalidation", async () => {
    const url = new URL("/v1/policies/resolve", BASE_URL);
    url.searchParams.set("policyKey", POLICY_KEY);
    url.searchParams.set("clientId", CLIENT_ID);
    url.searchParams.set("campaignId", CAMPAIGN_ID);

    const first = await fetch(url.toString(), {
      headers: {
        authorization: `Bearer ${TOKEN}`
      }
    });

    expect(first.status).toBe(200);
    const firstJson = (await first.json()) as {
      meta?: {
        resolution_hash?: string;
      };
    };

    const resolutionHash = firstJson.meta?.resolution_hash;
    expect(typeof resolutionHash).toBe("string");
    expect(resolutionHash && resolutionHash.length > 0).toBe(true);

    const etag = first.headers.get("etag");
    expect(etag).toBe(`"${resolutionHash}"`);

    const second = await fetch(url.toString(), {
      headers: {
        authorization: `Bearer ${TOKEN}`,
        "if-none-match": String(etag)
      }
    });

    expect(second.status).toBe(304);
    const body = await second.text();
    expect(body).toBe("");
  });

  it("sdk revalidates with If-None-Match and returns cached payload on 304", async () => {
    const telemetryEvents: string[] = [];
    const client = new PolicyClient(
      {
        baseUrl: String(BASE_URL),
        apiKey: String(TOKEN),
        timeoutMs: 2_000,
        userAgent: "@zbest/policy-sdk-contract-test"
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
      policyKey: POLICY_KEY,
      client_id: CLIENT_ID,
      campaign_id: CAMPAIGN_ID,
      role: "sebastian"
    };

    const first = await client.resolvePolicy(input, { cacheMode: "READ", cacheTtlMs: 1 });
    expect(typeof first.meta?.resolution_hash).toBe("string");

    await new Promise((r) => setTimeout(r, 5));

    const second = await client.resolvePolicy(input, { cacheMode: "READ", cacheTtlMs: 1 });
    expect(second).toEqual(first);
    expect(telemetryEvents).toContain("cache_revalidated");
  });
});
