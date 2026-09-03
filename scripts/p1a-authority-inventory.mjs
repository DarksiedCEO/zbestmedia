import assert from "node:assert/strict";

export const AUTHORITY_SCHEMA_VERSION = "P1A_PROTECTED_AUTHORITY_INVENTORY_V1";
export const REQUIRED_AUTHORITY_CLASSES = Object.freeze([
  "TRUSTED_WORKFLOW_CHECKOUT",
  "CANDIDATE_DATA_CHECKOUT",
  "LEGACY_CURRENT_WORKFLOW_AUTHORITY",
  "ORIGINAL_CANDIDATE_AUTHORITY",
  "TRUSTED_BASELINE_AUTHORITY",
  "RUNTIME_AUTHORITY",
  "EVIDENCE_PACKAGE_AUTHORITY",
  "OIDC_IDENTITY_AUTHORITY",
  "WORKFLOW_IDENTITY_AUTHORITY",
]);

export function validateAuthorityInventory(inventory, expected) {
  assert.equal(inventory?.schemaVersion, AUTHORITY_SCHEMA_VERSION, "authority inventory schema mismatch");
  assert.ok(Array.isArray(inventory.authorities), "authority inventory missing");
  assert.equal(inventory.authorities.length, REQUIRED_AUTHORITY_CLASSES.length, "authority denominator mismatch");
  const classes = inventory.authorities.map((item) => item.authorityClass);
  assert.equal(new Set(classes).size, classes.length, "duplicate authority class");
  assert.deepEqual([...classes].sort(), [...REQUIRED_AUTHORITY_CLASSES].sort(), "missing or unauthorized authority class");
  for (const item of inventory.authorities) {
    assert.match(item.acquisitionId ?? "", /^[A-Z0-9_-]+$/u, "authority acquisition id invalid");
    assert.equal(item.repository, expected.repositoryFor[item.authorityClass], `wrong authority repository: ${item.authorityClass}`);
    assert.equal(item.verificationMethod, expected.verificationMethodFor[item.authorityClass], `wrong verification method: ${item.authorityClass}`);
    assert.equal(item.identity, expected.identityFor[item.authorityClass], `wrong or stale authority identity: ${item.authorityClass}`);
    assert.ok(item.consumer === "P1A_PROTECTED_CERTIFICATION", "authority consumer mismatch");
  }
  return { schemaVersion: AUTHORITY_SCHEMA_VERSION, authorityDenominator: REQUIRED_AUTHORITY_CLASSES.length, authoritySet: [...classes].sort(), parity: "PROTECTED_REQUIRED_SET_EXACT" };
}
