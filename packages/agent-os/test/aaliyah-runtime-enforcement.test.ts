import { describe, expect, it } from "vitest";

import { AaliyahRuntimeEnforcementService } from "../src/aaliyah/runtime-enforcement.js";

describe("Aaliyah runtime enforcement", () => {
  const service = new AaliyahRuntimeEnforcementService();

  it("allows Aaliyah orchestration requests in founder context", () => {
    const decision = service.evaluate({
      requestedAgentId: "aaliyah",
      requestedAtomicTaskId: "executive_orchestration_founder_protection",
      confidence: "high",
      company: "zbestmedia",
      mode: "executive_assistant",
      principalContext: "founder",
      approvalState: "not_required"
    });

    expect(decision.allowed).toBe(true);
    expect(decision.fallbackOutcome).toBe("proceed_with_orchestration");
  });

  it("forces delegation when Aaliyah is asked to absorb specialist work", () => {
    const decision = service.evaluate({
      requestedAgentId: "aaliyah",
      requestedAtomicTaskId: "email_draft_composition",
      confidence: "high",
      company: "zbestmedia",
      mode: "executive_assistant",
      principalContext: "founder",
      approvalState: "approved"
    });

    expect(decision.allowed).toBe(false);
    expect(decision.fallbackOutcome).toBe("delegate_to_specialist");
    expect(decision.delegateToAgentId).toBe("aaliyah-draft-composer");
  });

  it("hard-fails when a specialist is invoked for a task it does not own", () => {
    const decision = service.evaluate({
      requestedAgentId: "aaliyah-intent-classifier",
      requestedAtomicTaskId: "email_urgency_scoring",
      confidence: "high",
      company: "zbestmedia",
      mode: "email_drafting",
      principalContext: "operator",
      approvalState: "approved"
    });

    expect(decision.allowed).toBe(false);
    expect(decision.fallbackOutcome).toBe("deny_due_to_scope");
  });

  it("fails closed on ambiguous requests", () => {
    const decision = service.evaluate({
      requestedAgentId: "aaliyah",
      requestedAtomicTaskId: null,
      confidence: "high",
      company: "zbestmedia",
      mode: "executive_assistant",
      principalContext: "founder",
      approvalState: "not_required"
    });

    expect(decision.allowed).toBe(false);
    expect(decision.fallbackOutcome).toBe("escalate_for_clarification");
  });

  it("downgrades low-confidence runtime decisions", () => {
    const decision = service.evaluate({
      requestedAgentId: "aaliyah",
      requestedAtomicTaskId: "executive_orchestration_founder_protection",
      confidence: "low",
      company: "zbestmedia",
      mode: "executive_assistant",
      principalContext: "founder",
      approvalState: "not_required"
    });

    expect(decision.allowed).toBe(false);
    expect(decision.fallbackOutcome).toBe("defer_due_to_low_confidence");
  });

  it("denies mode and memory boundary violations", () => {
    const decision = service.evaluate({
      requestedAgentId: "aaliyah",
      requestedAtomicTaskId: "executive_orchestration_founder_protection",
      confidence: "high",
      company: "zbestmedia",
      mode: "executive_assistant",
      principalContext: "founder",
      approvalState: "not_required",
      memoryRequest: {
        companies: ["zbestmedia"],
        modes: ["email_drafting"]
      }
    });

    expect(decision.allowed).toBe(false);
    expect(decision.fallbackOutcome).toBe("deny_due_to_mode_boundary");
  });

  it("blocks non-founder use of Aaliyah orchestration", () => {
    const decision = service.evaluate({
      requestedAgentId: "aaliyah",
      requestedAtomicTaskId: "executive_orchestration_founder_protection",
      confidence: "high",
      company: "zbestmedia",
      mode: "executive_assistant",
      principalContext: "operator",
      approvalState: "not_required"
    });

    expect(decision.allowed).toBe(false);
    expect(decision.fallbackOutcome).toBe("deny_due_to_scope");
  });

  it("requires approval before operator-action specialist work proceeds", () => {
    const decision = service.evaluate({
      requestedAgentId: "aaliyah-approved-draft-dispatcher",
      requestedAtomicTaskId: "email_approved_draft_dispatch",
      confidence: "high",
      company: "zbestmedia",
      mode: "email_drafting",
      principalContext: "operator",
      approvalState: "required_missing"
    });

    expect(decision.allowed).toBe(false);
    expect(decision.fallbackOutcome).toBe("escalate_for_clarification");
  });
});
