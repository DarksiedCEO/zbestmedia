import fs from "node:fs";

import { z } from "zod";

const keyringSchema = z.object({
  version: z.number().int().positive().default(1),
  keys: z.record(
    z.string(),
    z.object({
      algo: z.literal("ed25519").default("ed25519"),
      public_key_pem: z.string().min(1)
    })
  )
});

export type AuditKeyring = z.infer<typeof keyringSchema>;

export function parseAuditKeyring(input: unknown): AuditKeyring {
  return keyringSchema.parse(input);
}

export function loadAuditKeyring(filePath: string): AuditKeyring {
  return parseAuditKeyring(JSON.parse(fs.readFileSync(filePath, "utf8")));
}
