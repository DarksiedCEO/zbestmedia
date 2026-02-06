import type { RotationStore } from "@zbest/agent-lifecycle";
import { runRotation } from "@zbest/agent-lifecycle";
import type { PrismaClient } from "../generated/prisma/index.js";
import { createPrismaRotationStore } from "./rotationStore.prisma.js";

type RotationJobArgs =
  | { store: RotationStore; now?: Date }
  | { prisma: PrismaClient; tenantId: string; now?: Date };

export async function runBrandTrinityRotationJob(args: RotationJobArgs) {
  const store =
    "store" in args ? args.store : createPrismaRotationStore(args.prisma, args.tenantId);

  return runRotation(store, {
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
