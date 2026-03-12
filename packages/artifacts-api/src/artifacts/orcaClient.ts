import type { AppEnv } from "../config/env";
import type { OrcaGenerationClient, OrcaGenerationResult } from "./generationOrchestrator";

type OrcaClientConfig = {
  baseUrl: string;
  token: string;
  model: string;
  timeoutMs: number;
};

function validateConfig(env: AppEnv): OrcaClientConfig {
  const runtimeEnv = env as AppEnv & {
    ORCA_ROUTER_URL?: string;
    ORCA_ROUTER_TOKEN?: string;
    ORCA_MODEL?: string;
    ORCA_TIMEOUT_MS?: number | string;
  };
  const baseUrl = String(runtimeEnv.ORCA_ROUTER_URL ?? process.env.ORCA_ROUTER_URL ?? "").trim().replace(/\/+$/, "");
  const token = String(runtimeEnv.ORCA_ROUTER_TOKEN ?? process.env.ORCA_ROUTER_TOKEN ?? "").trim();
  const model = String(runtimeEnv.ORCA_MODEL ?? process.env.ORCA_MODEL ?? "").trim();
  const timeoutMs = Number(runtimeEnv.ORCA_TIMEOUT_MS ?? process.env.ORCA_TIMEOUT_MS ?? 20000);

  if (!baseUrl) throw Object.assign(new Error("missing ORCA_ROUTER_URL"), { failureClass: "CONFIG_ERROR" });
  if (!token) throw Object.assign(new Error("missing ORCA_ROUTER_TOKEN"), { failureClass: "CONFIG_ERROR" });
  if (!model) throw Object.assign(new Error("missing ORCA_MODEL"), { failureClass: "CONFIG_ERROR" });
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1000) {
    throw Object.assign(new Error("invalid ORCA_TIMEOUT_MS"), { failureClass: "CONFIG_ERROR" });
  }
  if (!baseUrl.startsWith("http://") && !baseUrl.startsWith("https://")) {
    throw Object.assign(new Error("invalid ORCA_ROUTER_URL"), { failureClass: "CONFIG_ERROR" });
  }

  return { baseUrl, token, model, timeoutMs };
}

export function createOrcaGenerationClient(env: AppEnv): OrcaGenerationClient {
  return {
    async generate(args): Promise<OrcaGenerationResult> {
      const cfg = validateConfig(env);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), cfg.timeoutMs);
      const started = Date.now();
      try {
        const res = await fetch(`${cfg.baseUrl}/v1/chat/completions`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${cfg.token}`,
            "x-tenant-id": args.tenantId,
            "x-correlation-id": args.correlationId
          },
          body: JSON.stringify({
            model: (args.providerOverrides?.model as string | undefined) ?? cfg.model,
            temperature: 0,
            messages: [
              {
                role: "system",
                content:
                  "You are artifact generation runtime. Return JSON only that matches requested artifact output."
              },
              {
                role: "user",
                content: JSON.stringify({
                  artifactType: args.artifactType,
                  templateKey: args.templateKey ?? null,
                  workflowKey: args.workflowKey ?? null,
                  input: args.input
                })
              }
            ]
          }),
          signal: controller.signal
        });
        const raw = await res.text();
        if (!res.ok) {
          const failureClass =
            res.status === 401 || res.status === 403
              ? "AUTH_ERROR"
              : res.status >= 500
                ? "UPSTREAM_5XX"
                : "UPSTREAM_4XX";
          throw Object.assign(new Error(`ORCA HTTP ${res.status}: ${raw.slice(0, 200)}`), {
            failureClass,
            httpStatus: res.status
          });
        }

        let payload: unknown = null;
        try {
          payload = JSON.parse(raw);
        } catch {
          throw Object.assign(new Error("ORCA returned non-JSON envelope"), {
            failureClass: "INVALID_RESPONSE"
          });
        }

        const content = (payload as { choices?: Array<{ message?: { content?: string } }> })?.choices?.[0]?.message?.content;
        if (typeof content !== "string" || content.trim().length === 0) {
          throw Object.assign(new Error("ORCA response missing choices[0].message.content"), {
            failureClass: "INVALID_RESPONSE"
          });
        }

        return {
          id: String((payload as { id?: string }).id ?? `orca-${args.correlationId}`),
          provider: "orca",
          model: String((payload as { model?: string }).model ?? cfg.model),
          outputText: content,
          usage: ((payload as { usage?: Record<string, unknown> }).usage ?? null) as Record<string, unknown> | null,
          latencyMs: Date.now() - started,
          finishReason:
            ((payload as { choices?: Array<{ finish_reason?: string }> })?.choices?.[0]?.finish_reason as string | undefined) ?? null,
          warnings: [],
          responseCorrelationId: res.headers.get("x-correlation-id"),
          durationMsHeader: res.headers.get("x-duration-ms")
        };
      } catch (err) {
        if ((err as { name?: string }).name === "AbortError") {
          throw Object.assign(new Error("ORCA request timed out"), { failureClass: "TIMEOUT" });
        }
        if ((err as { failureClass?: string }).failureClass) {
          throw err;
        }
        throw Object.assign(new Error(`ORCA network error: ${(err as Error).message}`), { failureClass: "NETWORK_ERROR" });
      } finally {
        clearTimeout(timer);
      }
    }
  };
}
