import type { RotationStore } from "@zbest/agent-lifecycle";
import { runRotation } from "@zbest/agent-lifecycle";

export async function runBrandTrinityRotationJob(args: {
  store: RotationStore;
  now?: Date;
}) {
  return runRotation(args.store, {
    ownerDomain: "brand-trinity",
    policy: {
      rotateWindowMs: 7 * 24 * 60 * 60 * 1000
    },
    now: args.now,
    actor: "system",
    buildHandoffPayload: async ({ from, to, reason, now }) => {
      return {
        contextRefs: [
          { type: "agent-manifest", ref: from.agentId },
          { type: "rotation-reason", ref: reason }
        ],
        payload: {
          rotatedAt: now.toISOString(),
          fromAgentId: from.agentId,
          toAgentId: to.agentId,
          ownerDomain: from.ownerDomain
        }
      };
    }
  });
}
