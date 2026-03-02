import { sha256String } from "../../../tools/crypto/sha256.mjs";

export function createJobId({ promptId, fixtureHash, promptSha, policyHash }) {
  const seed = JSON.stringify({
    promptId,
    fixtureHash,
    promptSha,
    policyHash: policyHash ?? null
  });

  return sha256String(seed).slice(0, 24);
}
