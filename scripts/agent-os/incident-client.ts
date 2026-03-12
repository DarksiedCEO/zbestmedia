import { SignJWT } from "jose";

import type { IncidentSignalInput } from "../../packages/agent-os/src/incidents/types.js";
import { resolveAgentOsEnv, type AgentOsEnvMode } from "./load-env";

async function mintToken(args: {
  secret: string;
  tenantId: string;
  actorId: string;
  roles: string[];
}): Promise<string> {
  const key = new TextEncoder().encode(args.secret);
  return new SignJWT({ tenantId: args.tenantId, roles: args.roles })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(args.actorId)
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(key);
}

async function resolveIncidentAuth(args: {
  mode: AgentOsEnvMode;
  actorId: string;
}): Promise<{ baseUrl: string; token: string; tenantId: string } | null> {
  const env = resolveAgentOsEnv(args.mode);
  const baseUrl = env.baseUrl?.replace(/\/+$/, "");
  if (!baseUrl) {
    return null;
  }

  if (env.authJwtSecret) {
    return {
      baseUrl,
      tenantId: env.authTenantId,
      token: await mintToken({
        secret: env.authJwtSecret,
        tenantId: env.authTenantId,
        actorId: args.actorId,
        roles: ["admin", "agents:read", "agents:write", "artifacts:read"]
      })
    };
  }

  if (env.authToken) {
    return {
      baseUrl,
      tenantId: env.authTenantId,
      token: env.authToken,
    };
  }

  return null;
}

export async function postOperationalIncidentBestEffort(args: {
  mode: AgentOsEnvMode;
  actorId: string;
  signal: IncidentSignalInput;
}): Promise<void> {
  const auth = await resolveIncidentAuth({
    mode: args.mode,
    actorId: args.actorId
  });
  if (!auth) {
    return;
  }

  try {
    await fetch(`${auth.baseUrl}/v1/agent-os/incidents/signals`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${auth.token}`,
        "x-tenant-id": auth.tenantId,
        "content-type": "application/json"
      },
      body: JSON.stringify(args.signal)
    });
  } catch {
    // best effort only; incident emission should not hide the original failure
  }
}
