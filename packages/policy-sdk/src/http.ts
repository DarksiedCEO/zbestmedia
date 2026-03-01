import { PolicySdkError, isRetryableNetworkCode, isRetryableStatus } from "./errors";

export type HttpClientOpts = {
  timeoutMs: number;
  headers: Record<string, string>;
};

export type HttpJsonResult<T> = {
  status: number;
  json: T | null;
  headers: Headers;
  etag?: string;
};

export async function httpPostJson<T>(
  url: string,
  body: unknown,
  opts: HttpClientOpts
): Promise<HttpJsonResult<T>> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), opts.timeoutMs);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...opts.headers },
      body: JSON.stringify(body),
      signal: controller.signal
    });

    const text = await res.text();
    let parsed: any = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = { raw: text };
    }

    if (!res.ok) {
      const code = parsed?.error?.code || parsed?.code || `HTTP_${res.status}`;
      throw new PolicySdkError(code, `Policy resolve failed (${res.status})`, {
        status: res.status,
        details: parsed
      });
    }

    return { status: res.status, json: parsed as T, headers: res.headers, etag: res.headers.get("etag") ?? undefined };
  } catch (e: any) {
    const code =
      e?.name === "AbortError"
        ? "TIMEOUT"
        : isRetryableNetworkCode(e?.code)
          ? e.code
          : "NETWORK_ERROR";
    throw new PolicySdkError(code, `Policy resolve network error: ${e?.message ?? "unknown"}`, {
      details: { original: { name: e?.name, code: e?.code, message: e?.message } }
    });
  } finally {
    clearTimeout(t);
  }
}

export async function httpGetJson<T>(url: string, opts: HttpClientOpts): Promise<HttpJsonResult<T>> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), opts.timeoutMs);

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: opts.headers,
      signal: controller.signal
    });

    if (res.status === 304) {
      return { status: 304, json: null, headers: res.headers, etag: res.headers.get("etag") ?? undefined };
    }

    const text = await res.text();
    let parsed: any = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = { raw: text };
    }

    if (!res.ok) {
      const code = parsed?.error?.code || parsed?.code || `HTTP_${res.status}`;
      throw new PolicySdkError(code, `Policy resolve failed (${res.status})`, {
        status: res.status,
        details: parsed
      });
    }

    return { status: res.status, json: parsed as T, headers: res.headers, etag: res.headers.get("etag") ?? undefined };
  } catch (e: any) {
    const code =
      e?.name === "AbortError"
        ? "TIMEOUT"
        : isRetryableNetworkCode(e?.code)
          ? e.code
          : "NETWORK_ERROR";
    throw new PolicySdkError(code, `Policy resolve network error: ${e?.message ?? "unknown"}`, {
      details: { original: { name: e?.name, code: e?.code, message: e?.message } }
    });
  } finally {
    clearTimeout(t);
  }
}

export function shouldRetry(err: unknown): boolean {
  if (err && typeof err === "object" && "status" in err) {
    const status = (err as any).status as number | undefined;
    if (status != null) return isRetryableStatus(status);
  }
  if (err && typeof err === "object" && "code" in err) {
    const code = (err as any).code as string | undefined;
    if (code != null) return isRetryableNetworkCode(code) || code === "TIMEOUT";
  }
  return false;
}
