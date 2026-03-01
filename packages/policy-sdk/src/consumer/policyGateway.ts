import { PolicyClient } from "../client";
import type { PolicyResolveInput, PolicyResolveOutput } from "../types";
import type { PolicyLogger } from "../logger";

export type PolicyGatewayMode = "READ" | "MUTATE";

export class PolicyGateway {
  constructor(private readonly client: PolicyClient, private readonly log: PolicyLogger) {}

  async resolve(input: PolicyResolveInput, mode: PolicyGatewayMode, correlationId?: string): Promise<PolicyResolveOutput> {
    return this.client.resolvePolicy(input, {
      correlationId,
      cacheMode: mode,
      cacheTtlMs: mode === "READ" ? 180_000 : 60_000
    });
  }
}
