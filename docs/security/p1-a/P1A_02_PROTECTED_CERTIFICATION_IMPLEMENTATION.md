# P1A-02 protected certification / workflow orchestration

## Authority and scope

This lane implements frozen requirements `P1AF-014` through `P1AF-015` and
`P1AF-022` through `P1AF-036` against the founder-authorized clean base
`b0c1b2129123b941c6a350c16dae0ae3a8e076ca`. The frozen denominator remains
124. This implementation neither changes the frozen ledger nor grants merge,
push, dispatch, release, or production authority.

The prior `.github/workflows/p1a-certify.yml` is preserved as historical
bootstrap evidence. New clean-rebuild decisions must use
`.github/workflows/p1a-certify-clean.yml`; the old workflow's abandoned-lineage
identities are not accepted by the clean preflight.

## Enforced contract

- Trusted and candidate roots are separate, non-nested real paths.
- Git subprocesses ignore system/global configuration, hooks, credential
  helpers, prompts, and mutable branch names as authority.
- Repository, canonical remote, clean base, workflow SHA, verifier SHA,
  candidate SHA, runtime pin, verifier digest, exact candidate-scope digest,
  and sealed evidence-package digest are bound.
- The exact candidate path list is founder-declared at protected dispatch and
  must equal the sorted Git delta from workflow authority to candidate. Counts
  are emitted only after exact path equality succeeds.
- Candidate code is checked out as data. Executable verifier paths all begin
  under the checkout at `github.workflow_sha`.
- The 15-check nested summary and distinct 21-check real-object summary must
  both be present, complete, identity-equal, and zero across every non-pass
  counter.
- Accounting output uses exclusive creation (`flag: wx`) so replay cannot
  overwrite a prior governed result. Workflow concurrency keys include both
  candidate and exact scope identity.
- Ordinary CI has read-only permissions, runs a candidate-data-only validation,
  and retains the protected-secret exposure scan.
- Every third-party action is pinned to a full commit SHA. Uploaded files are an
  explicit summary allowlist; credential helpers, object stores, scopes, and raw
  logs are removed under `always()`.

## Authentic local evidence

`pnpm run test:p1a-certification` runs:

1. 32 orchestration and hostile-mutation checks;
2. 13 zero-counter and identity-accounting checks;
3. 6 real-Git preflight checks using two physical repositories and an actual
   descendant candidate commit, including ambient Git configuration injection.

The ordinary-CI secret detector contributes 9 additional checks. Workflow
syntax and shell semantics are validated with `actionlint`.

## Honest boundary

The real protected GitHub environment, App credential, private runtime fetch,
15/15 nested suite, 21/21 real-object suite, artifact upload, and independent
certification have not run in this local implementation lane. Their state is
`NOT_RUN`, not pass. P1A-04 owns credential lifecycle, P1A-07 owns authentic
suite production, P1A-03 owns final evidence envelopes, and P1A-08 owns
cross-lane integration. Remote dispatch remains a founder gate.
