import React from "react";
import { MetricTile, tokens } from "@zbest/ui";
import { AppShell } from "../ui/AppShell";
import { useRuntime } from "../state/runtime";

export default function DashboardPage() {
  const runtime = useRuntime();

  return (
    <AppShell title="Dashboard">
      {runtime.isLoading ? (
        <div style={{ color: tokens.colors.muted }}>Loading system status...</div>
      ) : runtime.isError ? (
        <div style={{ color: "#E03131" }}>Failed to load governance snapshot.</div>
      ) : (
        <div style={{ display: "grid", gap: 14 }}>
          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
            <MetricTile label="Integrity Score" value={`${runtime.integrityScore}`} accent />
            <MetricTile label="Ledger" value="Verified" />
            <MetricTile label="Contracts" value="Signed" />
            <MetricTile label="Canary" value="Active" />
          </div>

          <div
            style={{
              border: `1px solid ${tokens.colors.border}`,
              borderRadius: 14,
              background: tokens.colors.surface,
              padding: 14,
            }}
          >
            <div style={{ fontWeight: 650 }}>Today</div>
            <div style={{ marginTop: 6, color: tokens.colors.muted, fontSize: 13 }}>
              Aaliyah is now the primary founder console. Use the Aaliyah route for approvals, interruptions, queue actions, and session context.
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
