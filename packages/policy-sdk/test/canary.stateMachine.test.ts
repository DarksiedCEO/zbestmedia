import { describe, expect, it } from "vitest";

import { applyStateForStep, observeStateForStep, validateTransition } from "../src/canary/stateMachine";

describe("canary state machine", () => {
  it("maps step states correctly", () => {
    expect(applyStateForStep(5)).toBe("APPLY_5");
    expect(observeStateForStep(25)).toBe("OBSERVE_25");
    expect(applyStateForStep(100)).toBe("APPLY_100");
  });

  it("accepts valid transition graph", () => {
    expect(() => validateTransition({ from: "IDLE", to: "APPLY_5", step: 5 })).not.toThrow();
    expect(() => validateTransition({ from: "OBSERVE_50", to: "APPLY_100", step: 100 })).not.toThrow();
  });

  it("rejects invalid transition", () => {
    expect(() => validateTransition({ from: "IDLE", to: "OBSERVE_5", step: 5 })).toThrow();
  });
});
