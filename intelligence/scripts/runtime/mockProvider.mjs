import { readJson } from "../../../tools/fs/read-json.mjs";

export function mockCall({ promptEntry }) {
  if (!promptEntry.golden) {
    throw new Error(`[mock] prompt ${promptEntry.id} has no golden; mock provider requires a golden`);
  }

  const output = readJson(promptEntry.golden);

  return {
    correlationId: "mock-correlation",
    responseCorrelationId: "mock-response",
    durationMs: "0",
    raw: JSON.stringify(output),
    attempts: 1
  };
}
