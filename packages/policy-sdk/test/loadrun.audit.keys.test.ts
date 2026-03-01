import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { rotateAuditKeyring } from "../src/audit/keys";

const PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAZCu+zhIWuT2vmau3yXFrWfKY8bHyxNcj9CqWMsVeh7w=
-----END PUBLIC KEY-----
`;

describe("audit key rotation", () => {
  it("writes rotation plan and updates keyring with approval", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "audit-keys-"));
    const keyringPath = path.join(root, "keyring.json");
    fs.writeFileSync(
      keyringPath,
      JSON.stringify(
        {
          version: 1,
          keys: {
            k1: { algo: "ed25519", public_key_pem: PUBLIC_KEY }
          }
        },
        null,
        2
      ),
      "utf8"
    );
    const out = rotateAuditKeyring({
      keyringPath,
      newKid: "k2",
      publicKeyPem: PUBLIC_KEY,
      approved: true,
      reason: "quarterly rotation",
      by: "andre",
      outDir: path.join(root, "rotation")
    });
    expect(Object.keys(out.keyring.keys).sort()).toEqual(["k1", "k2"]);
    expect(fs.existsSync(out.reportPath)).toBe(true);
  });
});
