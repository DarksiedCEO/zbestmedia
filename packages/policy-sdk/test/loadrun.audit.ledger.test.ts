import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { appendAuditLedgerEntry, verifyAuditLedger } from "../src/audit/ledger";
import { parseAuditKeyring } from "../src/audit/keyring";

const PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
MC4CAQAwBQYDK2VwBCIEIBR3qzdJMbKrgSDvotT+z3JjxlTdxQUCWB2UHCC5A37F
-----END PRIVATE KEY-----
`;

const PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAZCu+zhIWuT2vmau3yXFrWfKY8bHyxNcj9CqWMsVeh7w=
-----END PUBLIC KEY-----
`;

describe("audit ledger", () => {
  it("verifies signed append-only chain", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ledger-"));
    const ledgerPath = path.join(dir, "ledger.jsonl");
    appendAuditLedgerEntry({
      ledgerPath,
      type: "slo_event",
      targetId: "prod/us-west/policy",
      payload: { a: 1 },
      now: new Date("2026-03-01T00:00:00.000Z"),
      signature: { kid: "k1", privateKeyPem: PRIVATE_KEY }
    });
    appendAuditLedgerEntry({
      ledgerPath,
      type: "baseline_accept",
      targetId: "prod/us-west/policy",
      payload: { b: 2 },
      now: new Date("2026-03-01T00:00:01.000Z"),
      signature: { kid: "k1", privateKeyPem: PRIVATE_KEY }
    });
    const keyring = parseAuditKeyring({
      version: 1,
      keys: {
        k1: { algo: "ed25519", public_key_pem: PUBLIC_KEY }
      }
    });
    const vr = verifyAuditLedger({ ledgerPath, keyring, strictSignatures: true });
    expect(vr.ok).toBe(true);
    expect(vr.entries).toBe(2);
    expect(vr.head_hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("fails when chain is tampered", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ledger-"));
    const ledgerPath = path.join(dir, "ledger.jsonl");
    appendAuditLedgerEntry({
      ledgerPath,
      type: "slo_event",
      targetId: "prod/us-west/policy",
      payload: { a: 1 },
      signature: { kid: "k1", privateKeyPem: PRIVATE_KEY }
    });
    appendAuditLedgerEntry({
      ledgerPath,
      type: "baseline_accept",
      targetId: "prod/us-west/policy",
      payload: { b: 2 },
      signature: { kid: "k1", privateKeyPem: PRIVATE_KEY }
    });

    const lines = fs
      .readFileSync(ledgerPath, "utf8")
      .split("\n")
      .filter((line) => line.trim().length > 0);
    fs.writeFileSync(ledgerPath, `${lines[1]}\n`, "utf8");

    const keyring = parseAuditKeyring({
      version: 1,
      keys: {
        k1: { algo: "ed25519", public_key_pem: PUBLIC_KEY }
      }
    });
    const vr = verifyAuditLedger({ ledgerPath, keyring, strictSignatures: true });
    expect(vr.ok).toBe(false);
    expect(vr.errors.join("|")).toContain("prev_hash mismatch");

    const first = JSON.parse(lines[0]!);
    first.chain_hash = "0".repeat(64);
    fs.writeFileSync(ledgerPath, `${JSON.stringify(first)}\n`, "utf8");
    const vrTampered = verifyAuditLedger({ ledgerPath, keyring, strictSignatures: true });
    expect(vrTampered.ok).toBe(false);
    expect(vrTampered.errors.join("|")).toContain("chain_hash mismatch");
  });
});
