import { describe, expect, it } from "vitest";

import { parseTargetId, splitTargetId } from "../src/loadrun/target";

describe("target id parsing", () => {
  it("accepts env/service and env/region/service forms", () => {
    expect(parseTargetId("staging/policy")).toBe("staging/policy");
    expect(parseTargetId("prod/us-west/policy")).toBe("prod/us-west/policy");
  });

  it("splits target components deterministically", () => {
    expect(splitTargetId("staging/policy")).toMatchObject({ env: "staging", region: null, service: "policy" });
    expect(splitTargetId("prod/us-west/policy")).toMatchObject({ env: "prod", region: "us-west", service: "policy" });
  });

  it("rejects invalid target ids", () => {
    expect(() => parseTargetId("prod")).toThrow();
    expect(() => parseTargetId("prod//policy")).toThrow();
  });
});
