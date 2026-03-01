import type { CanaryState, CanaryStep } from "./types";

export function applyStateForStep(step: CanaryStep): CanaryState {
  if (step === 5) return "APPLY_5";
  if (step === 25) return "APPLY_25";
  if (step === 50) return "APPLY_50";
  return "APPLY_100";
}

export function observeStateForStep(step: CanaryStep): CanaryState {
  if (step === 5) return "OBSERVE_5";
  if (step === 25) return "OBSERVE_25";
  return "OBSERVE_50";
}

export function validateTransition(args: {
  from: CanaryState;
  to: CanaryState;
  step?: CanaryStep;
}): void {
  const key = `${args.from}->${args.to}`;
  const allowed = new Set<string>([
    "IDLE->APPLY_5",
    "IDLE->APPLY_25",
    "IDLE->APPLY_50",
    "IDLE->APPLY_100",
    "APPLY_5->OBSERVE_5",
    "APPLY_25->OBSERVE_25",
    "APPLY_50->OBSERVE_50",
    "APPLY_100->DONE",
    "OBSERVE_5->APPLY_25",
    "OBSERVE_25->APPLY_50",
    "OBSERVE_50->APPLY_100",
    "OBSERVE_5->ROLLBACK",
    "OBSERVE_25->ROLLBACK",
    "OBSERVE_50->ROLLBACK",
    "APPLY_5->ROLLBACK",
    "APPLY_25->ROLLBACK",
    "APPLY_50->ROLLBACK",
    "APPLY_100->ROLLBACK",
    "ROLLBACK->FAILED",
    "DONE->DONE",
    "FAILED->FAILED"
  ]);

  if (!allowed.has(key)) {
    throw new Error(`Invalid canary transition: ${key}`);
  }

  if (args.to.startsWith("APPLY_") && args.step == null) {
    throw new Error(`Transition ${key} requires step`);
  }
}
