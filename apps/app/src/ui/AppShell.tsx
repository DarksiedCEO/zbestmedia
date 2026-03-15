import React from "react";
import { tokens } from "@zbest/ui";
import { Link, useLocation } from "react-router-dom";
import { useRuntime } from "../state/runtime";
import { FortressBanner } from "./FortressBanner";
import { TargetSelector } from "./TargetSelector";

export function AppShell({
  title,
  right,
  children,
}: {
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  const location = useLocation();
  const runtime = useRuntime();

  return (
    <div style={{ minHeight: "100vh", background: tokens.colors.bg, color: tokens.colors.text }}>
      <div style={{ display: "grid", gridTemplateColumns: "260px 1fr" }}>
        <aside
          style={{
            borderRight: `1px solid ${tokens.colors.border}`,
            background: tokens.colors.surface,
            padding: 18,
            position: "sticky",
            top: 0,
            height: "100vh",
          }}
        >
          <div style={{ fontWeight: 700, letterSpacing: 0.2 }}>Z Best Media</div>
          <div style={{ color: tokens.colors.muted, marginTop: 6, fontSize: 12 }}>Command Center</div>

          <nav style={{ marginTop: 18, display: "grid", gap: 10, fontSize: 14 }}>
            <NavLink to="/app/dashboard" label="Dashboard" active={location.pathname === "/app/dashboard"} />
            <NavLink to="/app/scheduler" label="Scheduler" active={location.pathname === "/app/scheduler"} />
            <NavLink to="/app/content" label="Content" active={location.pathname === "/app/content"} />
            <NavLink to="/app/research" label="Research" active={location.pathname === "/app/research"} />
            <NavLink to="/app/governance" label="Governance" active={location.pathname === "/app/governance"} />
            <DisabledLink label="Incidents" />
            <DisabledLink label="Audit" />
            <DisabledLink label="Ops" />
          </nav>

          <div
            style={{
              marginTop: 18,
              borderTop: `1px solid ${tokens.colors.border}`,
              paddingTop: 14,
              fontSize: 12,
              color: tokens.colors.muted,
            }}
          >
            Support:
            {" "}
            <a style={{ color: tokens.colors.text, textDecoration: "none" }} href="mailto:hello@zbestmedia.com">
              hello@zbestmedia.com
            </a>
            <div>
              <a style={{ color: tokens.colors.text, textDecoration: "none" }} href="tel:+12136328384">
                (213) 632-8384
              </a>
            </div>
          </div>
        </aside>

        <main style={{ padding: 22 }}>
          <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div style={{ fontSize: 18, fontWeight: 650 }}>{title}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <TargetSelector value={runtime.target} onChange={runtime.setTarget} />
              {right}
            </div>
          </header>

          <div style={{ marginTop: 14 }}>
            <FortressBanner
              integrityScore={runtime.integrityScore}
              autoBlock={runtime.autoBlock}
              freeze={runtime.freeze}
              killSwitch={runtime.killSwitch}
              flagsCount={runtime.flagsCount}
            />
            {runtime.errorMessage ? (
              <div style={{ marginTop: 8, fontSize: 12, color: "#E03131" }}>Status feed error: {runtime.errorMessage}</div>
            ) : null}
          </div>

          <div style={{ marginTop: 16 }}>{children}</div>
        </main>
      </div>
    </div>
  );
}

function NavLink({ to, label, active }: { to: string; label: string; active: boolean }) {
  return (
    <Link
      to={to}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "10px 12px",
        borderRadius: 14,
        border: `1px solid ${tokens.colors.border}`,
        background: active ? tokens.colors.panel : "transparent",
        color: tokens.colors.text,
        textDecoration: "none",
      }}
    >
      <span>{label}</span>
    </Link>
  );
}

function DisabledLink({ label }: { label: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "10px 12px",
        borderRadius: 14,
        border: `1px solid ${tokens.colors.border}`,
        background: tokens.colors.panel,
        color: tokens.colors.muted,
        opacity: 0.7,
      }}
      aria-disabled="true"
    >
      <span>{label}</span>
      <span style={{ fontSize: 12 }}>Soon</span>
    </div>
  );
}
