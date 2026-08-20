# P1A-02 protected certification / workflow orchestration

## Authority and scope

This lane remediates the P1A-02 protected-certification builder subject against
the founder-authorized clean base `b0c1b2129123b941c6a350c16dae0ae3a8e076ca`.
The frozen 124-requirement denominator is unchanged. This work grants no push,
merge, dispatch, release, deployment, or production authority and is not an
independent certification.

The historical `.github/workflows/p1a-certify.yml` and abandoned-lineage
authority roots remain inadmissible. The protected clean workflow is
`.github/workflows/p1a-certify-clean.yml`.

## Locally implemented controls

- A fixed `/usr/bin/git` primitive disables system/global configuration,
  prompts, helpers, hooks, replace objects, grafts, and alternates, and rejects
  an unexpected object-store inventory.
- The candidate root is required in protected mode, canonicalized, bound to the
  expected repository and commit, and consumed through traversal-, symlink-,
  and file-race-resistant reads. Candidate files are data, never executable
  verifier code.
- Evidence is acquired by exact repository, workflow run, and artifact name;
  trusted code hashes downloaded bytes and treats a dispatch digest only as a
  comparison value.
- GitHub OIDC verification binds an RS256 signature from the exact issuer and
  checks audience, subject, repository, owner ID, ref, workflow ref/SHA,
  environment, time validity, and maximum lifetime.
- Workflow identity binds repository, exact path/ref, commit, Git blob, file
  SHA-256, event, ref, and environment.
- Authority inventory uses a fixed nine-class denominator and rejects reduced,
  duplicated, or substituted sets.
- Accounting output remains exclusive-create and concurrency remains scoped to
  candidate plus exact governed scope.

## Verification performed

`pnpm run test:p1a-certification` passed 85/85 local behavior checks:
38 orchestration, 13 accounting, 7 real-Git preflight, and 27 remediation
security checks. The mutation suite killed 4/4 mutations with zero survivors:
ambient Git execution, skipped OIDC signature validation, skipped evidence
digest validation, and reduced authority inventory. `actionlint`, Node syntax
checks, JSON parsing, and `git diff --check` also passed.

These are builder results. Live GitHub OIDC, trusted artifact acquisition, the
protected environment, and remote protected execution remain `NOT_RUN`.

## External integration blockers

P1A-02 remains stopped on two P1A-08-owned defects:

1. The shared 21-check integration producer still requires authority roots
   that the clean workflow cannot lawfully obtain from abandoned lineage.
2. The shared producer does not emit the versioned authority fields required by
   the P1A-02 accounting consumer.

The contract is recorded in
`P1A_02_TO_P1A_08_INTEGRATION_CONTRACT_V1.json`. No legacy-root compatibility
shim and no silent field translation is authorized. Therefore nested 15/15,
real-object 21/21, protected remote execution, and external certification are
not claimed.

## Evidence hygiene

The untracked file `scripts/validate-p1a-certification-accounting 2.mjs` is a
conflicting stale implementation. It is preserved, excluded from the governed
subject, and classified in
`P1A_02_STALE_ACCOUNTING_ARTIFACT_CLASSIFICATION_V1.json`; no active workflow,
package script, or module import reaches it.
