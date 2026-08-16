import { canonicalBytes, canonicalDigest, parseStrictJson, ContractError } from "./canonical-json.mjs";
import { REQUIRED_CONSUMER_CATALOG } from "./required-consumer-catalog.mjs";

const SHA = /^[0-9a-f]{40}$/; const ID = /^[a-z][a-z0-9_]*$/; const REPO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const AUTHORITY_FIELDS = ["authority_id", "role", "owner", "repository", "immutable_ref", "expected_tree", "ordered_parents", "fetch_depth", "required_objects", "required_paths", "materialization_path", "credential_policy", "verification_contract", "consumer_bindings", "cleanup_contract", "evidence_contract"];
const TOP_FIELDS = ["contractVersion", "repositoryIdentity", "trustedWorkflowIdentity", "subjectTaxonomyVersion", "requiredConsumerCatalog", "authorities", "consumers", "credentialPolicies", "evidencePolicies", "cleanupPolicies", "accountingStates", "bootstrapPolicies"];
const REPOSITORY_FIELDS = ["repository", "selectedBy"], WORKFLOW_FIELDS = ["sha", "blob"];
const CATALOG_FIELDS = ["catalogVersion", "catalogSha256", "schemaSha256", "selectionAuthority", "candidateSelectable", "consumerCount"];
const OBJECT_FIELDS = ["object_id", "object_type"], PATH_FIELDS = ["path", "blob_sha"];
const CONSUMER_FIELDS = ["consumer_id", "required_roles", "verification_obligations", "cleanup_obligations", "accounting_obligations"];
const fail = (code, message, details) => { throw new ContractError(code, message, details); };
const exactKeys = (value, expected, field) => { const actual = Object.keys(value).sort(); const wanted = [...expected].sort(); if (JSON.stringify(actual) !== JSON.stringify(wanted)) fail("CONTRACT_SCHEMA_INVALID", `${field} fields differ`, { actual, wanted }); };
function path(value) { if (typeof value !== "string" || value !== value.normalize("NFC") || value.startsWith("/") || value.includes("\\") || /%[0-9a-f]{2}/i.test(value) || /[\u0000-\u001f\u007f]/u.test(value) || value.split("/").some((x) => !x || x === "." || x === "..")) fail("CONTRACT_PATH_INVALID", `unsafe path ${value}`); return value; }
function sortedUnique(array, key, code) { if (!Array.isArray(array)) fail("CONTRACT_SCHEMA_INVALID", `${key} must be an array`); const tuples = array.map(key); for (let i = 1; i < tuples.length; i += 1) if (tuples[i - 1] >= tuples[i]) fail(code, `${key} must be sorted and unique`); }

