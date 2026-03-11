import React from "react";

export const tokens = {
  colors: {
    bg: "#0b1020",
    panel: "#111936",
    surface: "#16203f",
    text: "#f5f7ff",
    muted: "#96a0c8",
    border: "#2b3763",
    gold: "#d7b66f"
  }
} as const;

export const fortressStates = {
  selected: {
    borderColor: tokens.colors.gold,
    boxShadow: `0 0 0 1px ${tokens.colors.gold} inset`
  }
} as const;

export function MetricTile({
  label,
  value,
  accent = false
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div
      style={{
        border: `1px solid ${accent ? tokens.colors.gold : tokens.colors.border}`,
        borderRadius: 14,
        background: tokens.colors.panel,
        padding: 14
      }}
    >
      <div style={{ fontSize: 12, color: tokens.colors.muted }}>{label}</div>
      <div style={{ marginTop: 8, fontSize: 20, fontWeight: 700, color: accent ? tokens.colors.gold : tokens.colors.text }}>
        {value}
      </div>
    </div>
  );
}

export function StatusBadge({
  tone,
  label
}: {
  tone: "ok" | "warn" | "bad";
  label: string;
}) {
  const color =
    tone === "ok" ? "#2f9e44" : tone === "warn" ? tokens.colors.gold : "#e03131";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        borderRadius: 999,
        border: `1px solid ${color}`,
        color,
        padding: "6px 10px",
        fontSize: 12,
        fontWeight: 700
      }}
    >
      {label}
    </span>
  );
}
