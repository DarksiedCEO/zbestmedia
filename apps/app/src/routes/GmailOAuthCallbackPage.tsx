import React from "react";
import { Link } from "react-router-dom";
import { createFetchClient, readApiEnv, resolveAppApiBaseUrl } from "@zbest/api-sdk";
import { tokens } from "@zbest/ui";

type CallbackState =
  | { status: "working"; message: string }
  | { status: "success"; message: string; accountEmailAddress: string | null; grantedScopes: string[] }
  | { status: "error"; message: string };

function correlationId() {
  return crypto.randomUUID();
}

function buildAttemptKey(code: string, oauthState: string) {
  return `gmail-oauth-callback:${oauthState}:${code}`;
}

export default function GmailOAuthCallbackPage() {
  const fetchClient = React.useMemo(() => createFetchClient({ correlationId }), []);
  const [state, setState] = React.useState<CallbackState>({
    status: "working",
    message: "Completing Gmail connection…",
  });

  React.useEffect(() => {
    const envResult = (() => {
      try {
        return {
          env: readApiEnv(import.meta.env as Record<string, unknown>),
          baseUrl: resolveAppApiBaseUrl(import.meta.env as Record<string, unknown>),
        };
      } catch (error) {
        return {
          env: null,
          baseUrl: null,
          error: error instanceof Error ? error.message : "App API environment is not configured.",
        };
      }
    })();

    if (!envResult.env || !envResult.baseUrl) {
      setState({
        status: "error",
        message: envResult.error ?? "App API environment is not configured.",
      });
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const oauthState = params.get("state");
    const oauthError = params.get("error");
    const oauthErrorDescription = params.get("error_description");

    if (oauthError) {
      setState({
        status: "error",
        message: oauthErrorDescription ? `${oauthError}: ${oauthErrorDescription}` : oauthError,
      });
      return;
    }

    if (!code || !oauthState) {
      setState({
        status: "error",
        message: "Missing OAuth code or state in the callback URL.",
      });
      return;
    }

    const attemptKey = buildAttemptKey(code, oauthState);
    if (window.sessionStorage.getItem(attemptKey) === "done") {
      setState({
        status: "success",
        message: "Gmail account connected successfully.",
        accountEmailAddress: null,
        grantedScopes: [],
      });
      return;
    }

    let cancelled = false;

    void fetchClient<{
      resourceType: "gmail_oauth_callback";
      account: {
        accountEmailAddress: string | null;
        grantedScopes: string[];
      };
    }>({
      url: `${envResult.baseUrl.replace(/\/+$/, "")}/v1/agent-os/email/accounts/gmail/oauth/callback`,
      method: "POST",
      bearer: envResult.env.VITE_POLICY_BEARER,
      body: {
        code,
        state: oauthState,
      },
    })
      .then((response) => {
        if (cancelled) {
          return;
        }
        window.sessionStorage.setItem(attemptKey, "done");
        setState({
          status: "success",
          message: "Gmail account connected successfully.",
          accountEmailAddress: response.account.accountEmailAddress,
          grantedScopes: response.account.grantedScopes,
        });
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        setState({
          status: "error",
          message: error instanceof Error ? error.message : "Failed to complete Gmail OAuth callback.",
        });
      });

    return () => {
      cancelled = true;
    };
  }, [fetchClient]);

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
          width: "min(560px, 100%)",
          border: `1px solid ${tokens.colors.border}`,
          background: tokens.colors.panel,
          borderRadius: 18,
          padding: 20,
          boxShadow: "0 18px 50px rgba(0,0,0,0.24)",
        }}
      >
        <div style={{ fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase", color: tokens.colors.muted }}>
          Gmail OAuth
        </div>
        <h1 style={{ marginTop: 10, marginBottom: 8, fontSize: 28, lineHeight: 1.1 }}>
          {state.status === "success" ? "Connection complete" : state.status === "error" ? "Connection failed" : "Connecting Gmail"}
        </h1>
        <p style={{ margin: 0, color: tokens.colors.muted, fontSize: 14 }}>{state.message}</p>

        {state.status === "success" ? (
          <div
            style={{
              marginTop: 18,
              borderRadius: 14,
              border: `1px solid ${tokens.colors.border}`,
              background: tokens.colors.surface,
              padding: 14,
            }}
          >
            <div style={{ fontSize: 13, color: tokens.colors.muted }}>Connected account</div>
            <div style={{ marginTop: 6, fontWeight: 650 }}>{state.accountEmailAddress ?? "Unknown account"}</div>
            <div style={{ marginTop: 12, fontSize: 13, color: tokens.colors.muted }}>Granted scopes</div>
            <ul style={{ marginTop: 8, marginBottom: 0, paddingLeft: 18 }}>
              {state.grantedScopes.map((scope) => (
                <li key={scope} style={{ fontSize: 13 }}>
                  {scope}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div style={{ marginTop: 18, display: "flex", gap: 12, flexWrap: "wrap" }}>
          <Link
            to="/app/aaliyah"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              minWidth: 160,
              borderRadius: 14,
              border: `1px solid ${tokens.colors.border}`,
              background: tokens.colors.gold,
              color: tokens.colors.bg,
              textDecoration: "none",
              padding: "10px 14px",
              fontWeight: 650,
            }}
          >
            Return to Aaliyah
          </Link>
        </div>
      </div>
    </div>
  );
}
