export type GovernanceSnapshot = {
  integrity_score: number;
  governance_fingerprint: string;
  auto_block_active: boolean;
  last_self_check_passed?: boolean;
  last_self_check_ts?: string | null;
  integrity_flags: unknown[];
  runtime: {
    defaults_hash: string;
    enforcement_mode: string;
  };
  controls?: {
    freeze_mode?: boolean;
    kill_switch_active?: boolean;
  };
};

export type ApiEnv = {
  VITE_POLICY_BASE_URL: string;
  VITE_POLICY_BEARER: string;
  VITE_POLICY_INTROSPECTION_TOKEN?: string;
  VITE_APP_API_BASE_URL?: string;
};

type FetchClient = ReturnType<typeof createFetchClient>;

function required(raw: Record<string, unknown>, key: keyof ApiEnv): string {
  const value = raw[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${String(key)} is required`);
  }
  return value.trim();
}

export function readApiEnv(raw: Record<string, unknown>): ApiEnv {
  return {
    VITE_POLICY_BASE_URL: required(raw, "VITE_POLICY_BASE_URL"),
    VITE_POLICY_BEARER: required(raw, "VITE_POLICY_BEARER"),
    VITE_POLICY_INTROSPECTION_TOKEN:
      typeof raw.VITE_POLICY_INTROSPECTION_TOKEN === "string" ? raw.VITE_POLICY_INTROSPECTION_TOKEN.trim() : undefined,
    VITE_APP_API_BASE_URL:
      typeof raw.VITE_APP_API_BASE_URL === "string" ? raw.VITE_APP_API_BASE_URL.trim() : undefined
  };
}

export function resolveAppApiBaseUrl(raw: Record<string, unknown>): string {
  const env = readApiEnv(raw);
  return env.VITE_APP_API_BASE_URL || env.VITE_POLICY_BASE_URL;
}

export function createFetchClient(args: { correlationId: () => string }) {
  return async function fetchJson<T>(input: {
    url: string;
    method?: "GET" | "POST";
    bearer?: string;
    introspectionToken?: string;
    body?: unknown;
  }): Promise<T> {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      "x-correlation-id": args.correlationId()
    };
    if (input.bearer) headers.authorization = `Bearer ${input.bearer}`;
    if (input.introspectionToken) headers["x-policy-introspection-token"] = input.introspectionToken;

    const res = await fetch(input.url, {
      method: input.method ?? "GET",
      headers,
      body: input.body === undefined ? undefined : JSON.stringify(input.body)
    });

    const raw = await res.text();
    let json: unknown = null;
    try {
      json = raw ? JSON.parse(raw) : null;
    } catch {
      json = raw;
    }

    if (!res.ok) {
      const message =
        typeof json === "object" && json && "message" in json ? String((json as { message: unknown }).message) : `HTTP ${res.status}`;
      throw new Error(message);
    }

    return json as T;
  };
}

export async function fetchGovernanceSnapshot(args: {
  baseUrl: string;
  bearer: string;
  introspectionToken?: string;
  fetchClient: FetchClient;
}): Promise<GovernanceSnapshot> {
  return args.fetchClient<GovernanceSnapshot>({
    url: `${args.baseUrl.replace(/\/+$/, "")}/policy/internal/governance`,
    bearer: args.bearer,
    introspectionToken: args.introspectionToken
  });
}

export async function scoreContentDraft(args: {
  baseUrl: string;
  bearer: string;
  fetchClient: FetchClient;
  targetId: string;
  platform: string;
  body: string;
}): Promise<Record<string, unknown>> {
  return args.fetchClient<Record<string, unknown>>({
    url: `${args.baseUrl.replace(/\/+$/, "")}/v1/content/score`,
    method: "POST",
    bearer: args.bearer,
    body: {
      targetId: args.targetId,
      platform: args.platform,
      body: args.body
    }
  });
}

export async function startDossierExport(args: {
  baseUrl: string;
  bearer: string;
  fetchClient: FetchClient;
  targetId: string;
  reason: string;
}): Promise<{ job_id: string; status: "queued" | "running" | "complete" | "failed" }> {
  return args.fetchClient<{ job_id: string; status: "queued" | "running" | "complete" | "failed" }>({
    url: `${args.baseUrl.replace(/\/+$/, "")}/v1/research/dossier-export`,
    method: "POST",
    bearer: args.bearer,
    body: {
      targetId: args.targetId,
      reason: args.reason
    }
  });
}

export async function getDossierExportStatus(args: {
  baseUrl: string;
  bearer: string;
  fetchClient: FetchClient;
  jobId: string;
}): Promise<{ job_id: string; status: "queued" | "running" | "complete" | "failed"; artifact_url?: string; error?: string }> {
  return args.fetchClient<{ job_id: string; status: "queued" | "running" | "complete" | "failed"; artifact_url?: string; error?: string }>({
    url: `${args.baseUrl.replace(/\/+$/, "")}/v1/research/dossier-export/${args.jobId}`,
    bearer: args.bearer
  });
}
