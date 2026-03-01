import { describe, expect, it } from "vitest";

import { signSloContracts, verifySloContractsSignature, type SloContracts } from "../src/contracts/sloContracts";
import { parseAuditKeyring } from "../src/audit/keyring";

const PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
MC4CAQAwBQYDK2VwBCIEIBR3qzdJMbKrgSDvotT+z3JjxlTdxQUCWB2UHCC5A37F
-----END PRIVATE KEY-----
`;

const PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAZCu+zhIWuT2vmau3yXFrWfKY8bHyxNcj9CqWMsVeh7w=
-----END PUBLIC KEY-----
`;

function sampleContracts(): SloContracts {
  return {
    version: "1.0.0",
    effective_at: "2026-03-01T00:00:00.000Z",
    contracts: {
      "prod/us-west/policy": {
        guardrails_profile_key: "prod/*",
        thresholds: {
          p95InflationRatioCap: 1.25,
          p99InflationRatioCap: 1.5,
          errorRateIncreasePctPointsCap: 0.25,
          timeoutIncreasePctPointsCap: 0.1,
          breakerOpenRateIncreasePctPointsCap: 2,
          retryAmplificationIncreaseCap: 0.15
        },
        budgets: {
          daily_requests_max: 200000,
          monthly_requests_max: 2000000
        },
        severity_rules: {
          p95_ratio_gt_2: "SEVERE"
        }
      }
    }
  };
}

describe("slo contract signing", () => {
  it("verifies valid signed contract payload", () => {
    const contracts = sampleContracts();
    const signed = signSloContracts({
      contracts,
      kid: "k1",
      privateKeyPem: PRIVATE_KEY,
      createdAt: "2026-03-01T00:00:00.000Z"
    });
    const keyring = parseAuditKeyring({
      version: 1,
      keys: {
        k1: {
          algo: "ed25519",
          public_key_pem: PUBLIC_KEY
        }
      }
    });
    const vr = verifySloContractsSignature({ contracts, signed, keyring });
    expect(vr.ok).toBe(true);
  });

  it("fails on tampered payload", () => {
    const contracts = sampleContracts();
    const signed = signSloContracts({
      contracts,
      kid: "k1",
      privateKeyPem: PRIVATE_KEY
    });
    contracts.contracts["prod/us-west/policy"]!.budgets.daily_requests_max = 111;
    const keyring = parseAuditKeyring({
      version: 1,
      keys: {
        k1: {
          algo: "ed25519",
          public_key_pem: PUBLIC_KEY
        }
      }
    });
    const vr = verifySloContractsSignature({ contracts, signed, keyring });
    expect(vr.ok).toBe(false);
    expect(vr.reason).toBe("payload_hash_mismatch");
  });

  it("fails for unknown key id", () => {
    const contracts = sampleContracts();
    const signed = signSloContracts({
      contracts,
      kid: "k9",
      privateKeyPem: PRIVATE_KEY
    });
    const keyring = parseAuditKeyring({
      version: 1,
      keys: {
        k1: {
          algo: "ed25519",
          public_key_pem: PUBLIC_KEY
        }
      }
    });
    const vr = verifySloContractsSignature({ contracts, signed, keyring });
    expect(vr.ok).toBe(false);
    expect(vr.reason).toContain("unknown_kid");
  });
});
