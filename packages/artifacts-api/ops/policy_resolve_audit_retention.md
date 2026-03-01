# Policy Resolve Audit Retention

## Controls
- `POLICY_RESOLVE_AUDIT_ENABLED` gates writes (default: `false`).
- `POLICY_RESOLVE_AUDIT_SAMPLE_RATE` controls sampling (default: `0.01`).
- `POLICY_RESOLVE_AUDIT_SEED` controls deterministic sampling bucket assignment.

## Data Shape
- Stored fields are request metadata only: correlation id, scope identifiers, role, hash/version/provenance, contract version, and receipt signature presence.
- Raw policy payloads are not persisted in `agency.policy_resolve_audit`.

## Retention
- Staging: 7 days.
- Production: 30 days.

## Purge Guidance
- Purge with scheduled SQL using `resolved_at` cutoff.
- Keep purge jobs tenant-safe and run off-hours.
