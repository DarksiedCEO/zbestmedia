# P1-A Packet 3 trusted-foundation traceability

This foundation is a one-parent sibling of the separately frozen bootstrap lineage. It implements workflow-independent components only; neither workflow is modified or executed.

| Path | Capability owner | Packet-2 requirement | Producer | Consumers | Test owner | Why Packet 3 |
|---|---|---|---|---|---|---|
| `.github/p1a/certification-contract.v1.json` | trusted contract owner | canonical manifest | trusted foundation | future adapters/oracle | foundation tests | trusted semantic inventory |
| `.github/p1a/certification-contract.v1.schema.json` | trusted contract owner | closed schema | trusted foundation | manifest loader | foundation tests | runtime input contract |
| `.github/p1a/subject-registry.v1.json` | classifier owner | sole class registry | trusted foundation | classifier/future adapters | foundation tests | disjoint taxonomy |
| `.github/p1a/adverse-evidence.v1.schema.json` | Evidence Custodian | adverse envelope | trusted foundation | evidence producer | foundation tests | terminal evidence contract |
| `scripts/p1a/canonical-json.mjs` | contract owner | strict canonical bytes/digest | trusted foundation | all foundation modules | foundation tests | deterministic identity |
| `scripts/p1a/certification-manifest.mjs` | contract owner | manifest validation/custody | trusted foundation | oracle/future adapters | foundation tests | fail-closed contract loading |
| `scripts/p1a/subject-classifier.mjs` | classifier owner | exactly-one subject taxonomy | trusted foundation | future adapters/accounting | foundation tests | eliminates duplicate classifiers |
| `scripts/p1a/completeness-oracle.mjs` | oracle owner | consumer-driven completeness | frozen catalog + executable registry | future adapters/AEGIS | foundation tests | independent completeness |
| `scripts/p1a/required-consumer-catalog.mjs` | Packet-2 Evidence Custodian | exact external catalog/schema digest and canonical-byte gate | externally selected Packet-2 catalog v3 | manifest/oracle/accounting | foundation tests + bootstrap authorization | prevents candidate-selected completeness |
| `scripts/p1a/accounting-state-machine.mjs` | accounting owner | closed append-only states | trusted evidence events | evidence/certification | foundation tests | prevents false GREEN |
| `scripts/p1a/adverse-evidence.mjs` | Evidence Custodian | runner/platform/Git separation | trusted producer | accounting/AEGIS | foundation tests | honest adverse evidence |
| `scripts/test-p1a-foundation.mjs` | test verification owner | positive/hostile component proof | trusted tests | builder/AEGIS | test verification | Packet-3 qualification |
| `scripts/test-p1a-foundation-mutations.mjs` | adversarial test owner | bounded implemented mutants | trusted tests | builder/AEGIS | adversarial review | component mutation evidence |

Packet-4 owns ordinary/protected workflow adapters, broker acquisition, runtime credential boundaries, manifest parity, adverse artifact upload/read-back, and migration from historical workflow-specific controls. No Packet-4 obligation is represented as completed here.

## External Packet-2 consumer boundary

The candidate does not contain or select the Packet-2 catalog path or bytes. A trusted adapter must provide the externally frozen V3 catalog and schema selected by the external bootstrap authorization. The foundation accepts only catalog SHA-256 `d2d4cc7ac837c5b7f8e22818ddf137382c7f1bfb2c484d878fdfe5b3c72524ed` and schema SHA-256 `3082fa83a5704ae55ac7fc3612b1c2937a6cc4302a312e3cd83cee3248c2a780`, then verifies canonical bytes, the closed schema, custody flags, the 182-element recovered inventory, and the exact 15-consumer set.

The manifest, completeness oracle, accounting record inventory, and cleanup registry must all equal those 15 semantic consumer IDs. Cleanup and accounting obligations are copied exactly from the externally verified Packet-2 catalog at evaluation time. The manifest's per-consumer `required_roles` are forward executable-producer contracts for Packet 4; they do not claim those future adapters already exist. Completeness becomes `COMPLETE` only when an executable registry independently supplies each exact producer role and consumer binding, both current Git authorities have executable producers, and no extra consumer, accounting record, cleanup entry, or producer exists.
