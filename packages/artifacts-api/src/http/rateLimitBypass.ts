export function shouldBypassResolveRateLimit(args: {
  enabled: boolean;
  method: string | undefined;
  url: string | undefined;
}): boolean {
  if (!args.enabled) return false;
  if ((args.method ?? "").toUpperCase() !== "GET") return false;
  return (args.url ?? "").startsWith("/v1/policies/resolve");
}
