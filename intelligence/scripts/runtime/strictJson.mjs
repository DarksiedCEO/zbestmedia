export function parseStrictJson(raw) {
  const trimmed = raw.trim();

  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const candidate = fenceMatch ? fenceMatch[1].trim() : trimmed;

  try {
    return JSON.parse(candidate);
  } catch (e) {
    const err = new Error(`Model returned non-JSON output. First 200 chars: ${candidate.slice(0, 200)}`);
    err.cause = e;
    throw err;
  }
}
