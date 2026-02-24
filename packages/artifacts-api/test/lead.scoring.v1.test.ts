import { describe, expect, it } from "vitest";

import { computeScoreV1 } from "../src/lead/scoring/scoreV1";

function baseInput(overrides?: Partial<Parameters<typeof computeScoreV1>[0]>): Parameters<typeof computeScoreV1>[0] {
  const now = new Date("2026-02-24T20:00:00.000Z");
  return {
    snapshot: {
      id: "lead_1",
      tenantId: "tenant_1",
      email: "a@acme.com",
      companyDomain: "acme.com",
      source: "website",
      channel: "organic",
      sourceRef: null,
      lifecycleStage: "new"
    },
    events: [],
    conversions: [],
    now,
    ...overrides
  };
}

describe("computeScoreV1", () => {
  it("applies base + source + company domain", () => {
    const res = computeScoreV1(baseInput());
    expect(res.scoreTotal).toBe(20);
    expect(res.version).toBe("v1");
    expect(res.breakdown.length).toBeGreaterThan(0);
  });

  it("applies free-email penalty", () => {
    const res = computeScoreV1(
      baseInput({
        snapshot: {
          id: "lead_1",
          tenantId: "tenant_1",
          email: "x@gmail.com",
          companyDomain: null,
          source: "website",
          channel: null,
          sourceRef: null,
          lifecycleStage: "new"
        }
      })
    );

    expect(res.scoreTotal).toBe(10);
  });

  it("awards pricing view once when present in last 24h", () => {
    const now = new Date("2026-02-24T20:00:00.000Z");
    const res = computeScoreV1(
      baseInput({
        now,
        events: [
          { id: "e1", type: "pricing_view", createdAt: new Date("2026-02-24T19:30:00.000Z"), payload: {} },
          { id: "e2", type: "pricing_view", createdAt: new Date("2026-02-24T19:40:00.000Z"), payload: {} }
        ]
      })
    );
    expect(res.scoreTotal).toBe(40);
  });

  it("uses max pricing time tier", () => {
    const now = new Date("2026-02-24T20:00:00.000Z");
    const res = computeScoreV1(
      baseInput({
        now,
        events: [
          {
            id: "e1",
            type: "pricing_time",
            createdAt: new Date("2026-02-24T18:00:00.000Z"),
            payload: { time_on_pricing_seconds: 35 }
          },
          {
            id: "e2",
            type: "pricing_time",
            createdAt: new Date("2026-02-24T18:05:00.000Z"),
            payload: { time_on_pricing_seconds: 125 }
          }
        ]
      })
    );
    expect(res.scoreTotal).toBe(35);
  });

  it("sets sql and floors to 70 on meeting_booked", () => {
    const res = computeScoreV1(
      baseInput({
        conversions: [
          { id: "c1", type: "meeting_booked", createdAt: new Date("2026-02-24T19:00:00.000Z"), valueUsd: null, meta: {} }
        ]
      })
    );

    expect(res.lifecycleStage).toBe("sql");
    expect(res.scoreTotal).toBe(70);
  });

  it("forces customer and 100 on signed_msa", () => {
    const res = computeScoreV1(
      baseInput({
        conversions: [{ id: "c1", type: "signed_msa", createdAt: new Date("2026-02-24T19:00:00.000Z"), valueUsd: 1000, meta: {} }]
      })
    );

    expect(res.lifecycleStage).toBe("customer");
    expect(res.scoreTotal).toBe(100);
  });

  it("clamps to 100 max", () => {
    const res = computeScoreV1(
      baseInput({
        events: [
          { id: "e1", type: "pricing_view", createdAt: new Date("2026-02-24T19:30:00.000Z"), payload: {} },
          { id: "e2", type: "form_submit", createdAt: new Date("2026-02-24T19:31:00.000Z"), payload: {} },
          { id: "e3", type: "demo_request", createdAt: new Date("2026-02-24T19:32:00.000Z"), payload: {} },
          {
            id: "e4",
            type: "pricing_time",
            createdAt: new Date("2026-02-24T19:33:00.000Z"),
            payload: { time_on_pricing_seconds: 9999 }
          }
        ],
        conversions: [{ id: "c1", type: "purchase", createdAt: new Date("2026-02-24T19:40:00.000Z"), valueUsd: 5000, meta: {} }]
      })
    );

    expect(res.scoreTotal).toBe(100);
    expect(res.lifecycleStage).toBe("customer");
  });
});
