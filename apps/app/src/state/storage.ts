import { z } from "zod";

export function makeKey(targetId: string, key: string) {
  return `zbest:${targetId}:${key}`;
}

export function loadJson<T>(key: string, schema: z.ZodType<T>, fallback: T): T {
  if (typeof window === "undefined") {
    return fallback;
  }

  const raw = localStorage.getItem(key);
  if (!raw) {
    return fallback;
  }
  try {
    return schema.parse(JSON.parse(raw));
  } catch {
    return fallback;
  }
}

export function saveJson<T>(key: string, value: T) {
  if (typeof window === "undefined") {
    return;
  }
  localStorage.setItem(key, JSON.stringify(value));
}
