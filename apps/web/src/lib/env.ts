import { z } from "zod";

const envSchema = z.object({
  VITE_API_BASE_URL: z
    .string()
    .optional()
    .refine((value) => value === undefined || value.startsWith("/") || isValidUrl(value), {
      message: "VITE_API_BASE_URL must be an absolute URL or a relative /api path"
    }),
  VITE_TENANT_ID: z.string().optional(),
  // Bearer token for the secured brandgraph service. Optional so local dev
  // against an unsecured/mocked backend still works, but without it every
  // call to the now-authenticated brandgraph returns 401.
  VITE_SERVICE_AUTH_TOKEN: z.string().optional()
});

export type Env = {
  apiBaseUrl: string;
  tenantId?: string;
  authToken?: string;
};

let cachedEnv: Env | null = null;

export function getEnv(): Env {
  if (cachedEnv) {
    return cachedEnv;
  }

  const parsed = envSchema.safeParse(import.meta.env);
  if (!parsed.success) {
    const message = parsed.error.errors.map((err) => err.message).join("; ");
    throw new Error(`Invalid environment configuration: ${message}`);
  }

  cachedEnv = {
    apiBaseUrl: parsed.data.VITE_API_BASE_URL ?? "/api",
    tenantId: parsed.data.VITE_TENANT_ID,
    authToken: parsed.data.VITE_SERVICE_AUTH_TOKEN
  };

  return cachedEnv;
}

function isValidUrl(value: string) {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}
