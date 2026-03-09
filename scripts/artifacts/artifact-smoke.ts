import { SignJWT } from "jose";

import { resolveArtifactEnv } from "./load-env";

type SmokeMode = "local" | "deployed";
type ApiProfile = "auto" | "generation" | "registry";

type GenerateResponse = {
  artifactId: string;
  artifactType: string;
  status: "PENDING" | "GENERATING" | "COMPLETED" | "FAILED";
  createdAt: string;
  completedAt?: string | null;
  request: Record<string, unknown>;
  output?: unknown;
  metadata?: Record<string, unknown>;
  lineage?: Record<string, unknown>;
  error?: unknown;
  updatedAt: string;
};

function fail(message: string): never {
  console.error(`[artifacts:smoke] ${message}`);
  process.exit(1);
}

function mode(): SmokeMode {
  const raw = (process.env.ARTIFACTS_SMOKE_MODE ?? "local").toLowerCase();
  if (raw !== "local" && raw !== "deployed") {
    fail(`ARTIFACTS_SMOKE_MODE must be local|deployed (got ${raw})`);
  }
  return raw;
}

function apiProfile(): ApiProfile {
  const raw = (process.env.ARTIFACTS_API_PROFILE ?? "auto").toLowerCase();
  if (raw !== "auto" && raw !== "generation" && raw !== "registry") {
    fail(`ARTIFACTS_API_PROFILE must be auto|generation|registry (got ${raw})`);
  }
  return raw;
}

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

async function authToken(tenantId: string, actorId: string, secret?: string, explicitToken?: string): Promise<string> {
  if (explicitToken && explicitToken.trim()) {
    return explicitToken.trim();
  }
  if (!secret) {
    fail(
      "missing auth configuration. Provide one of: ARTIFACTS_AUTH_TOKEN, AUTH_TOKEN, SERVICE_TOKEN, API_BEARER_TOKEN, ARTIFACTS_AUTH_JWT_SECRET, AUTH_JWT_SECRET, JWT_SECRET"
    );
  }
  return mintToken({
    secret,
    tenantId,
    actorId,
    roles: ["artifacts:read", "artifacts:write", "admin"]
  });
}

async function requestJson(args: {
  baseUrl: string;
  method: "GET" | "POST";
  path: string;
  token?: string;
  tenantId?: string;
  body?: unknown;
}): Promise<{ status: number; json: unknown; raw: string }> {
  const headers: Record<string, string> = {
    "content-type": "application/json"
  };
  if (args.token) {
    headers.authorization = `Bearer ${args.token}`;
  }
  if (args.tenantId) {
    headers["x-tenant-id"] = args.tenantId;
  }

  const res = await fetch(`${args.baseUrl}${args.path}`, {
    method: args.method,
    headers,
    body: args.body === undefined ? undefined : JSON.stringify(args.body)
  });
  const raw = await res.text();
  let json: unknown = raw;
  try {
    json = JSON.parse(raw);
  } catch {
    // keep raw text
  }
  return { status: res.status, json, raw };
}

function assertShape(value: unknown, keys: string[], context: string): void {
  if (!value || typeof value !== "object") {
    fail(`${context}: expected object response`);
  }
  const record = value as Record<string, unknown>;
  for (const key of keys) {
    if (!(key in record)) {
      fail(`${context}: missing field '${key}'`);
    }
  }
}

