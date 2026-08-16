import { canonicalDigest } from "./canonical-json.mjs";
import { isLoadedRequiredConsumerCatalog, REQUIRED_CONSUMER_CATALOG } from "./required-consumer-catalog.mjs";

export const ORACLE_CODES = Object.freeze(["MISSING_PRODUCER", "MISSING_BINDING", "ORPHANED_AUTHORITY", "DUPLICATE_PRODUCER", "DUPLICATE_ROLE", "PATH_ALIAS", "OBJECT_STORE_ALIAS", "MISSING_VERIFICATION", "MISSING_CLEANUP", "MISSING_ACCOUNTING", "CONSUMER_DRIFT", "CANDIDATE_SELECTED_AUTHORITY", "VERSION_MISMATCH", "UNKNOWN_CONSUMER", "CATALOG_AUTHORITY_INVALID", "CATALOG_CONSUMER_SET_INVALID", "CATALOG_OBLIGATION_MISMATCH"]);
const finding = (code, semanticId, details = {}) => Object.freeze({ code, semanticId, details });
const ids = (items = []) => items.map((item) => item.consumer_id);
const exactSet = (actual, expected) => actual.length === expected.length && new Set(actual).size === actual.length && [...actual].sort().every((value, index) => value === [...expected].sort()[index]);
const duplicate = (items, key, code, findings) => { const seen = new Set(); for (const item of items) { const value = item[key]; if (seen.has(value)) findings.push(finding(code, value)); seen.add(value); } };
const exactArray = (left, right) => Array.isArray(left) && Array.isArray(right) && JSON.stringify(left) === JSON.stringify(right);

