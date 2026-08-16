import { acquireExpectedBindingAuthority, acquireObservedGitIdentity } from "./activation-authority-adapters.mjs";
import { compareActivationEvidence } from "./activation-decision.mjs";

export function evaluateGovernedPendingActivation() {
  if (arguments.length !== 0) throw new TypeError("REJECT_CALLER_SELECTED_ACTIVATION_BINDING");
  const expected=acquireExpectedBindingAuthority();
  const observed=acquireObservedGitIdentity();
  return compareActivationEvidence(expected,observed);
}
