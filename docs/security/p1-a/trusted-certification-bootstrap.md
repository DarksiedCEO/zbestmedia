# P1-A trusted-certification bootstrap

## Scope

This bootstrap installs only the protected workflow and verifier used to inspect
an immutable P1-A candidate as untrusted data. It does not certify PR #8, change
runtime code, authorize P1-B, or grant merge authority.

## Protected custody requirements

Before the workflow is dispatched:

1. Merge this bootstrap through independent review onto protected branch
   `codex/bt-1`.
2. Configure branch protection so changes to the workflow, verifier, verifier
   tests, CODEOWNERS, and this custody record require code-owner review.
3. Create environment `p1a-certification`.
4. Required reviewer: `DarksiedCEO`.
5. Restrict environment deployment branches to `codex/bt-1`.
6. Store `P1A_RUNTIME_APP_PRIVATE_KEY` in that environment.
7. Confirm the environment secret exists by name without exposing its value.
8. Run one approved dry certification or token acquisition proving the
   environment copy works.
9. Only after that proof, remove the repository-level copy so candidate branch
   workflows cannot request the long-lived App private key.

Until these controls are observed in GitHub, protected environment custody is
`NOT_PROVEN` and trusted certification must not run.

## Bootstrap-first verification boundary

Ordinary pull-request CI is deliberately unprivileged. Before bootstrap merge it
must remotely execute the trusted verifier controls, workflow lint, Node syntax,
secret-exposure scan, schema validation, P0 regression, and workspace quality
gates at the exact checked-out SHA.

The frozen-candidate integration and nested trusted verification were
`NOT_RUN pre-merge` because their private cross-repository Git evidence is
intentionally unavailable to ordinary CI. Fixture execution is not equivalent
proof and must not be reported as the real 21/21 or 15/15 suites.

GitHub plan limitations currently prevent enforced branch protection and Code
Owner review for this private repository. The founder accepts the bounded
bootstrap risk only with these temporary compensating controls:

- freeze PR #9 at one exact SHA after remote CI;
- permit no collaborator mutation of the bootstrap branch;
- require founder exact-SHA review and founder-only merge authorization;
- make no trusted-certification claim before post-merge execution;
- retain an AEGIS `YELLOW` posture until post-merge trusted verification passes.

After a separately authorized merge, configure the protected
`p1a-certification` environment and run the real frozen-candidate integration
and nested verification. Any failure blocks PR #8 and P1-B, preserves the
evidence, disables trusted dispatch if necessary, and requires a separately
reviewed revert commit for bootstrap rollback.

Repository variables remain:

- `P1A_RUNTIME_APP_ID`
- `P1A_TRUST_BASE_SHA`
- `P1A_TRUST_RUNTIME_PIN`

The GitHub App remains installed only on `DarksiedCEO/zbestmedia-ui` with
Contents read-only and mandatory Metadata read-only. Webhooks, user
authorization, and all write permissions remain disabled.

## Trust and execution model

The workflow is manually dispatched from its protected-branch commit. It binds:

- workflow commit SHA;
- verifier commit SHA and verifier content digest;
- candidate SHA;
- authorized base SHA;
- runtime pin;
- evidence-package digest.

The candidate is checked out only as data. Node executes the verifier from the
trusted workflow commit, never a script path under the candidate checkout. The
verifier binds three independent immutable identities: evidence/model base
`7056ea4ce24379c93549f0ac9b45ddd7a2600dd6`, trusted reconciliation base
`5056fb0df6e1ef739231cd2273a453fb1c644273`, and original P1-A candidate
`365c59757756f3f91480d3bfeb841b543010201f`. These values are controlled by the
trusted workflow and are not loaded from candidate data or mutable branch names.

File authority is explicit. The seven evidence/model paths must have the exact
blobs preserved from the original candidate. Independently merged bootstrap
paths unchanged by the amendment must match the trusted reconciliation base;
amendment-controlled paths must match the exact executing workflow commit.
Ordinary `.github/workflows/ci.yml` is candidate-owned only for one exact
addition: the hermetic `pnpm test:p1a-threat-model` step. Removing trusted
bootstrap tests, changing any other CI byte, introducing protected secrets, or
executing candidate-controlled credentialed code fails closed.
The candidate must descend from the reconciliation base, and its delta may
contain only the seven candidate-owned paths. Counts are evidence summaries,
not policy: path classification and blob identity are the enforcing controls.

runtime repository is fetched into an isolated bare object store using a
short-lived installation token. Every cited repository path, blob identity, line
count, and range is checked against immutable Git objects.

Missing anchors, missing objects, contradictory status, expanded file scope,
unsafe paths, impossible ranges, or any non-pass accounting state fail closed.
The protected workflow runs both the 15-check nested verifier and the distinct
21-check real-object integration harness from its trusted workflow checkout.
Candidate code remains data-only. A trusted accounting validator rejects an
absent, skipped, incomplete, or identity-mismatched suite and requires
`failed`, `skipped`, `cancelled`, `neutral`, `stale`, `notVerified`, and
`notRun` to all equal zero.

## Evidence handling

Only an allowlisted JSON summary and its SHA-256 digest are uploaded. Raw logs,
the askpass helper, and the runtime object store are excluded from artifacts and
removed in an `always()` cleanup step. The token action revokes its installation
token in its post-job cleanup.

The environment approval, run ID, job ID, workflow SHA, candidate SHA, artifact
digest, and reviewer identity must be retained with the certification record.

## Rollback

Disable dispatch by removing the environment approval or environment secret.
Revoke the App private key if compromise is suspected. Reverting the bootstrap
commit removes the workflow and trusted verifier without touching PR #8 or
runtime code. Historical certification evidence remains evidence for its exact
workflow and candidate SHAs only.

## Remaining human gates

- bootstrap human review;
- founder authorization to push;
- bootstrap merge authorization;
- environment configuration and custody verification;
- trusted certification dispatch approval;
- independent Security, Reliability, Test Verification, Release Guardian, and
  AEGIS review;
- founder decision on PR #8.
