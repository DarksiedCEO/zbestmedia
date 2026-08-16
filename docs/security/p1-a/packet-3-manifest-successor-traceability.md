# P1-A canonical manifest v2 successor

This direct child of trusted base `b0c1b2129123b941c6a350c16dae0ae3a8e076ca` carries the frozen Packet-3 foundation and adds an inactive canonical v2 manifest.

- v1 remains the sole active manifest during Phase 1.
- v2 is `ACTIVATION_PENDING`, non-self-activating, and has no remote-provenance claim.
- Sixteen required authorities are derived from fourteen protected roots plus independent bootstrap and trusted-contract custody.
- `P1A_PR16_HISTORICAL_SOURCE_ROOT` is a conditional fallback and cannot satisfy mandatory completeness.
- Activation truth is not accepted through the manifest-selection request. The selector always leaves v1 active and v2 pending.
- The zero-argument activation entrypoint acquires the expected binding only from the fixed founder/bootstrap authority root and independently observes Git identity only from the fixed repository root.
- The expected and observed custody domains must differ. The decision compares exact commit, tree, ordered parents, parent count, manifest blob, canonical byte count/digest, bundle, AEGIS, founder authorization, remote provenance, and rollback authority.
- Expected authority also freezes the exact manifest path and complete changed-file inventory. The observed adapter derives both internally from the fixed repository: `.github/p1a/certification-contract.v2.json` and the full sole-parent `git diff-tree --name-status --no-renames` result.
- Changed-file entries bind canonical repository-relative path, status, old blob, and new blob. Entries are unique and sorted by raw UTF-8 bytes; additions have a null old blob, deletions have a null new blob, and modified/type-changed entries bind both blobs.
- Caller-selected manifest paths, changed-file inventories, parents, diff bases, filters, and ordering are rejected by the zero-claim production entrypoint.
- A successful comparison is evidence only (`INDEPENDENT_ACTIVATION_EVIDENCE_MATCH`); it does not activate v2. Workflow mutation and activation remain outside this subject.
- Failure leaves v1 active and v2 pending.

The immutable RED predecessor `511dcb14c730d5af5b42cb216c77b75036355f6f` is preserved as evidence of caller-selected activation truth. No workflow, catalog authority, transition authority, Prisma authority, remote ref, protected workflow, or PR #8 candidate is modified by this successor.
