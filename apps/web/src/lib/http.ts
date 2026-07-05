import { getEnv } from "./env";

export class HttpError extends Error {
  status: number;
  payload?: unknown;

  constructor(status: number, message: string, payload?: unknown) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.payload = payload;
  }
}

export type HttpOptions = Omit<RequestInit, "body"> & {
  body?: unknown;
  token?: string | null;
};

const { apiBaseUrl, tenantId, authToken } = getEnv();

export async function http<T>(path: string, options: HttpOptions = {}): Promise<T> {
  const normalizedBase = apiBaseUrl.endsWith("/") ? apiBaseUrl.slice(0, -1) : apiBaseUrl;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const url = `${normalizedBase}${normalizedPath}`;

  const headers = new Headers(options.headers);
  if (!headers.has("Content-Type") && options.body !== undefined) {
    headers.set("Content-Type", "application/json");
  }
  // Per-call token wins; otherwise fall back to the configured service token
  // so calls to the secured brandgraph carry a bearer token by default
  // instead of guaranteed 401s.
  const bearer = options.token ?? authToken;
  if (bearer) {
    headers.set("Authorization", `Bearer ${bearer}`);
  }
  if (tenantId) {
    headers.set("x-tenant-id", tenantId);
  }

  const response = await fetch(url, {
    ...options,
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined
  });

  const text = await response.text();
  const payload = text ? safeJsonParse(text) : null;

  if (!response.ok) {
    const message = typeof payload === "object" && payload && "message" in payload
      ? String((payload as { message?: string }).message)
      : response.statusText;
    throw new HttpError(response.status, message, payload ?? text);
  }

  return payload as T;
}

function safeJsonParse(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}