export function validateManifest(manifest, { trustedCustody = true } = {}) {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) fail("CONTRACT_SCHEMA_INVALID", "manifest must be an object");
  exactKeys(manifest, TOP_FIELDS, "manifest");
  exactKeys(manifest.repositoryIdentity ?? {}, REPOSITORY_FIELDS, "repositoryIdentity");
  exactKeys(manifest.trustedWorkflowIdentity ?? {}, WORKFLOW_FIELDS, "trustedWorkflowIdentity");
  exactKeys(manifest.requiredConsumerCatalog ?? {}, CATALOG_FIELDS, "requiredConsumerCatalog");
  if (manifest.contractVersion !== "P1A-CONTRACT-1") fail("CONTRACT_VERSION_UNSUPPORTED", "unsupported contract version");
  if (!trustedCustody || manifest.repositoryIdentity.selectedBy !== "trusted_workflow") fail("CANDIDATE_AUTHORITY_SELECTED", "manifest custody is not trusted");
  if (manifest.repositoryIdentity.repository !== "DarksiedCEO/zbestmedia" || !SHA.test(manifest.trustedWorkflowIdentity.sha) || !SHA.test(manifest.trustedWorkflowIdentity.blob)) fail("CONTRACT_IDENTITY_INVALID", "trusted repository/workflow identity invalid");
  const catalogBinding = manifest.requiredConsumerCatalog;
  if (catalogBinding.catalogVersion !== REQUIRED_CONSUMER_CATALOG.catalogVersion || catalogBinding.catalogSha256 !== REQUIRED_CONSUMER_CATALOG.catalogSha256 || catalogBinding.schemaSha256 !== REQUIRED_CONSUMER_CATALOG.schemaSha256 || catalogBinding.selectionAuthority !== "external_bootstrap_authorization" || catalogBinding.candidateSelectable !== false || catalogBinding.consumerCount !== REQUIRED_CONSUMER_CATALOG.consumerIds.length) fail("CATALOG_BINDING_INVALID", "manifest does not bind the exact externally frozen Packet-2 catalog");
  const authorityIds = new Set(), roles = new Set(), materializations = new Set();
  sortedUnique(manifest.authorities, (x) => x.authority_id, "CONTRACT_AUTHORITY_ORDER_INVALID");
  for (const authority of manifest.authorities) {
    exactKeys(authority, AUTHORITY_FIELDS, `authority ${authority.authority_id}`);
    if (!ID.test(authority.authority_id) || !ID.test(authority.role) || !ID.test(authority.owner)) fail("CONTRACT_ID_INVALID", "authority IDs must be canonical");
    if (authorityIds.has(authority.authority_id) || roles.has(authority.role)) fail("ROLE_DUPLICATE", "authority ID or semantic role duplicated");
    authorityIds.add(authority.authority_id); roles.add(authority.role);
    if (!REPO.test(authority.repository) || !SHA.test(authority.immutable_ref)) fail("MUTABLE_REF_FORBIDDEN", "authority repository/ref invalid");
    if (!(authority.expected_tree === "NOT_APPLICABLE" || SHA.test(authority.expected_tree))) fail("CONTRACT_IDENTITY_INVALID", "expected tree invalid");
    if (!Array.isArray(authority.ordered_parents) || authority.ordered_parents.some((x) => !SHA.test(x))) fail("TOPOLOGY_MISMATCH", "ordered parents invalid");
    if (!Number.isSafeInteger(authority.fetch_depth) || authority.fetch_depth < 1) fail("CONTRACT_FETCH_DEPTH_INVALID", "fetch depth must be bounded positive integer");
    sortedUnique(authority.required_objects, (x) => `${x.object_id}:${x.object_type}`, "CONTRACT_OBJECT_ORDER_INVALID");
    sortedUnique(authority.required_paths, (x) => `${path(x.path)}:${x.blob_sha}`, "CONTRACT_PATH_ORDER_INVALID");
    for (const item of authority.required_objects) { exactKeys(item, OBJECT_FIELDS, "required object"); if (!SHA.test(item.object_id) || !["commit", "tree", "blob", "tag"].includes(item.object_type)) fail("CONTRACT_OBJECT_INVALID", "required object invalid"); }
    const foldedPaths = new Set();
    for (const item of authority.required_paths) { exactKeys(item, PATH_FIELDS, "required path"); if (!SHA.test(item.blob_sha)) fail("CONTRACT_BLOB_INVALID", "required path blob invalid"); const folded = item.path.toLocaleLowerCase("en-US"); if (foldedPaths.has(folded)) fail("PATH_ALIAS", "case-fold path alias"); foldedPaths.add(folded); }
    if (!ID.test(authority.materialization_path) || materializations.has(authority.materialization_path)) fail("ROOT_ALIAS", "materialization ID duplicated or invalid"); materializations.add(authority.materialization_path);
    for (const field of ["verification_contract", "consumer_bindings"]) { sortedUnique(authority[field], (x) => x, "CONTRACT_BINDING_ORDER_INVALID"); if (authority[field].length === 0) fail("CONTRACT_BINDING_EMPTY", `${field} must not be empty`); }
    for (const field of ["credential_policy", "cleanup_contract", "evidence_contract"]) if (!ID.test(authority[field])) fail("CONTRACT_POLICY_INVALID", `${field} invalid`);
  }
  sortedUnique(manifest.consumers, (x) => x.consumer_id, "CONTRACT_CONSUMER_ORDER_INVALID");
  const consumerIds = new Set(manifest.consumers.map((x) => x.consumer_id));
  if (JSON.stringify([...consumerIds]) !== JSON.stringify(REQUIRED_CONSUMER_CATALOG.consumerIds)) fail("CATALOG_CONSUMER_SET_INVALID", "manifest consumer set differs from the external Packet-2 catalog");
  for (const consumer of manifest.consumers) { exactKeys(consumer, CONSUMER_FIELDS, `consumer ${consumer.consumer_id}`); if (!ID.test(consumer.consumer_id)) fail("CONTRACT_CONSUMER_INVALID", "consumer invalid"); for (const field of CONSUMER_FIELDS.slice(1)) { sortedUnique(consumer[field], (x) => x, "CONTRACT_BINDING_ORDER_INVALID"); if (consumer[field].length === 0 || consumer[field].some((x) => !ID.test(x))) fail("CONTRACT_CONSUMER_INVALID", `${field} invalid`); } }
  for (const field of ["credentialPolicies", "evidencePolicies", "cleanupPolicies", "accountingStates", "bootstrapPolicies"]) { if (!Array.isArray(manifest[field]) || manifest[field].length === 0 || new Set(manifest[field]).size !== manifest[field].length || manifest[field].some((x) => typeof x !== "string" || x.length === 0)) fail("CONTRACT_POLICY_INVALID", `${field} must be nonempty and unique`); }
  for (const authority of manifest.authorities) for (const consumer of authority.consumer_bindings) if (!consumerIds.has(consumer)) fail("UNKNOWN_CONSUMER", `unknown consumer ${consumer}`);
  return Object.freeze({ manifest, canonical: canonicalBytes(manifest), digest: canonicalDigest(manifest), identifier: `urn:zbestmedia:p1a:certification-contract:1:sha256:${canonicalDigest(manifest)}` });
}
export function loadManifest(bytes, options) { return validateManifest(parseStrictJson(bytes), options); }
