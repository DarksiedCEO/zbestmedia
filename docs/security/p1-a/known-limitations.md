# P1-A Known Limitations

- This package is a threat-model and validation contract, not a runtime control implementation or production certification.
- Live configuration, deployed SHA, network policy, branch protection, provider retention, database RLS, backups and secret custody remain unproven.
- Three founder decisions—tenant/workspace authority, production credential custody, and outbound data/egress policy—remain unresolved for implementation and block P1-B.
- `pnpm prisma:generate:all` was observed locally failing while invoking `pnpm -C services/brandgraph prisma generate --schema prisma/schema.prisma` with `Command "services/brandgraph" not found`. The defect is outside P1-A, does not alter this package’s model validation, and is assigned to the repository build-tool owner for a separately authorized package. It was not remediated here. Full-workspace validation must not be described as locally GREEN on the strength of that command.
- Runtime failure injection, cross-tenant denial, SSRF destructive testing, rollback rehearsal, Sentinel operation, tamper-evident evidence custody, credential rotation and production recovery are deferred to their authorized P1 packages and remain NOT_PROVEN.
