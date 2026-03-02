import { getOrcaEnv } from "./orcaEnv.mjs";
import { parseStrictJson } from "./strictJson.mjs";

function fail(msg) {
  console.error(`[orca:contract] ${msg}`);
  process.exit(1);
}

const env = getOrcaEnv();
const url = `${env.baseUrl}/v1/chat/completions`;

const res = await fetch(url, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    authorization: `Bearer ${env.token}`
  },
  body: JSON.stringify({
    model: env.model,
    temperature: 0,
    messages: [
      { role: "system", content: "Return ONLY JSON." },
      { role: "user", content: '{"ok":true}' }
    ]
  })
});

const raw = await res.text();
if (!res.ok) fail(`HTTP ${res.status}: ${raw.slice(0, 200)}`);

let parsed;
try {
  const obj = JSON.parse(raw);
  const content = obj?.choices?.[0]?.message?.content;
  if (typeof content === "string") {
    parsed = parseStrictJson(content);
  } else {
    parsed = parseStrictJson(raw);
  }
} catch {
  fail(`Unable to parse ORCA response into JSON-only content. First 200 chars: ${raw.slice(0, 200)}`);
}

if (parsed?.ok !== true) fail(`Contract failed, expected {ok:true}, got: ${JSON.stringify(parsed)}`);

console.log("[orca:contract] OK (OpenAI-compatible JSON-only response)");
