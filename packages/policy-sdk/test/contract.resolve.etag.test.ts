import { describe, expect, it } from "vitest";

import { PolicyClient } from "../src/client";

const BASE_URL = process.env.ARTIFACTS_CONTRACT_TEST_URL;
const TOKEN = process.env.ARTIFACTS_CONTRACT_TEST_TOKEN;
const POLICY_KEY = process.env.ARTIFACTS_CONTRACT_POLICY_KEY ?? "performance_limits";
const CLIENT_ID = process.env.ARTIFACTS_CONTRACT_CLIENT_ID ?? "11111111-1111-4111-8111-111111111111";
const CAMPAIGN_ID = process.env.ARTIFACTS_CONTRACT_CAMPAIGN_ID ?? "22222222-2222-4222-8222-222222222222";
const MIN_CONTRACT_VERSION =
  process.env.POLICY_MIN_CONTRACT_VERSION ?? "policy-resolve@1.0.0";
const RECEIPT_KEYS_JSON = process.env.POLICY_RECEIPT_HMAC_KEYS_JSON;

function parseContractVersion(value: string): { contract: string; major: number; minor: number; patch: number } {
  const match = value.match(/^([a-z0-9_-]+)@(\d+)\.(\d+)\.(\d+)$/i);
  if (!match) throw new Error(`Invalid contract version: ${value}`);
  return {
    contract: match[1],
    major: Number(match[2]),
    minor: Number(match[3]),
    patch: Number(match[4])
  };
}

function versionGte(actual: string, minimum: string): boolean {
  const a = parseContractVersion(actual);
  const m = parseContractVersion(minimum);
  if (a.contract !== m.contract) return false;
  if (a.major !== m.major) return a.major > m.major;
  if (a.minor !== m.minor) return a.minor > m.minor;
  return a.patch >= m.patch;
}

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
    const receipt = first.headers.get("x-policy-receipt");
    const receiptKid = first.headers.get("x-policy-receipt-kid");
    const receiptSig = first.headers.get("x-policy-receipt-sig");
    expect(typeof receipt).toBe("string");
    expect((receipt?.length ?? 0) > 10).toBe(true);
    expect(typeof receiptKid).toBe("string");
    expect((receiptKid?.length ?? 0) > 0).toBe(true);
    expect(typeof receiptSig).toBe("string");
    expect((receiptSig?.length ?? 0) > 0).toBe(true);
    const contractVersion = first.headers.get("x-policy-contract-version");
    expect(typeof contractVersion).toBe("string");
    expect(versionGte(String(contractVersion), MIN_CONTRACT_VERSION)).toBe(true);

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
        userAgent: "@zbest/policy-sdk-contract-test",
        receiptVerifyEnabled: Boolean(RECEIPT_KEYS_JSON),
        receiptVerifyEnforce: Boolean(RECEIPT_KEYS_JSON),
        receiptHmacKeys: RECEIPT_KEYS_JSON ? (JSON.parse(RECEIPT_KEYS_JSON) as Record<string, string>) : {}
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
    if (RECEIPT_KEYS_JSON) {
      expect(first.meta?.receipt_verified).toBe(true);
    }

    await new Promise((r) => setTimeout(r, 5));

    const second = await client.resolvePolicy(input, { cacheMode: "READ", cacheTtlMs: 1 });
    expect(second).toEqual(first);
    expect(telemetryEvents).toContain("cache_revalidated");
  });
});
