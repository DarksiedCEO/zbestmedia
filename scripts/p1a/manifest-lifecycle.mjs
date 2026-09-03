import { canonicalDigest, ContractError } from "./canonical-json.mjs";

const SHA = /^[0-9a-f]{40}$/;
const fail = (code, message) => { throw new ContractError(code, message); };
const exactSet = (a, b) => a.length === b.length && new Set(a).size === a.length && [...a].sort().every((v, i) => v === [...b].sort()[i]);

export const REQUIRED_AUTHORITY_IDS = Object.freeze([
  "ancestry_authority", "baseline_repository", "current_workflow_authority",
  "dual_base_authority", "evidence_base_authority", "frozen_bootstrap",
  "original_repository", "pr16_action_inventory_source", "pr16_chain_authority",
  "pr16_current_predecessor_source", "pr16_minimum_depth_source",
  "pr16_original_amendment_source", "pr16_rejected_chain_source",
  "trusted_base_full_source", "trusted_contract", "trusted_reconciliation_authority",
]);

export function validateV2Manifest(manifest, { consumers, futureProducers } = {}) {
  if (manifest?.contractVersion !== "P1A-CONTRACT-2" || manifest?.version !== 2)
    fail("CONTRACT_VERSION_UNSUPPORTED", "v2 contract required");
  if (manifest.lifecycleState !== "ACTIVATION_PENDING" || manifest.active !== false ||
      manifest.selfActivating !== false || manifest.remoteProvenance !== "PENDING" ||
      manifest.remoteAuthorized !== false)
    fail("MANIFEST_SELF_ACTIVATION", "v2 must remain inactive pending external activation");
  if (manifest.previousContract?.version !== 1 || manifest.previousContract?.active !== true ||
      manifest.previousContract?.rollbackTarget !== "62cbb8a90099e647ef7d91ecec7898f701babf8a")
    fail("ROLLBACK_TARGET_INVALID", "historical v1 rollback authority is not exact");
  const authorities = manifest.authorities ?? [];
  const ids = authorities.map((x) => x.authority_id);
  if (!exactSet(ids, REQUIRED_AUTHORITY_IDS)) fail("AUTHORITY_SET_MISMATCH", "authority membership is not the exact 16-role set");
  if (new Set(authorities.map((x) => x.semantic_role)).size !== authorities.length)
    fail("AUTHORITY_ALIAS_DUPLICATE", "semantic roles must be unique");
  if (new Set(authorities.map((x) => x.environment_binding)).size !== authorities.length)
    fail("AUTHORITY_BINDING_ALIAS", "environment bindings must be unique");
  for (const authority of authorities) {
    if (authority.required !== true || authority.conditional === true || authority.candidateSelectable !== false)
      fail("AUTHORITY_OPTIONALITY_INVALID", `required authority ${authority.authority_id} is not fail closed`);
    if (!SHA.test(authority.immutable_ref) || !SHA.test(authority.expected_tree) ||
        !Array.isArray(authority.consumers) || authority.consumers.length === 0 ||
        typeof authority.producer_contract !== "string" || authority.producer_contract.length === 0)
      fail("AUTHORITY_CONTRACT_INVALID", `authority ${authority.authority_id} is incomplete`);
  }
  const consumerRequired = (consumers ?? manifest.consumerAuthorityBindings ?? []).flatMap((x) => x.authority_ids ?? []);
  const produced = (futureProducers ?? manifest.futureProducerContracts ?? []).map((x) => x.authority_id);
  if (!exactSet([...new Set(consumerRequired)], REQUIRED_AUTHORITY_IDS) || !exactSet(produced, REQUIRED_AUTHORITY_IDS))
    fail("PRODUCER_CONSUMER_MANIFEST_MISMATCH", "consumer, producer, and manifest authority sets differ");
  if ((manifest.conditionalAuthorities ?? []).some((x) => x.required === true))
    fail("OPTIONAL_AUTHORITY_PROMOTED", "conditional historical fallback cannot satisfy required completeness");
  return Object.freeze({ status: "V2_ACTIVATION_PENDING", authorityCount: authorities.length, digest: canonicalDigest(manifest) });
}

export function selectManifest(request) {
  if (!request || Object.keys(request).some((key) => !["v1", "v2"].includes(key)))
    fail("REJECT_CALLER_SELECTED_ACTIVATION_BINDING", "manifest selection accepts no activation truth claims");
  const { v1, v2 } = request;
  validateV2Manifest(v2);
  return Object.freeze({ active: v1, pending: v2, activeCount: 1, state: "V1_ACTIVE_V2_PENDING" });
}
