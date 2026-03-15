import React from "react";
import { MetricTile, StatusBadge, tokens } from "@zbest/ui";
import { AppShell } from "../ui/AppShell";
import { useRuntime } from "../state/runtime";

export default function GovernancePage() {
  const runtime = useRuntime();
  const [showJson, setShowJson] = React.useState(false);

  if (runtime.isLoading) {
    return (
      <AppShell title="Governance">
        <div style={{ color: tokens.colors.muted }}>Loading governance snapshot...</div>
      </AppShell>
    );
  }

  if (runtime.isError || !runtime.snapshot) {
    return (
      <AppShell title="Governance">
        <div style={{ color: "#E03131" }}>Failed to load governance snapshot.</div>
      </AppShell>
    );
  }

  const snapshot = runtime.snapshot;
  const passed = (snapshot.last_self_check_passed ?? true) && snapshot.integrity_score >= 90 && !snapshot.auto_block_active;
  const tone: "ok" | "warn" | "bad" = passed ? "ok" : snapshot.auto_block_active ? "bad" : "warn";

  return (
    <AppShell
      title="Governance"
      right={
        <button
          onClick={() => setShowJson((prev) => !prev)}
          style={{
            borderRadius: 14,
            border: `1px solid ${tokens.colors.border}`,
            background: "transparent",
            color: tokens.colors.text,
            padding: "8px 12px",
            cursor: "pointer",
          }}
        >
          {showJson ? "Hide JSON" : "View JSON"}
        </button>
      }
    >
      <div style={{ display: "grid", gap: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Runtime Posture</h2>
          <StatusBadge
            tone={tone}
            label={passed ? "Operational" : snapshot.auto_block_active ? "Auto-Block Active" : "Degraded"}
          />
        </div>

        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
          <MetricTile label="Integrity Score" value={`${snapshot.integrity_score}`} accent />
          <MetricTile label="Governance Fingerprint" value={`${snapshot.governance_fingerprint.slice(0, 18)}...`} />
          <MetricTile label="Defaults Hash" value={`${snapshot.runtime.defaults_hash.slice(0, 18)}...`} />
          <MetricTile label="Enforcement Mode" value={snapshot.runtime.enforcement_mode} />
        </div>

        <div style={{ color: tokens.colors.muted, fontSize: 12 }}>
          Auto-block:
          <span style={{ color: snapshot.auto_block_active ? tokens.colors.gold : tokens.colors.muted }}>
            {` ${String(snapshot.auto_block_active)}`}
          </span>
          {" | "}
          Last self-check: {snapshot.last_self_check_ts ?? "unknown"}
          {" | "}
          Flags: {snapshot.integrity_flags.length}
        </div>

        {showJson ? (
          <pre
            style={{
              background: tokens.colors.surface,
              border: `1px solid ${tokens.colors.border}`,
              padding: 16,
              borderRadius: 14,
              overflow: "auto",
            }}
          >
            {JSON.stringify(snapshot, null, 2)}
          </pre>
        ) : null}
      </div>
    </AppShell>
  );
}
