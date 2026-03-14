import { describe, expect, it, vi } from "vitest";

import { VoiceRuntimeService } from "../src/voice/service.js";
import { VoiceRoutingService } from "../src/voice/routing.js";

describe("voice runtime service", () => {
  const repository = {
    createAssignmentRecord: vi.fn(async () => ({
      assignmentRecordId: "assignment:voice:1"
    })),
    createExecutionRunRecord: vi.fn(async () => ({
      runRecordId: "run:voice:1",
      currentState: "requested"
    })),
    transitionExecutionRunRecord: vi.fn(async (_args: unknown) => ({
      runRecordId: "run:voice:1",
      currentState: "succeeded"
    })),
    getExecutionRunRecord: vi.fn(async () => ({
      runRecordId: "run:voice:1",
      currentState: "routed"
    })),
    createVoiceCallRecord: vi.fn(async (args: any) => ({
      tenantId: args.tenantId,
      callId: "voice-call:1",
      externalCallId: args.externalCallId,
      sourceSystem: args.sourceSystem,
      callerPhoneNumber: args.callerPhoneNumber,
      callerDisplayName: args.callerDisplayName,
      callerOrganizationName: args.callerOrganizationName,
      transcript: args.transcript,
      callSummaryText: args.callSummaryText,
      durationSeconds: args.durationSeconds,
      intent: args.intent,
      urgency: args.urgency,
      riskLevel: args.riskLevel,
      companyMode: args.companyMode,
      routingTarget: args.routingTarget,
      assignmentRecordId: args.assignmentRecordId,
      runRecordId: args.runRecordId,
      outcome: args.outcome,
      founderAttentionRequired: args.founderAttentionRequired,
      escalationRecommended: args.escalationRecommended,
      interruptionClass: args.interruptionClass,
      recommendedNextAction: args.recommendedNextAction,
      createdAt: args.createdAt ?? "2026-03-14T00:00:00.000Z",
      updatedAt: args.createdAt ?? "2026-03-14T00:00:00.000Z"
    })),
    getVoiceCallRecord: vi.fn(async () => null),
    listVoiceCallRecords: vi.fn(async () => [])
  } as any;

  const ledger = {
    createAssignment: vi.fn(async () => ({ assignmentRecordId: "assignment:voice:1" })),
    createRun: vi.fn(async () => ({ runRecordId: "run:voice:1", currentState: "requested" })),
    transition: vi.fn(async ({ transition }: { transition: string }) => ({
      runRecordId: "run:voice:1",
      currentState:
        transition === "validate" ? "validated" :
        transition === "route" ? "routed" :
        transition === "succeed" ? "succeeded" :
        "failed"
    })),
    getExecutionRunRecord: vi.fn(async () => ({ runRecordId: "run:voice:1", currentState: "routed" }))
  } as any;

  const incidents = {
    createFromExecutionFailure: vi.fn(async () => ({ incidentId: "incident:1" }))
  } as any;

  const service = new VoiceRuntimeService(repository, ledger, incidents);

  it("creates a durable processed voice call with founder-safe escalation metadata", async () => {
    const result = await service.processInboundCall({
      tenantId: "tenant",
      actorId: "actor-1",
      correlationId: "corr-1",
      requestSource: "test-suite",
      payload: {
        sourceSystem: "voice-gateway",
        caller: {
          phoneNumber: "+13105551212",
          displayName: "Taylor Client"
        },
        transcript: "I need to speak to the founder about an urgent partnership."
      }
    });

    expect(result.call.intent).toBe("executive_access_request");
    expect(result.call.outcome).toBe("escalated");
    expect(result.summary.founderAttentionRequired).toBe(true);
  });

  it("routes wrong-number calls to safe suppression", () => {
    const routing = new VoiceRoutingService().resolve({
      intent: "wrong_number_or_irrelevant",
      urgency: "low",
      riskLevel: "low",
      companyMode: "zbestmedia",
      escalationRecommended: false,
      founderAttentionRequired: false
    });

    expect(routing.target.targetType).toBe("suppressed");
  });

  it("creates incidents on voice runtime failure", async () => {
    const failing = new VoiceRuntimeService(
      repository,
      ledger,
      incidents,
      {
        normalize: vi.fn(() => {
          throw new Error("voice_runtime_broke");
        })
      } as any
    );

    await expect(
      failing.processInboundCall({
        tenantId: "tenant",
        actorId: "actor-1",
        correlationId: "corr-1",
        requestSource: "test-suite",
        payload: {
          sourceSystem: "voice-gateway",
          caller: {
            phoneNumber: "+13105551212"
          },
          transcript: "hello"
        }
      })
    ).rejects.toThrow("voice_runtime_broke");

    expect(incidents.createFromExecutionFailure).toHaveBeenCalled();
  });
});