async function main(): Promise<void> {
  const env = resolveArtifactEnv();

  const smokeMode = mode();
  const requestedProfile = apiProfile();
  const baseUrl = env.baseUrl.replace(/\/+$/, "");
  const tenantId = env.tenantId;
  const actorId = process.env.ARTIFACTS_ACTOR_ID ?? "artifacts-smoke";

  const jwtSecret = env.authJwtSecret;
  const primaryToken = await authToken(tenantId, actorId, jwtSecret, env.authToken);

  const otherTenantId = process.env.ARTIFACTS_OTHER_TENANT_ID ?? "11111111-1111-4111-8111-111111111111";
  const otherActorId = process.env.ARTIFACTS_OTHER_ACTOR_ID ?? "artifacts-smoke-other";
  const otherToken = env.otherAuthToken ?? (jwtSecret ? await authToken(otherTenantId, otherActorId, jwtSecret, undefined) : undefined);

  const missingAuth = await requestJson({ baseUrl, method: "GET", path: "/v1/artifacts" });
  if (missingAuth.status !== 401) {
    fail(`expected 401 for missing auth, got ${missingAuth.status}`);
  }

  let effectiveProfile: Exclude<ApiProfile, "auto">;
  if (requestedProfile !== "auto") {
    effectiveProfile = requestedProfile;
  } else {
    const probe = await requestJson({
      baseUrl,
      method: "POST",
      path: "/v1/artifacts/generate",
      token: primaryToken,
      tenantId,
      body: { artifactType: "content.copy" }
    });
    effectiveProfile = probe.status === 404 ? "registry" : "generation";
  }

  let artifactId = "";
  let generatedStatus = "n/a";

  if (effectiveProfile === "generation") {
    const badRequest = await requestJson({
      baseUrl,
      method: "POST",
      path: "/v1/artifacts/generate",
      token: primaryToken,
      tenantId,
      body: { artifactType: "content.copy" }
    });
    if (badRequest.status !== 400) {
      fail(`expected 400 for invalid generate body, got ${badRequest.status}`);
    }

    const generate = await requestJson({
      baseUrl,
      method: "POST",
      path: "/v1/artifacts/generate",
      token: primaryToken,
      tenantId,
      body: {
        artifactType: "content.copy",
        templateKey: "template.v1",
        input: {
          text: "Smoke-test artifact copy"
        }
      }
    });

    if (generate.status !== 201 && generate.status !== 502) {
      fail(`generate expected 201|502, got ${generate.status} body=${generate.raw.slice(0, 300)}`);
    }

    assertShape(generate.json, ["artifactId", "artifactType", "status", "createdAt", "request", "updatedAt"], "generate");
    const generated = generate.json as GenerateResponse;
    generatedStatus = generated.status;

    if (smokeMode === "deployed" && generated.status !== "COMPLETED") {
      fail(`deployed smoke expects COMPLETED artifact, got ${generated.status}`);
    }

    artifactId = generated.artifactId;
    const getById = await requestJson({
      baseUrl,
      method: "GET",
      path: `/v1/artifacts/${artifactId}`,
      token: primaryToken,
      tenantId
    });
    if (getById.status !== 200) {
      fail(`get by id expected 200, got ${getById.status}`);
    }

    const replayEval = await requestJson({
      baseUrl,
      method: "GET",
      path: `/v1/artifacts/${artifactId}/replay-eval`,
      token: primaryToken,
      tenantId
    });
    if (replayEval.status !== 200) {
      fail(`replay-eval expected 200, got ${replayEval.status}`);
    }
    assertShape(replayEval.json, ["artifactId", "snapshotHash", "status", "requestHash", "inputHash", "outputHash"], "replay-eval");

    const replayFreeze = await requestJson({
      baseUrl,
      method: "GET",
      path: `/v1/artifacts/${artifactId}/replay-freeze`,
      token: primaryToken,
      tenantId
    });
    if (replayFreeze.status !== 200) {
      fail(`replay-freeze expected 200, got ${replayFreeze.status}`);
    }
    assertShape(replayFreeze.json, ["artifactId", "freezeHash", "driftDetected", "requestHash", "inputHash", "outputHash"], "replay-freeze");

    const rf = replayFreeze.json as Record<string, unknown>;
    if (smokeMode === "deployed" && rf.driftDetected !== false) {
      fail("deployed smoke expects driftDetected=false for fresh artifact");
    }
  } else {
    const badRequest = await requestJson({
      baseUrl,
      method: "POST",
      path: "/v1/artifacts",
      token: primaryToken,
      tenantId,
      body: { artifactType: "content.copy" }
    });
    if (badRequest.status !== 400) {
      fail(`expected 400 for invalid artifact create body, got ${badRequest.status}`);
    }
  }

  const listed = await requestJson({
    baseUrl,
    method: "GET",
    path: "/v1/artifacts?limit=10&offset=0",
    token: primaryToken,
    tenantId
  });
  if (listed.status !== 200) {
    fail(`list expected 200, got ${listed.status}`);
  }
  if (effectiveProfile === "generation") {
    assertShape(listed.json, ["items", "pagination"], "list");
  } else {
    const arr = Array.isArray(listed.json) ? listed.json : null;
    if (!arr) {
      fail("registry profile expected array response for list");
    }
    if (arr.length > 0) {
      assertShape(arr[0], ["artifactId", "kind", "name", "createdAt"], "registry list item");
      artifactId = String((arr[0] as Record<string, unknown>).artifactId ?? "");
    }
  }

  const invalidQuery = await requestJson({
    baseUrl,
    method: "GET",
    path: "/v1/artifacts?createdAfter=not-a-date",
    token: primaryToken,
    tenantId
  });
  if (effectiveProfile === "generation") {
    if (invalidQuery.status !== 400) {
      fail(`expected 400 for malformed query, got ${invalidQuery.status}`);
    }
  } else if (![200, 400].includes(invalidQuery.status)) {
    fail(`registry profile expected 200|400 for malformed query, got ${invalidQuery.status}`);
  }

  if (otherToken) {
    const crossTenant = await requestJson({
      baseUrl,
      method: "GET",
      path: effectiveProfile === "generation" && artifactId ? `/v1/artifacts/${artifactId}` : "/v1/artifacts",
      token: otherToken,
      tenantId: otherTenantId
    });
    if (![401, 403, 404].includes(crossTenant.status)) {
      fail(`expected 401|403|404 for cross-tenant artifact access, got ${crossTenant.status}`);
    }
  }

  console.log(
    `[artifacts:smoke] OK mode=${smokeMode} profile=${effectiveProfile} base=${baseUrl} artifactId=${artifactId || "n/a"} generateStatus=${generatedStatus}`
  );
}

main().catch((err) => {
  fail(err instanceof Error ? err.message : String(err));
});
