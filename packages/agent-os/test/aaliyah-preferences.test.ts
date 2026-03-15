import { describe, expect, it, vi } from "vitest";

import { AaliyahPreferenceService } from "../src/aaliyah/preferences.js";

const basePreference = {
  tenantId: "tenant",
  active: true,
  createdAt: "2026-03-15T00:00:00.000Z",
  updatedAt: "2026-03-15T00:00:00.000Z",
  deactivatedAt: null,
  createdBy: "actor-1",
  deactivatedBy: null
};

describe("Aaliyah founder preferences", () => {
  it("prefers explicit preferences over inferred ones", async () => {
    const service = new AaliyahPreferenceService({
      listAaliyahFounderPreferences: vi.fn(async () => [
        {
          ...basePreference,
          preferenceId: "pref:1",
          category: "briefing_length",
          value: "expanded",
          scope: { mode: "founder", company: "all", founderOnly: true },
          sourceType: "validated_inference",
          confidenceLevel: "high"
        },
        {
          ...basePreference,
          preferenceId: "pref:2",
          category: "briefing_length",
          value: "compact",
          scope: { mode: "founder", company: "all", founderOnly: true },
          sourceType: "explicit",
          confidenceLevel: "high"
        }
      ])
    } as never);

    const resolved = await service.resolvePreferences({ tenantId: "tenant", mode: "founder" });
    expect(resolved.briefingLength).toBe("compact");
    expect(resolved.appliedPreferences[0]?.preferenceId).toBe("pref:2");
  });

  it("does not let low-confidence inference override defaults", async () => {
    const service = new AaliyahPreferenceService({
      listAaliyahFounderPreferences: vi.fn(async () => [
        {
          ...basePreference,
          preferenceId: "pref:3",
          category: "tone_preference",
          value: "detailed",
          scope: { mode: "all", company: "all", founderOnly: true },
          sourceType: "validated_inference",
          confidenceLevel: "low"
        }
      ])
    } as never);

    const resolved = await service.resolvePreferences({ tenantId: "tenant", mode: "founder" });
    expect(resolved.tonePreference).toBe("balanced");
    expect(resolved.appliedPreferences).toHaveLength(0);
  });
});
