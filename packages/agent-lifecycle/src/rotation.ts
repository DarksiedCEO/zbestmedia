import { AgentLifecycleError, AgentManifest, AgentManifestSchema } from "./manifest";

export type RotationReason = "EXPIRED" | "EXPIRING_SOON" | "MANUAL";

export type RotationPolicy = {
  rotateWindowMs: number;
};

export type HandoffSnapshot = {
  fromAgentId: string;
  toAgentId: string;
  tenantId?: string;
  memoryNamespace: string;
  createdAt: string;
  contextRefs: Array<{ type: string; ref: string }>;
  payload: Record<string, unknown>;
};

export type AuditEvent = {
  at: string;
  type:
    | "AGENT_ROTATION_PLANNED"
    | "AGENT_HANDOFF_WRITTEN"
    | "AGENT_SUCCESSOR_CREATED"
    | "AGENT_RETIRED"
    | "AGENT_ROTATION_SKIPPED"
    | "AGENT_ROTATION_FAILED";
  actor: "system" | string;
  fromAgentId?: string;
  toAgentId?: string;
  reason?: RotationReason;
  details?: Record<string, unknown>;
};

export type RotationPlan = {
  shouldRotate: boolean;
  reason?: RotationReason;
  successorVersion?: string;
};

export function parseManifest(input: unknown): AgentManifest {
  const parsed = AgentManifestSchema.safeParse(input);
  if (!parsed.success) {
    throw new AgentLifecycleError("MANIFEST_INVALID", `Invalid agent manifest: ${parsed.error.message}`);
  }
  return parsed.data;
}

export function planRotation(manifest: AgentManifest, now: Date, policy: RotationPolicy): RotationPlan {
  const expiresAt = new Date(manifest.expiresAt);
  if (Number.isNaN(expiresAt.getTime())) {
    throw new AgentLifecycleError("MANIFEST_INVALID", "expiresAt is not a valid datetime");
  }

  if (manifest.status !== "ACTIVE") {
    return { shouldRotate: false };
  }

  const msUntilExpiry = expiresAt.getTime() - now.getTime();
  if (msUntilExpiry <= 0) {
    return { shouldRotate: true, reason: "EXPIRED", successorVersion: bumpVersion(manifest.version) };
  }
  if (msUntilExpiry <= policy.rotateWindowMs) {
    return { shouldRotate: true, reason: "EXPIRING_SOON", successorVersion: bumpVersion(manifest.version) };
  }
  return { shouldRotate: false };
}

function bumpVersion(v: string): string {
  const m = /^v(\d+)$/.exec(v.trim());
  if (!m) return `${v}.1`;
  const n = Number(m[1]);
  return Number.isFinite(n) ? `v${n + 1}` : `${v}.1`;
}

export function buildSuccessorAgentId(current: AgentManifest, successorVersion: string): string {
  const base = current.agentId.replace(/-v\d+$/i, "");
  return `${base}-${successorVersion}`;
}

export type RotationStore = {
  listActiveManifests: (opts?: { ownerDomain?: string }) => Promise<AgentManifest[]>;
  createManifest: (manifest: AgentManifest) => Promise<void>;
  updateStatus: (agentId: string, status: AgentManifest["status"]) => Promise<void>;
  writeHandoffSnapshot: (snapshot: HandoffSnapshot) => Promise<void>;
  appendAuditEvent: (event: AuditEvent) => Promise<void>;
};

export type RotationExecutorOptions = {
  policy: RotationPolicy;
  actor?: string;
  ownerDomain?: string;
  now?: Date;
  buildHandoffPayload?: (args: {
    from: AgentManifest;
    to: AgentManifest;
    reason: RotationReason;
    now: Date;
  }) => Promise<Pick<HandoffSnapshot, "contextRefs" | "payload">>;
};

export async function runRotation(
  store: RotationStore,
  opts: RotationExecutorOptions
): Promise<{
  rotated: number;
  skipped: number;
}> {
  const now = opts.now ?? new Date();
  const actor = opts.actor ?? "system";

  const manifests = await store.listActiveManifests({ ownerDomain: opts.ownerDomain });
  let rotated = 0;
  let skipped = 0;

  for (const m of manifests) {
    try {
      const plan = planRotation(m, now, opts.policy);

      if (!plan.shouldRotate || !plan.reason || !plan.successorVersion) {
        skipped++;
        await store.appendAuditEvent({
          at: now.toISOString(),
          type: "AGENT_ROTATION_SKIPPED",
          actor,
          fromAgentId: m.agentId,
          details: { status: m.status, expiresAt: m.expiresAt }
        });
        continue;
      }

      const successorAgentId = buildSuccessorAgentId(m, plan.successorVersion);
      const successor: AgentManifest = {
        ...m,
        agentId: successorAgentId,
        version: plan.successorVersion,
        createdAt: now.toISOString(),
        expiresAt: new Date(
          now.getTime() + (new Date(m.expiresAt).getTime() - new Date(m.createdAt).getTime())
        ).toISOString(),
        status: "ACTIVE",
        successorAgentId: undefined
      };

      await store.appendAuditEvent({
        at: now.toISOString(),
        type: "AGENT_ROTATION_PLANNED",
        actor,
        fromAgentId: m.agentId,
        toAgentId: successor.agentId,
        reason: plan.reason,
        details: { ownerDomain: m.ownerDomain }
      });

      await store.createManifest(successor);

      const handoffBits = opts.buildHandoffPayload
        ? await opts.buildHandoffPayload({ from: m, to: successor, reason: plan.reason, now })
        : {
            contextRefs: [],
            payload: {}
          };

      await store.writeHandoffSnapshot({
        fromAgentId: m.agentId,
        toAgentId: successor.agentId,
        memoryNamespace: m.memoryNamespace,
        createdAt: now.toISOString(),
        contextRefs: handoffBits.contextRefs,
        payload: handoffBits.payload
      });

      await store.updateStatus(m.agentId, "RETIRED");

      await store.appendAuditEvent({
        at: now.toISOString(),
        type: "AGENT_HANDOFF_WRITTEN",
        actor,
        fromAgentId: m.agentId,
        toAgentId: successor.agentId
      });
      await store.appendAuditEvent({
        at: now.toISOString(),
        type: "AGENT_SUCCESSOR_CREATED",
        actor,
        fromAgentId: m.agentId,
        toAgentId: successor.agentId,
        reason: plan.reason
      });
      await store.appendAuditEvent({
        at: now.toISOString(),
        type: "AGENT_RETIRED",
        actor,
        fromAgentId: m.agentId,
        toAgentId: successor.agentId
      });

      rotated++;
    } catch (err) {
      skipped++;
      await store.appendAuditEvent({
        at: (opts.now ?? new Date()).toISOString(),
        type: "AGENT_ROTATION_FAILED",
        actor,
        fromAgentId: m.agentId,
        details: { message: err instanceof Error ? err.message : String(err) }
      });
    }
  }

  return { rotated, skipped };
}
