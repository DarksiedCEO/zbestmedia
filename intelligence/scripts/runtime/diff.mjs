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

  return {
    warningsDelta: aw - gw,
    recsDelta: ar - gr
  };
}
