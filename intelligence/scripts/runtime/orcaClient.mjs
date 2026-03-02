import { randomUUID } from "node:crypto";

function reqEnv(key) {
  const v = process.env[key];
  if (!v) {
    console.error(`[orca] Missing required env ${key}`);
    process.exit(1);
  }
  return v;
}

export async function callOrca({ promptId, promptText, inputJson }) {
  const baseUrl = reqEnv("ORCA_ROUTER_URL").replace(/\/+$/, "");
  const token = reqEnv("ORCA_ROUTER_TOKEN");
  const model = process.env.ORCA_MODEL ?? "orca-default";

  const correlationId = randomUUID();

  const res = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
      "x-correlation-id": correlationId
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      messages: [
        { role: "system", content: `You are executing prompt ${promptId}. Return ONLY valid JSON.` },
        { role: "user", content: promptText.replace("{{input_json}}", JSON.stringify(inputJson)) }
      ]
    })
  });

  const durationMs = res.headers.get("x-duration-ms") ?? null;
  const responseCorrelationId = res.headers.get("x-correlation-id") ?? null;

  const payload = await res.json().catch(async () => ({ __raw: await res.text().catch(() => "") }));
  if (!res.ok) {
    throw new Error(`[orca] HTTP ${res.status} ${JSON.stringify(payload)}`);
  }

  const raw = payload?.choices?.[0]?.message?.content;
  if (typeof raw !== "string" || raw.trim().length === 0) {
    throw new Error("[orca] Missing assistant content in response payload");
  }

  return {
    correlationId,
    responseCorrelationId,
    durationMs,
    raw
  };
}
