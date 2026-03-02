import { randomUUID } from "node:crypto";
import { getOrcaEnv } from "./orcaEnv.mjs";
import { getProvider } from "./provider.mjs";
import { mockCall } from "./mockProvider.mjs";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function jitter(baseMs) {
  const range = Math.max(50, Math.floor(baseMs * 0.4));
  return baseMs + Math.floor(Math.random() * range);
}

function isRetryStatus(status) {
  return status === 429 || status === 502 || status === 503 || status === 504;
}

function isRetryError(err) {
  const name = err?.name;
  const code = err?.code;
  return name === "AbortError" || code === "ECONNRESET" || code === "ENOTFOUND" || code === "ETIMEDOUT";
}

export async function callOrca({ promptEntry, promptText, inputJson }) {
  const provider = getProvider();
  if (provider === "mock") {
    return mockCall({ promptEntry });
  }

  const env = getOrcaEnv();
  const correlationId = randomUUID();
  const url = `${env.baseUrl}/v1/chat/completions`;

  const body = {
    model: env.model,
    temperature: 0,
    messages: [
      { role: "system", content: `You are executing prompt ${promptEntry.id}. Return ONLY valid JSON.` },
      { role: "user", content: promptText.replace("{{input_json}}", JSON.stringify(inputJson)) }
    ]
  };

  let attempt = 0;
  let lastError = null;

  while (attempt <= env.retryMax) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), env.timeoutMs);

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${env.token}`,
          "x-correlation-id": correlationId
        },
        body: JSON.stringify(body),
        signal: controller.signal
      });

      clearTimeout(timeout);

      const durationMs = res.headers.get("x-duration-ms") ?? null;
      const responseCorrelationId = res.headers.get("x-correlation-id") ?? null;
      const rawBody = await res.text();

      if (!res.ok) {
        if (isRetryStatus(res.status) && attempt < env.retryMax) {
          attempt += 1;
          await sleep(jitter(env.retryBaseMs * attempt));
          continue;
        }
        const err = new Error(`[orca] HTTP ${res.status} ${rawBody.slice(0, 500)}`);
        err.status = res.status;
        throw err;
      }

      let raw = rawBody;
      try {
        const payload = JSON.parse(rawBody);
        const content = payload?.choices?.[0]?.message?.content;
        if (typeof content === "string" && content.trim().length > 0) {
          raw = content;
        }
      } catch {
        // Keep raw text; strictJson parser decides validity.
      }

      return {
        correlationId,
        responseCorrelationId,
        durationMs,
        raw,
        attempts: attempt + 1
      };
    } catch (err) {
      clearTimeout(timeout);
      lastError = err;

      if (isRetryError(err) && attempt < env.retryMax) {
        attempt += 1;
        await sleep(jitter(env.retryBaseMs * attempt));
        continue;
      }

      throw err;
    }
  }

  throw lastError ?? new Error("[orca] unknown failure");
}
