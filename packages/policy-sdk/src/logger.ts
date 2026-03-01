export type PolicyLogger = {
  info: (obj: Record<string, unknown>, msg?: string) => void;
  warn: (obj: Record<string, unknown>, msg?: string) => void;
  error: (obj: Record<string, unknown>, msg?: string) => void;
};

export const noopLogger: PolicyLogger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined
};
