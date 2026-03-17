import { describe, expect, it, vi } from "vitest";

import { AaliyahFounderPreferencesService } from "../src/aaliyah/founder-preferences-service.js";

const tenantId = "11111111-1111-4111-8111-111111111111";

function createRepository() {
  let stored: any = null;
  return {
    getFounderPreferenceControls: vi.fn(async () => stored),
    upsertFounderPreferenceControls: vi.fn(async (args: any) => {
      stored = {
        id: args.preferencesId,
        tenantId: args.tenantId,
        actorUserId: args.actorUserId,
        notification: args.notification,
        digest: args.digest,
        opportunity: args.opportunity,
        recommendation: args.recommendation,
        scheduler: args.scheduler,
        delivery: args.delivery,
        escalation: args.escalation,
        createdAtIso: args.createdAt,
        updatedAtIso: args.updatedAt
      };
      return stored;
    })
  } as any;
}

describe("Aaliyah founder preference controls", () => {
  it("resolves defaults when no founder controls are stored", async () => {
    const service = new AaliyahFounderPreferencesService(createRepository());
    const result = await service.get({
      tenantId,
      actorId: "actor-1",
      principalContext: "founder",
      mode: "founder"
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.preferences.notification.minimumEmailSeverity).toBe("critical");
    expect(result.preferences.digest.dailyDigestEnabled).toBe(true);
    expect(result.preferences.scheduler.allowAutomaticRuns).toBe(true);
    expect(result.preferences.escalation.criticalEscalationHours).toBe(24);
  });

  it("persists overrides on top of defaults", async () => {
    const service = new AaliyahFounderPreferencesService(createRepository());
    const result = await service.put({
      tenantId,
      actorId: "actor-1",
      principalContext: "founder",
      mode: "founder",
      input: {
        notification: { minimumEmailSeverity: "warning" },
        digest: { dailyDigestEnabled: false },
        delivery: { emailEnabled: false },
        escalation: { attentionOverloadThreshold: 7 }
      }
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.preferences.notification.minimumEmailSeverity).toBe("warning");
    expect(result.preferences.digest.dailyDigestEnabled).toBe(false);
    expect(result.preferences.delivery.emailEnabled).toBe(false);
    expect(result.preferences.delivery.consoleEnabled).toBe(true);
    expect(result.preferences.escalation.attentionOverloadThreshold).toBe(7);
  });

  it("rejects invalid delivery configuration", async () => {
    const service = new AaliyahFounderPreferencesService(createRepository());
    const result = await service.put({
      tenantId,
      actorId: "actor-1",
      principalContext: "founder",
      mode: "founder",
      input: {
        delivery: {
          emailEnabled: false,
          consoleEnabled: false
        }
      }
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errorCode).toBe("INVALID_INPUT");
  });

  it("denies non-founder access", async () => {
    const service = new AaliyahFounderPreferencesService(createRepository());
    const result = await service.get({
      tenantId,
      actorId: "actor-1",
      principalContext: "operator",
      mode: "founder"
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.denialCode).toBe("ACCESS_DENIED");
  });
});
