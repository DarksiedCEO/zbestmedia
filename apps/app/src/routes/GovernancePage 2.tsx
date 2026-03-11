import React from "react";
import { useQuery } from "@tanstack/react-query";
import { createFetchClient, fetchGovernanceSnapshot, readApiEnv } from "@zbest/api-sdk";
import { MetricTile, StatusBadge, tokens } from "@zbest/ui";

function correlationId() {
  return crypto.randomUUID();
}

export default function GovernancePage() {
  const env = React.useMemo(() => readApiEnv(import.meta.env as Record<string, unknown>), []);
  const fc = React.useMemo(() => createFetchClient({ correlationId }), []);

  const q = useQuery({
    queryKey: ["governance-snapshot"],
    queryFn: () =>
      fetchGovernanceSnapshot({
        baseUrl: env.VITE_POLICY_BASE_URL,
        bearer: env.VITE_POLICY_BEARER,
        introspectionToken: env.VITE_POLICY_INTROSPECTION_TOKEN,
        fetchClient: fc,
      }),
    refetchInterval: 15_000,
  });

  const bg = tokens.colors.bg;

  if (q.isLoading) {
    return (
      <div style={{ padding: 24, background: bg, color: tokens.colors.text }}>
        Loading...
      </div>
    );
  }
  if (q.isError) {
    return (
      <div style={{ padding: 24, background: bg, color: tokens.colors.text }}>
        Error: {(q.error as Error).message}
      </div>
    );
  }

  const s = q.data;
  if (!s) {
    return (
      <div style={{ padding: 24, background: bg, color: tokens.colors.text }}>
        No governance snapshot available.
      </div>
    );
  }

  const passed = (s.last_self_check_passed ?? true) && s.integrity_score >= 90 && !s.auto_block_active;
  const tone: "ok" | "warn" | "bad" = passed ? "ok" : s.auto_block_active ? "bad" : "warn";

  return (
    <div style={{ minHeight: "100vh", background: bg, color: tokens.colors.text, padding: 24 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <h1 style={{ margin: 0, fontSize: 22 }}>Governance</h1>
        <StatusBadge
          tone={tone}
          label={passed ? "Operational" : s.auto_block_active ? "Auto-Block Active" : "Degraded"}
        />
      </div>

      <div
        style={{
          marginTop: 18,
          display: "grid",
          gap: 12,
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
        }}
      >
        <MetricTile label="Integrity Score" value={`${s.integrity_score}`} accent />
        <MetricTile label="Governance Fingerprint" value={`${s.governance_fingerprint.slice(0, 18)}...`} />
        <MetricTile label="Defaults Hash" value={`${s.runtime.defaults_hash.slice(0, 18)}...`} />
        <MetricTile label="Enforcement Mode" value={s.runtime.enforcement_mode} />
      </div>

      <div style={{ marginTop: 18, color: tokens.colors.muted, fontSize: 12 }}>
        Auto-block:
        <span style={{ color: s.auto_block_active ? tokens.colors.gold : tokens.colors.muted }}>
          {` ${String(s.auto_block_active)}`}
        </span>
        {" \u00b7 "}
        Last self-check: {s.last_self_check_ts ?? "unknown"}
        {" \u00b7 "}
        Flags: {s.integrity_flags.length}
      </div>

      <div style={{ marginTop: 18 }}>
        <pre
          style={{
            background: tokens.colors.surface,
            border: `1px solid ${tokens.colors.border}`,
            padding: 16,
            borderRadius: 14,
            overflow: "auto",
          }}
        >
          {JSON.stringify(s, null, 2)}
        </pre>
      </div>
    </div>
  );
}
