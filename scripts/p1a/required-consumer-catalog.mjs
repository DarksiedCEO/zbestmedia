import { createHash } from "node:crypto";
import Ajv2020 from "ajv/dist/2020.js";
import { canonicalDigest, ContractError, requireCanonicalBytes } from "./canonical-json.mjs";

export const REQUIRED_CONSUMER_CATALOG = Object.freeze({
  catalogVersion: "p1a-required-consumers/v3",
  catalogSha256: "d2d4cc7ac837c5b7f8e22818ddf137382c7f1bfb2c484d878fdfe5b3c72524ed",
  schemaSha256: "3082fa83a5704ae55ac7fc3612b1c2937a6cc4302a312e3cd83cee3248c2a780",
  freezeSha256: "e96bb8acaf85ea30591acb91b7522c48519a6428241e4931d6726d2b510b12e1",
  consumerIds: Object.freeze([
    "accounting", "artifact_upload", "candidate_checkout", "cleanup_revocation", "dispatch_identity",
    "dual_base_verifier", "evidence_sealing", "identity_ancestry_gate", "nested_verifier",
    "post_merge_validation", "real_object_integration", "rollback", "runtime_acquisition",
    "runtime_token_producer", "trusted_checkout"
  ])
});

const fail = (code, message, details) => { throw new ContractError(code, message, details); };
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const loadedCatalogs = new WeakSet();
const sortedUnique = (values, code, label) => {
  if (!Array.isArray(values)) fail("CATALOG_SCHEMA_INVALID", `${label} must be an array`);
  const sorted = [...values].sort();
  if (new Set(values).size !== values.length || JSON.stringify(sorted) !== JSON.stringify(values)) fail(code, `${label} must be sorted and unique`);
};

export function loadRequiredConsumerCatalog({ catalogBytes, schemaBytes, freezeBytes, authority }) {
  if (!authority || typeof authority !== "object" || Array.isArray(authority)) fail("CATALOG_AUTHORITY_INVALID", "external catalog authority is required");
  const expectedAuthority = {
    producer: "packet_2_evidence_custodian",
    selectionAuthority: "external_bootstrap_authorization",
    candidateSelectable: false,
    catalogSha256: REQUIRED_CONSUMER_CATALOG.catalogSha256,
    schemaSha256: REQUIRED_CONSUMER_CATALOG.schemaSha256,
    freezeSha256: REQUIRED_CONSUMER_CATALOG.freezeSha256
  };
  if (canonicalDigest(authority) !== canonicalDigest(expectedAuthority)) fail("CATALOG_AUTHORITY_INVALID", "catalog authority is not the frozen external authority");
  if (!Buffer.isBuffer(catalogBytes) || !Buffer.isBuffer(schemaBytes) || !Buffer.isBuffer(freezeBytes)) fail("CATALOG_BYTES_REQUIRED", "trusted adapter must provide external catalog, schema, and freeze bytes");
  if (sha256(catalogBytes) !== REQUIRED_CONSUMER_CATALOG.catalogSha256 || sha256(schemaBytes) !== REQUIRED_CONSUMER_CATALOG.schemaSha256 || sha256(freezeBytes) !== REQUIRED_CONSUMER_CATALOG.freezeSha256) fail("CATALOG_DIGEST_MISMATCH", "external catalog, schema, or freeze digest mismatch");
  const catalog = requireCanonicalBytes(catalogBytes); const schema = requireCanonicalBytes(schemaBytes); const freeze = requireCanonicalBytes(freezeBytes);
  let validate;
  try { validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema); }
  catch (error) { fail("CATALOG_SCHEMA_INVALID", "frozen catalog schema does not compile", { message: error.message }); }
  if (!validate(catalog)) fail("CATALOG_SCHEMA_INVALID", "catalog does not satisfy frozen schema", { errors: validate.errors });
  const consumerIds = catalog.consumers.map((entry) => entry.consumer_id);
  sortedUnique(consumerIds, "CATALOG_CONSUMER_SET_INVALID", "catalog consumers");
  if (JSON.stringify(consumerIds) !== JSON.stringify(REQUIRED_CONSUMER_CATALOG.consumerIds)) fail("CATALOG_CONSUMER_SET_INVALID", "catalog consumer set is not the exact Packet-2 set");
  for (const [index, entry] of catalog.consumers.entries()) {
    if (entry.source_ordinal !== index + 1 && entry.source_ordinal !== ({ dispatch_identity: 1, trusted_checkout: 2, candidate_checkout: 3, identity_ancestry_gate: 4, dual_base_verifier: 5, runtime_token_producer: 6, runtime_acquisition: 7, nested_verifier: 8, real_object_integration: 9, accounting: 10, evidence_sealing: 11, artifact_upload: 12, cleanup_revocation: 13, rollback: 14, post_merge_validation: 15 })[entry.consumer_id]) fail("CATALOG_DERIVATION_INVALID", `source ordinal mismatch for ${entry.consumer_id}`);
  }
  const inventoryIds = [
    ...catalog.consumers.map((x) => `consumer:${x.consumer_id}`),
    ...catalog.historicalInventories.integrationCases.map((x) => `integration:${x.case_id}`),
    ...catalog.historicalInventories.nestedChecks.map((x) => `nested:${x.check_id}`),
    ...Object.entries(catalog.historicalInventories.trustedVerifierSuites).flatMap(([suite, controls]) => controls.map((x) => `${suite}:${x.control_id}`))
  ];
  if (inventoryIds.length !== catalog.consumerCounts.recoveredInventoryTotal || new Set(inventoryIds).size !== inventoryIds.length) fail("CATALOG_INVENTORY_INVALID", "historical inventory is incomplete or duplicated");
  if (catalog.custody.candidateMayProvideBytes || catalog.custody.candidateMayProvideDigest || catalog.custody.candidateMayProvidePath || catalog.bindingContract.candidateSelectable) fail("CANDIDATE_SELECTED_AUTHORITY", "catalog custody permits candidate selection");
  if (freeze.artifactDigests?.catalogSha256 !== REQUIRED_CONSUMER_CATALOG.catalogSha256 || freeze.artifactDigests?.schemaSha256 !== REQUIRED_CONSUMER_CATALOG.schemaSha256 || freeze.custody?.candidateSelectable !== false || freeze.custody?.candidateWorktreeModified !== false || freeze.custody?.selectionRule !== "trusted adapter receives path and SHA-256 only from external bootstrap authorization" || freeze.freezeStatus !== "CUSTODIAN_FROZEN_FOR_PACKET3_INTEGRATION_REVIEW") fail("CATALOG_FREEZE_INVALID", "catalog freeze envelope does not preserve independent custody");
  loadedCatalogs.add(catalog);
  return Object.freeze({ catalog, schema, freeze, catalogDigest: sha256(catalogBytes), schemaDigest: sha256(schemaBytes), freezeDigest: sha256(freezeBytes), canonicalCatalogDigest: canonicalDigest(catalog), consumerIds: Object.freeze([...consumerIds]), authority: Object.freeze({ ...expectedAuthority }) });
}

export function isLoadedRequiredConsumerCatalog(catalog) { return Boolean(catalog && typeof catalog === "object" && loadedCatalogs.has(catalog)); }
