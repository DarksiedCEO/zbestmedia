import { z } from "zod";

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().int().positive(),
  SERVICE_NAME: z.literal("artifact-registry"),
  NATS_URL: z.string().min(1).optional(),
  SERVICE_AUTH_TOKENS: z.string().min(1)
});

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(): Env {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const message = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join(", ");
    throw new Error(`Invalid environment: ${message}`);
  }
  return parsed.data;
}
