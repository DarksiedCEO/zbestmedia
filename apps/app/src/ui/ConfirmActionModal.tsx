import React from "react";
import { tokens } from "@zbest/ui";

export function ConfirmActionModal(props: {
  open: boolean;
  title: string;
  description: string;
  confirmText: string;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
  danger?: boolean;
}) {
  const [reason, setReason] = React.useState("");

  React.useEffect(() => {
    if (!props.open) {
      setReason("");
    }
  }, [props.open]);

  if (!props.open) {
    return null;
  }

  const canConfirm = reason.trim().length >= 8;

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 18,
        zIndex: 50,
      }}
    >
      <div
        style={{
          width: "min(560px, 100%)",
          borderRadius: 18,
          border: `1px solid ${tokens.colors.border}`,
          background: tokens.colors.panel,
          padding: 18,
        }}
      >
        <div style={{ fontSize: 16, fontWeight: 700 }}>{props.title}</div>
        <div style={{ marginTop: 6, color: tokens.colors.muted, fontSize: 13 }}>{props.description}</div>

        <label style={{ display: "block", marginTop: 14, fontSize: 12, color: tokens.colors.muted }}>
          Reason (required)
        </label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Explain why this action is necessary..."
          style={{
            marginTop: 6,
            width: "100%",
            minHeight: 90,
            borderRadius: 14,
            border: `1px solid ${tokens.colors.border}`,
            background: tokens.colors.surface,
            color: tokens.colors.text,
            padding: 12,
            outline: "none",
          }}
        />

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 14 }}>
          <button
            onClick={props.onCancel}
            style={{
              borderRadius: 14,
              border: `1px solid ${tokens.colors.border}`,
              background: "transparent",
              color: tokens.colors.text,
              padding: "10px 12px",
              cursor: "pointer",
            }}
          >
            Cancel
          </button>

          <button
            disabled={!canConfirm}
            onClick={() => props.onConfirm(reason.trim())}
            style={{
              borderRadius: 14,
              border: `1px solid ${tokens.colors.border}`,
              background: props.danger ? "#E03131" : tokens.colors.gold,
              color: props.danger ? "#ffffff" : tokens.colors.bg,
              padding: "10px 12px",
              cursor: canConfirm ? "pointer" : "not-allowed",
              opacity: canConfirm ? 1 : 0.6,
              fontWeight: 650,
            }}
          >
            {props.confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
