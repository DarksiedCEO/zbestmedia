import React from "react";
import { tokens } from "@zbest/ui";

export const DEFAULT_TARGETS = ["prod/us-west/policy", "prod/us-east/policy", "staging/policy"] as const;

export function TargetSelector({
  value,
  onChange,
}: {
  value: string;
  onChange: (target: string) => void;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{ fontSize: 12, color: tokens.colors.muted }}>Target</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          borderRadius: 14,
          border: `1px solid ${tokens.colors.border}`,
          background: tokens.colors.surface,
          color: tokens.colors.text,
          padding: "8px 10px",
          cursor: "pointer",
        }}
      >
        {DEFAULT_TARGETS.map((target) => (
          <option key={target} value={target}>
            {target}
          </option>
        ))}
      </select>
    </div>
  );
}
