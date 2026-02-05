import pino from "pino";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info"
});

export function withContext(context: Record<string, unknown>) {
  return logger.child(context);
}
