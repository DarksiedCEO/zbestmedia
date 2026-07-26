# Reconciliation and Migration Recommendations

## Ordered reconciliation

1. Freeze this candidate to an exact SHA and obtain founder review.
2. Confirm the 43-record documentary baseline and keep every runtime status separate.
3. Locate the provenance for the claimed 32 occurrences. Until then, retain claim-only `UNREPRODUCIBLE` slots.
4. Compare `Brandyn`↔`Brandon` and `Jordyn`↔`Jordan` by mission, ownership, contract hash, and runtime binding; never resolve by name similarity alone.
5. Classify each reproduced record as `ALIAS`, `DUPLICATE`, `LEGACY`, `EXPIRED`, `LOCAL_ONLY`, `CONFLICTING`, `REQUIRES_MIGRATION`, or `REQUIRES_FOUNDER_DECISION`.
6. Pin and census the external agency source only after this authority candidate is approved.
7. Create migration candidates one agent at a time, preserving original files and hashes.
8. Bind an approved candidate to `zbestmedia-ui` only through the promotion contract.

## Duplicate and alias rules

- Same display name is not identity proof.
- Similar mission is not lineage proof.
- An alias requires a documented canonical ID and evidence that both records describe the same accountable role.
- A duplicate requires preservation of both sources and an approved survivor.
- Expired records remain expired until a separately reviewed successor is issued.

## Migration rules

- Copy; do not delete or rewrite source history.
- Preserve source repository, branch, SHA, path, hash, author evidence, and expiry.
- Do not migrate runtime status.
- Do not activate during reconciliation.
- Use a narrow PR per coherent migration set and stop before merge.

## Deferred work

- External source import and 230+ construction wave.
- Agent Factory activation.
- OOH/DOOH runtime construction.
- Client transaction/contract/confirmation runtime construction.
- Search Intelligence repository implementation.
- Master Sentinel repository implementation.
