import React from "react";
import { useQuery } from "@tanstack/react-query";
import { createFetchClient, fetchGovernanceSnapshot, readApiEnv, type GovernanceSnapshot } from "@zbest/api-sdk";
import { DEFAULT_TARGETS } from "../ui/TargetSelector";

type RuntimeContextValue = {
  target: string;
  setTarget: (target: string) => void;
  snapshot: GovernanceSnapshot | undefined;
  isLoading: boolean;
  isError: boolean;
  errorMessage: string | null;
  integrityScore: number;
  autoBlock: boolean;
  freeze: boolean;
  killSwitch: boolean;
  flagsCount: number;
};

const RuntimeContext = React.createContext<RuntimeContextValue | null>(null);

function correlationId() {
  return crypto.randomUUID();
}

export function RuntimeProvider({ children }: { children: React.ReactNode }) {
  const [target, setTarget] = React.useState<string>(DEFAULT_TARGETS[0]);
  const pathname = typeof window === "undefined" ? "" : window.location.pathname;
  const bypassRuntimeFetch = pathname.startsWith("/oauth/google/callback");
  const envResult = React.useMemo(() => {
    try {
      return { env: readApiEnv(import.meta.env as Record<string, unknown>), error: null as string | null };
    } catch (err) {
      return { env: null, error: (err as Error).message };
    }
  }, []);

  const fetchClient = React.useMemo(() => createFetchClient({ correlationId }), []);
  const query = useQuery({
    queryKey: ["governance-snapshot", target],
    enabled: Boolean(envResult.env) && !bypassRuntimeFetch,
    queryFn: async () =>
      fetchGovernanceSnapshot({
        baseUrl: envResult.env!.VITE_POLICY_BASE_URL,
        bearer: envResult.env!.VITE_POLICY_BEARER,
        introspectionToken: envResult.env!.VITE_POLICY_INTROSPECTION_TOKEN,
        fetchClient,
      }),
    refetchInterval: 15_000,
  });

  const snapshot = query.data;
  const value: RuntimeContextValue = {
    target,
    setTarget,
    snapshot,
    isLoading: query.isLoading,
    isError: query.isError || Boolean(envResult.error),
    errorMessage: envResult.error ?? (query.isError ? (query.error as Error).message : null),
    integrityScore: snapshot?.integrity_score ?? 0,
    autoBlock: snapshot?.auto_block_active ?? false,
    freeze: Boolean((snapshot as { controls?: { freeze_mode?: unknown } } | undefined)?.controls?.freeze_mode ?? false),
    killSwitch: Boolean(
      (snapshot as { controls?: { kill_switch_active?: unknown } } | undefined)?.controls?.kill_switch_active ?? false,
    ),
    flagsCount: snapshot?.integrity_flags?.length ?? 0,
  };

  return <RuntimeContext.Provider value={value}>{children}</RuntimeContext.Provider>;
}

export function useRuntime() {
  const ctx = React.useContext(RuntimeContext);
  if (!ctx) {
    throw new Error("useRuntime must be used inside RuntimeProvider");
  }
  return ctx;
}
