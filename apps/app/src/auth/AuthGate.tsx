import React from "react";
import { tokens } from "@zbest/ui";

const SESSION_KEY = "zbest.auth.ok";
const AUTH_BYPASS_PATHS = ["/oauth/google/callback"];

export function AuthGate({ children }: { children: React.ReactNode }) {
  const requiredCode = String(import.meta.env.VITE_APP_ACCESS_CODE ?? "").trim();
  const isProd = Boolean(import.meta.env.PROD);
  const pathname = typeof window === "undefined" ? "" : window.location.pathname;
  const bypassAuth = AUTH_BYPASS_PATHS.some((path) => pathname.startsWith(path));
  const [input, setInput] = React.useState("");
  const [authorized, setAuthorized] = React.useState<boolean>(() => {
    if (typeof window === "undefined") {
      return false;
    }
    return sessionStorage.getItem(SESSION_KEY) === "1";
  });

  if (!requiredCode) {
    if (isProd) {
      return (
        <BlockedGate message="Access gate is required in production. Set VITE_APP_ACCESS_CODE." />
      );
    }
    return <>{children}</>;
  }

  if (bypassAuth) {
    return <>{children}</>;
  }

  if (authorized) {
    return <>{children}</>;
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: tokens.colors.bg,
        color: tokens.colors.text,
        display: "grid",
        placeItems: "center",
        padding: 24,
      }}
    >
      <div
        style={{
          width: "min(460px, 100%)",
          border: `1px solid ${tokens.colors.border}`,
          background: tokens.colors.panel,
          borderRadius: 18,
          padding: 18,
        }}
      >
        <h1 style={{ margin: 0, fontSize: 20 }}>Command Center Access</h1>
        <p style={{ marginTop: 8, color: tokens.colors.muted, fontSize: 13 }}>
          Enter the access code to continue.
        </p>
        <input
          type="password"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Access code"
          style={{
            width: "100%",
            marginTop: 10,
            borderRadius: 14,
            border: `1px solid ${tokens.colors.border}`,
            background: tokens.colors.surface,
            color: tokens.colors.text,
            padding: "10px 12px",
            outline: "none",
          }}
        />
        <button
          onClick={() => {
            if (input === requiredCode) {
              sessionStorage.setItem(SESSION_KEY, "1");
              setAuthorized(true);
            }
          }}
          style={{
            marginTop: 10,
            borderRadius: 14,
            border: `1px solid ${tokens.colors.border}`,
            background: tokens.colors.gold,
            color: tokens.colors.bg,
            padding: "10px 12px",
            fontWeight: 650,
            cursor: "pointer",
          }}
        >
          Unlock
        </button>
      </div>
    </div>
  );
}

function BlockedGate({ message }: { message: string }) {
  return (
    <div style={{ minHeight: "100vh", background: "#0B0B0D", color: "#F5F5F7", padding: 24 }}>
      <div style={{ maxWidth: 640, border: "1px solid #24242B", borderRadius: 14, padding: 16, background: "#17171C" }}>
        <div style={{ fontWeight: 700 }}>Access blocked</div>
        <div style={{ marginTop: 8, color: "#9A9AA3", fontSize: 13 }}>{message}</div>
      </div>
    </div>
  );
}
