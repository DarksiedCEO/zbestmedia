import React from "react";
import { tokens } from "@zbest/ui";

export function BatchBar({
  selectedCount,
  onClear,
  onApprove,
  onMarkPending,
  onReschedule,
  onDelete,
}: {
  selectedCount: number;
  onClear: () => void;
  onApprove: () => void;
  onMarkPending: () => void;
  onReschedule: (deltaMinutes: number) => void;
  onDelete: () => void;
}) {
  if (selectedCount === 0) {
    return null;
  }

  return (
    <div
      style={{
        border: `1px solid ${tokens.colors.border}`,
        borderRadius: 14,
        background: tokens.colors.surface,
        padding: 12,
        display: "flex",
        justifyContent: "space-between",
        gap: 10,
        flexWrap: "wrap",
        alignItems: "center",
      }}
    >
      <div style={{ fontSize: 13 }}>
        Selected: <span style={{ color: tokens.colors.gold, fontWeight: 650 }}>{selectedCount}</span>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Btn onClick={onApprove}>Approve</Btn>
        <Btn onClick={onMarkPending}>Mark Pending</Btn>
        <Btn onClick={() => onReschedule(60)}>+1h</Btn>
        <Btn onClick={() => onReschedule(24 * 60)}>+1d</Btn>
        <Btn danger onClick={onDelete}>
          Delete
        </Btn>
        <Btn subtle onClick={onClear}>
          Clear
        </Btn>
      </div>
    </div>
  );
}

function Btn({
  children,
  onClick,
  danger,
  subtle,
}: {
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
  subtle?: boolean;
}) {
  const bg = danger ? "#E03131" : subtle ? "transparent" : tokens.colors.panel;
  const color = danger ? "#ffffff" : tokens.colors.text;

  return (
    <button
      onClick={onClick}
      style={{
        borderRadius: 14,
        border: `1px solid ${tokens.colors.border}`,
        background: bg,
        color,
        padding: "8px 10px",
        cursor: "pointer",
        fontSize: 12,
        fontWeight: 650,
      }}
    >
      {children}
    </button>
  );
}
