import { describe, expect, it } from "vitest";

import { shouldBypassResolveRateLimit } from "../src/http/rateLimitBypass";

describe("resolve rate-limit bypass allowList", () => {
  it("returns false when bypass is disabled", () => {
    expect(
      shouldBypassResolveRateLimit({
        enabled: false,
        method: "GET",
        url: "/v1/policies/resolve?policyKey=performance_limits"
      })
    ).toBe(false);
  });

  it("returns true only for GET /v1/policies/resolve when bypass is enabled", () => {
    expect(
      shouldBypassResolveRateLimit({
        enabled: true,
        method: "GET",
        url: "/v1/policies/resolve?policyKey=performance_limits"
      })
    ).toBe(true);
  });

  it("does not bypass non-resolve routes or non-GET methods", () => {
    expect(
      shouldBypassResolveRateLimit({
        enabled: true,
        method: "POST",
        url: "/v1/policies/resolve"
      })
    ).toBe(false);

    expect(
      shouldBypassResolveRateLimit({
        enabled: true,
        method: "GET",
        url: "/v1/leads?limit=20"
      })
    ).toBe(false);
  });
});
