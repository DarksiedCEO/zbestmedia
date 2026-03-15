import React from "react";
import { tokens } from "@zbest/ui";

export function FortressBanner({
  integrityScore,
  autoBlock,
  freeze,
  killSwitch,
  flagsCount,
}: {
  integrityScore: number;
  autoBlock: boolean;
  freeze: boolean;
  killSwitch: boolean;
  flagsCount: number;
}) {
  const tone = killSwitch || autoBlock ? "bad" : integrityScore < 90 || flagsCount > 0 ? "warn" : "ok";
  const color = tone === "bad" ? "#E03131" : tone === "warn" ? "#F08C00" : "#2F9E44";
  const label = killSwitch
    ? "Kill Switch Active"
    : autoBlock
      ? "Integrity Auto-Block Active"
      : integrityScore < 90
        ? "Integrity Degraded"
        : "Operational";

  return (
    <div
      style={{
        border: `1px solid ${tokens.colors.border}`,
        borderRadius: 14,
        padding: "10px 12px",
        background: tokens.colors.surface,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
        flexWrap: "wrap",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span aria-hidden style={{ width: 10, height: 10, borderRadius: 999, background: color }} />
        <span style={{ fontSize: 13 }}>{label}</span>
        <span style={{ fontSize: 12, color: tokens.colors.muted }}>
          Integrity <span style={{ color: tokens.colors.gold, fontWeight: 650 }}>{integrityScore}</span> | Flags {flagsCount}
        </span>
      </div>
      <div style={{ fontSize: 12, color: tokens.colors.muted }}>
        {freeze ? "Freeze: ON" : "Freeze: off"} | {killSwitch ? "Kill: ON" : "Kill: off"}
      </div>
    </div>
  );
}
