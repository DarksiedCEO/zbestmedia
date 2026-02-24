import { z } from "zod";

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  AUTH_JWT_SECRET: z.string().min(32, "AUTH_JWT_SECRET must be at least 32 characters"),
  ARTIFACT_SIGNING_KEY: z.string().min(32, "ARTIFACT_SIGNING_KEY must be at least 32 characters"),
  MAX_ARTIFACT_WRITES_PER_MINUTE: z.coerce.number().int().positive().default(60),
  MAX_POLICY_PAYLOAD_BYTES: z.coerce.number().int().positive().default(50_000),
  MAX_POLICY_PAYLOAD_KEYS: z.coerce.number().int().positive().default(200),
  FORBIDDEN_ARTIFACT_TYPES: z.string().min(1).default("legal.advice,medical.advice"),
  FORBIDDEN_PHRASES: z.string().min(1).default("guaranteed results,no risk,100% guaranteed"),
  POLICY_VERSION: z.string().min(1).default("policy-v1"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(8080)
});

export type AppEnv = z.infer<typeof EnvSchema>;
export type Env = AppEnv;

export function loadEnv(raw: NodeJS.ProcessEnv = process.env): AppEnv {
  const parsed = EnvSchema.safeParse(raw);
  if (!parsed.success) {
    const reasons = parsed.error.issues.map((issue) => issue.message).join("; ");
    throw new Error(`Invalid environment configuration: ${reasons}`);
  }
  return parsed.data;
}
