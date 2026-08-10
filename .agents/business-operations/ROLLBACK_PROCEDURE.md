# Installation Rollback Procedure

Scope: the repository-local 21-file Business Operations package only. No production, customer, messaging, publishing, or external state is involved.

## Preconditions

- Confirm the exact branch and immutable pre-installation base SHA.
- Confirm the changed-file set contains only `AGENTS.md` and `.agents/**` files in the validator allowlist.
- Preserve any evidence required for human review.
- Require human authorization before removing a committed or shared installation.

## Rehearsal

The deterministic validator rehearses rollback in a disposable temporary directory:

1. Copy the exact allowlisted package files to the temporary directory.
2. Verify the copied manifest contains all 21 files.
3. Remove the copied package.
4. Verify no copied package file remains.
5. Leave the working tree untouched.

## Authorized rollback

For an uncommitted isolated worktree, remove only the 21 allowlisted package files after human authorization. For a committed change, use a normal revert commit scoped to the installation commit; do not reset, rebase, or rewrite history. Re-run repository tests and verify the package paths are absent. Merge and release remain human gates.
