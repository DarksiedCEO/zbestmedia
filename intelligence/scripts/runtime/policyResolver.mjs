import { readJson } from "../../../tools/fs/read-json.mjs";
import { sha256String } from "../../../tools/crypto/sha256.mjs";

function fail(msg) {
  console.error(`[policy] ${msg}`);
  process.exit(1);
}

export function loadAllPolicies() {
  const core = readJson("intelligence/policies/core.v1.json");
  const general = readJson("intelligence/policies/verticals/general.v1.json");
  const legal = readJson("intelligence/policies/verticals/legal-attorney.v1.json");

  const map = new Map();
  for (const p of [core, general, legal]) {
    if (!p?.id) fail("policy missing id");
    map.set(p.id, p);
  }

  return map;
}

export function resolvePolicy(policyPackId) {
  const policies = loadAllPolicies();
  const resolving = new Set();

  function merge(base, add) {
    return {
      id: add.id,
      inherits: add.inherits ?? [],
      rules: { ...(base.rules ?? {}), ...(add.rules ?? {}) },
      bannedPatterns: [...(base.bannedPatterns ?? []), ...(add.bannedPatterns ?? [])],
      recommendedStyle: { ...(base.recommendedStyle ?? {}), ...(add.recommendedStyle ?? {}) }
    };
  }

  function walk(id) {
    if (resolving.has(id)) fail(`circular policy inheritance detected at ${id}`);

    const p = policies.get(id);
    if (!p) fail(`unknown policyPackId: ${id}`);

    resolving.add(id);

    let acc = { rules: {}, bannedPatterns: [], recommendedStyle: {} };
    for (const parent of p.inherits ?? []) {
      acc = merge(acc, walk(parent));
    }

    acc = merge(acc, p);
    resolving.delete(id);
    return acc;
  }

  const resolved = walk(policyPackId);
  const resolvedPolicyHash = sha256String(JSON.stringify(resolved));
  return { resolved, resolvedPolicyHash };
}
