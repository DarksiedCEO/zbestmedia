import { z } from "zod";

export const AgentStatusSchema = z.enum(["ACTIVE", "RETIRED", "DISABLED"]);
export type AgentStatus = z.infer<typeof AgentStatusSchema>;

export const AgentManifestSchema = z.object({
  agentId: z.string().min(3),
  role: z.string().min(2),
  version: z.string().min(1),
  ownerDomain: z.string().min(2),
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  status: AgentStatusSchema,
  memoryNamespace: z.string().min(3),
  successorAgentId: z.string().min(3).optional()
});

export type AgentManifest = z.infer<typeof AgentManifestSchema>;

export class AgentLifecycleError extends Error {
  public readonly code:
    | "MANIFEST_INVALID"
    | "AGENT_EXPIRED"
    | "AGENT_NOT_ACTIVE"
    | "AGENT_DISABLED";

  constructor(code: AgentLifecycleError["code"], message: string) {
    super(message);
    this.code = code;
  }
}
