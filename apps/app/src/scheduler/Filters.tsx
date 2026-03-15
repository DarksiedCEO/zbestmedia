import React from "react";
import { tokens } from "@zbest/ui";
import type { Platform } from "./types";

const PLATFORMS: Array<{ label: string; value: Platform | "all" }> = [
  { label: "All", value: "all" },
  { label: "X", value: "x" },
  { label: "LinkedIn", value: "linkedin" },
  { label: "Instagram", value: "instagram" },
  { label: "Facebook", value: "facebook" },
  { label: "TikTok", value: "tiktok" },
  { label: "YouTube", value: "youtube" },
];

const STATUSES = ["all", "draft", "pending_approval", "scheduled", "posted", "failed"] as const;

export type SchedulerFilters = {
  platform: Platform | "all";
  status: (typeof STATUSES)[number];
  view: "month" | "week" | "day";
};

export function Filters({
  value,
  onChange,
}: {
  value: SchedulerFilters;
  onChange: (value: SchedulerFilters) => void;
}) {
  return (
    <div
      style={{
        border: `1px solid ${tokens.colors.border}`,
        borderRadius: 14,
        background: tokens.colors.surface,
        padding: 12,
        display: "flex",
        gap: 10,
        flexWrap: "wrap",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 12, color: tokens.colors.muted }}>View</span>
          <Select
            value={value.view}
            onChange={(next) => onChange({ ...value, view: next as SchedulerFilters["view"] })}
            options={[
              ["month", "Month"],
              ["week", "Week"],
              ["day", "Day"],
            ]}
          />
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 12, color: tokens.colors.muted }}>Platform</span>
          <Select
            value={value.platform}
            onChange={(next) => onChange({ ...value, platform: next as SchedulerFilters["platform"] })}
            options={PLATFORMS.map((platform) => [platform.value, platform.label])}
          />
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 12, color: tokens.colors.muted }}>Status</span>
          <Select
            value={value.status}
            onChange={(next) => onChange({ ...value, status: next as SchedulerFilters["status"] })}
            options={STATUSES.map((status) => [status, status === "all" ? "All" : status.replace("_", " ")])}
          />
        </div>
      </div>

      <div style={{ fontSize: 12, color: tokens.colors.muted }}>Mutations require reason | Target-scoped persistence</div>
    </div>
  );
}

function Select({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: Array<[string, string]>;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        borderRadius: 14,
        border: `1px solid ${tokens.colors.border}`,
        background: tokens.colors.panel,
        color: tokens.colors.text,
        padding: "8px 10px",
        cursor: "pointer",
      }}
    >
      {options.map(([valueItem, label]) => (
        <option key={valueItem} value={valueItem}>
          {label}
        </option>
      ))}
    </select>
  );
}
