export async function enableMocking() {
  const useMocks = String(import.meta.env.VITE_MOCKS ?? "false").toLowerCase() === "true";
  if (!useMocks) {
    return;
  }

  const { worker } = await import("./browser");
  await worker.start({
    onUnhandledRequest: "bypass",
  });
}
