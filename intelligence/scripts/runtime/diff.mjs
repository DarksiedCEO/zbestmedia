function asSet(arr) {
  return new Set(Array.isArray(arr) ? arr : []);
}

export function diffScore(actual, golden, maxDelta) {
  const da = Math.abs((actual?.score ?? 0) - (golden?.score ?? 0));
  return { delta: da, ok: da <= maxDelta };
}

export function diffSignalKeys(actual, golden) {
  const aKeys = asSet((actual?.signals ?? []).map((s) => s.key));
  const gKeys = asSet((golden?.signals ?? []).map((s) => s.key));

  const missing = [...gKeys].filter((k) => !aKeys.has(k));
  return { missing, ok: missing.length === 0 };
}

export function diffCounts(actual, golden) {
  const aw = (actual?.warnings ?? []).length;
  const gw = (golden?.warnings ?? []).length;
  const ar = (actual?.recommendations ?? []).length;
  const gr = (golden?.recommendations ?? []).length;
  const af = (actual?.flags ?? []).length;
  const gf = (golden?.flags ?? []).length;

  return {
    warningsDelta: aw - gw,
    recsDelta: ar - gr,
    flagsDelta: af - gf
  };
}

export function diffRequiredKeys(actual, golden) {
  const aKeys = Object.keys(actual ?? {});
  const gKeys = Object.keys(golden ?? {});
  const missing = gKeys.filter((k) => !aKeys.includes(k));
  return { missing, ok: missing.length === 0 };
}

export function diffRiskCodes(actual, golden) {
  const aCodes = asSet((actual?.flags ?? []).map((f) => f.riskCode));
  const gCodes = asSet((golden?.flags ?? []).map((f) => f.riskCode));
  const missing = [...gCodes].filter((c) => !aCodes.has(c));
  return { missing, ok: missing.length === 0 };
}

export function validateSeverities(actual) {
  const allowed = new Set(["low", "medium", "high"]);
  const invalid = (actual?.flags ?? [])
    .map((f, i) => ({ idx: i, severity: f?.severity }))
    .filter((x) => !allowed.has(x.severity));
  return { invalid, ok: invalid.length === 0 };
}

export function evaluateDrift(mode, actual, golden, policy = {}) {
  const counts = diffCounts(actual, golden);

  if (mode === "score") {
    const score = diffScore(actual, golden, policy.maxScoreDelta ?? 10);
    const signalKeys = diffSignalKeys(actual, golden);
    const warningsOk = counts.warningsDelta <= (policy.maxWarningsIncrease ?? 3);
    const ok = score.ok && signalKeys.ok && warningsOk;
    return { ok, mode, score, signalKeys, counts, policy };
  }

  if (mode === "taxonomy") {
    const riskCodes = diffRiskCodes(actual, golden);
    const severities = validateSeverities(actual);
    const flagsOk = counts.flagsDelta <= (policy.maxFlagsIncrease ?? 3);
    const ok = riskCodes.ok && severities.ok && flagsOk;
    return { ok, mode, riskCodes, severities, counts, policy };
  }

  const requiredKeys = diffRequiredKeys(actual, golden);
  const warningsOk = counts.warningsDelta <= (policy.maxWarningsIncrease ?? 3);
  const ok = requiredKeys.ok && warningsOk;
  return { ok, mode: "structure", requiredKeys, counts, policy };
}