export function evaluateCompleteness({ manifest, executableRegistry, frozenCatalog, bindings }) {
  const findings = []; const authorities = manifest?.authorities ?? []; const consumers = manifest?.consumers ?? [];
  const producers = executableRegistry?.producers ?? []; const authorityProducers = executableRegistry?.authorityProducers ?? [];
  const registryConsumers = executableRegistry?.consumers ?? []; const accountingRecords = executableRegistry?.accountingRecords ?? []; const cleanupRegistry = executableRegistry?.cleanupRegistry ?? [];
  const requiredIds = REQUIRED_CONSUMER_CATALOG.consumerIds;
  const actualCatalogDigest = canonicalDigest(frozenCatalog ?? {}); const actualRegistryDigest = canonicalDigest(executableRegistry ?? {});
  if (!isLoadedRequiredConsumerCatalog(frozenCatalog) || actualCatalogDigest !== REQUIRED_CONSUMER_CATALOG.catalogSha256 || bindings?.frozenCatalogDigest !== REQUIRED_CONSUMER_CATALOG.catalogSha256 || bindings?.frozenCatalogSchemaDigest !== REQUIRED_CONSUMER_CATALOG.schemaSha256 || bindings?.selectionAuthority !== "external_bootstrap_authorization" || bindings?.candidateSelectable !== false) findings.push(finding("CATALOG_AUTHORITY_INVALID", "external_catalog_binding"));
  if (bindings?.executableRegistryDigest !== actualRegistryDigest) findings.push(finding("VERSION_MISMATCH", "external_registry_binding"));
  if (authorities.length === 0 || consumers.length === 0 || producers.length === 0 || authorityProducers.length === 0 || registryConsumers.length === 0 || accountingRecords.length === 0 || cleanupRegistry.length === 0 || !(frozenCatalog?.consumers?.length > 0)) findings.push(finding("MISSING_BINDING", "non_vacuous_system"));
  if (manifest?.contractVersion !== frozenCatalog?.contractVersion || manifest?.requiredConsumerCatalog?.catalogSha256 !== REQUIRED_CONSUMER_CATALOG.catalogSha256 || manifest?.requiredConsumerCatalog?.schemaSha256 !== REQUIRED_CONSUMER_CATALOG.schemaSha256) findings.push(finding("VERSION_MISMATCH", manifest?.contractVersion ?? "missing_manifest"));
  duplicate(authorities, "role", "DUPLICATE_ROLE", findings); duplicate(authorities, "materialization_path", "PATH_ALIAS", findings); duplicate(producers, "producer_role", "DUPLICATE_PRODUCER", findings); duplicate(authorityProducers, "authority_id", "DUPLICATE_PRODUCER", findings);
  const expectedProducerRoles = consumers.flatMap((consumer) => consumer.required_roles ?? []).sort();
  if (!exactSet(producers.map((producer) => producer.producer_role), expectedProducerRoles)) findings.push(finding("MISSING_PRODUCER", "semantic_producer_set"));
  if (!exactSet(authorityProducers.map((producer) => producer.authority_id), authorities.map((authority) => authority.authority_id))) findings.push(finding("MISSING_PRODUCER", "authority_producer_set"));
  for (const [label, values] of [["manifest", ids(consumers)], ["registry", ids(registryConsumers)], ["cleanup", ids(cleanupRegistry)], ["catalog", ids(frozenCatalog?.consumers)]]) if (!exactSet(values, requiredIds)) findings.push(finding("CATALOG_CONSUMER_SET_INVALID", label, { actual: values, expected: requiredIds }));
  const accountingIds = ids(accountingRecords); if (!exactSet(accountingIds, requiredIds)) findings.push(finding("CATALOG_CONSUMER_SET_INVALID", "accounting", { actual: accountingIds, expected: requiredIds }));
  const catalogById = new Map((frozenCatalog?.consumers ?? []).map((entry) => [entry.consumer_id, entry]));
  const registryConsumerById = new Map(registryConsumers.map((entry) => [entry.consumer_id, entry]));
  const cleanupById = new Map(cleanupRegistry.map((entry) => [entry.consumer_id, entry]));
  const producerByRole = new Map(producers.map((entry) => [entry.producer_role, entry]));
  const authorityProducerCounts = new Map(); for (const producer of authorityProducers) authorityProducerCounts.set(producer.authority_id, (authorityProducerCounts.get(producer.authority_id) ?? 0) + 1);
  for (const authority of authorities) {
    if (authority.owner === "candidate") findings.push(finding("CANDIDATE_SELECTED_AUTHORITY", authority.authority_id));
    const count = authorityProducerCounts.get(authority.authority_id) ?? 0; if (count === 0) findings.push(finding("MISSING_PRODUCER", authority.authority_id)); if (count > 1) findings.push(finding("DUPLICATE_PRODUCER", authority.authority_id));
    if ((authority.consumer_bindings ?? []).length === 0) findings.push(finding("ORPHANED_AUTHORITY", authority.authority_id));
  }
  for (const consumer of consumers) {
    const catalogEntry = catalogById.get(consumer.consumer_id); const registryEntry = registryConsumerById.get(consumer.consumer_id); const cleanupEntry = cleanupById.get(consumer.consumer_id);
    if (!catalogEntry || catalogEntry.manifest_binding !== "required_consumer_exact_set" || catalogEntry.oracle_binding !== "required_consumer_exact_set") findings.push(finding("MISSING_BINDING", `${consumer.consumer_id}:catalog`));
    if (!registryEntry || registryEntry.manifest_binding !== "required_consumer_exact_set") findings.push(finding("MISSING_BINDING", `${consumer.consumer_id}:registry`));
    if (!catalogEntry || !exactArray(consumer.accounting_obligations, [catalogEntry.accounting_obligation]) || !exactArray(consumer.cleanup_obligations, [catalogEntry.cleanup_obligation]) || !cleanupEntry || !exactArray(cleanupEntry.cleanup_obligations, consumer.cleanup_obligations)) findings.push(finding("CATALOG_OBLIGATION_MISMATCH", consumer.consumer_id));
    for (const role of consumer.required_roles ?? []) { const producer = producerByRole.get(role); if (!producer || !exactArray(producer.consumer_ids, [consumer.consumer_id])) findings.push(finding("MISSING_BINDING", `${consumer.consumer_id}:${role}`)); }
    if (!(consumer.verification_obligations?.length > 0)) findings.push(finding("MISSING_VERIFICATION", consumer.consumer_id));
    if (!(consumer.cleanup_obligations?.length > 0)) findings.push(finding("MISSING_CLEANUP", consumer.consumer_id));
    if (!(consumer.accounting_obligations?.length > 0)) findings.push(finding("MISSING_ACCOUNTING", consumer.consumer_id));
  }
  for (const pair of executableRegistry?.objectStores ?? []) if (pair.left !== pair.right && pair.leftRealpath === pair.rightRealpath) findings.push(finding("OBJECT_STORE_ALIAS", `${pair.left}:${pair.right}`));
  findings.sort((a, b) => `${a.code}:${a.semanticId}`.localeCompare(`${b.code}:${b.semanticId}`));
  return Object.freeze({ status: findings.length === 0 ? "COMPLETE" : "INCOMPLETE", findings, manifestDigest: canonicalDigest(manifest ?? {}), executableRegistryDigest: actualRegistryDigest, frozenCatalogDigest: actualCatalogDigest, requiredConsumerCount: requiredIds.length });
}
