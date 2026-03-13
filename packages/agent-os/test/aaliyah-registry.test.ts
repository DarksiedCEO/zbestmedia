import { describe, expect, it } from "vitest";

import {
  AALIYAH_ATOMIC_REGISTRY,
  type AaliyahAtomicRegistry,
  ensureAaliyahAtomicRegistryIntegrity,
  validateAaliyahAtomicRegistry
} from "../src/aaliyah/index.js";

function cloneRegistry(registry: AaliyahAtomicRegistry): AaliyahAtomicRegistry {
  return structuredClone(registry);
}

describe("Aaliyah atomic registry", () => {
  it("loads and validates the canonical registry", () => {
    expect(ensureAaliyahAtomicRegistryIntegrity()).toEqual(AALIYAH_ATOMIC_REGISTRY);
  });

  it("keeps Aaliyah scoped to one atomic orchestration task", () => {
    const aaliyah = AALIYAH_ATOMIC_REGISTRY.items.find((item) => item.agentId === "aaliyah");
    expect(aaliyah).toBeDefined();
    expect(aaliyah?.exactAtomicTaskId).toBe("executive_orchestration_founder_protection");
    expect(aaliyah?.forbiddenScope).toContain("specialist execution");
  });

  it("requires forbidden scope on every registry entry", () => {
    for (const item of AALIYAH_ATOMIC_REGISTRY.items) {
      expect(item.forbiddenScope.length).toBeGreaterThan(0);
    }
  });

  it("fails on duplicate agent ids", () => {
    const mutated = cloneRegistry(AALIYAH_ATOMIC_REGISTRY);
    mutated.items.push(structuredClone(mutated.items[0]));
    expect(() => validateAaliyahAtomicRegistry(mutated)).toThrow(/duplicate agent id/i);
  });

  it("fails when fallback behavior is missing", () => {
    const mutated = cloneRegistry(AALIYAH_ATOMIC_REGISTRY);
    mutated.items[0] = { ...mutated.items[0], fallbackBehavior: "" };
    expect(() => validateAaliyahAtomicRegistry(mutated)).toThrow(/missing fallback behavior/i);
  });

  it("fails when escalation triggers are missing", () => {
    const mutated = cloneRegistry(AALIYAH_ATOMIC_REGISTRY);
    mutated.items[0] = { ...mutated.items[0], escalationTriggers: [] };
    expect(() => validateAaliyahAtomicRegistry(mutated)).toThrow(/missing escalation triggers/i);
  });

  it("fails when forbidden scope is missing", () => {
    const mutated = cloneRegistry(AALIYAH_ATOMIC_REGISTRY);
    mutated.items[0] = { ...mutated.items[0], forbiddenScope: [] };
    expect(() => validateAaliyahAtomicRegistry(mutated)).toThrow(/missing forbidden scope/i);
  });

  it("fails when a task description becomes bundled", () => {
    const mutated = cloneRegistry(AALIYAH_ATOMIC_REGISTRY);
    mutated.items[0] = {
      ...mutated.items[0],
      exactAtomicTask: "Perform executive orchestration and dispatch drafts."
    };
    expect(() => validateAaliyahAtomicRegistry(mutated)).toThrow(/bundled or ambiguous task text/i);
  });
});
