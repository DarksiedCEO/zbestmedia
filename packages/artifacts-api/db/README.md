# Database migrations

Apply migrations locally from the `packages/artifacts-api` directory:

```bash
pnpm db:migrate
```

Local Postgres workflow:

```bash
pnpm db:up
pnpm db:migrate:local
pnpm db:down
```

`db:migrate` resolves DB URL from:
1) `DATABASE_URL`
2) `ARTIFACTS_INT_DATABASE_URL`
3) `ARTIFACTS_DB_URL`
4) `.env` / `.env.local` in `packages/artifacts-api`

## Manual RLS verification

These queries demonstrate tenant isolation behavior:

```sql
-- Fails because app.tenant_id is not set (require_tenant_id() raises)
SELECT artifact_id FROM artifacts LIMIT 1;
```

```sql
BEGIN;
SET LOCAL app.tenant_id = '11111111-1111-1111-1111-111111111111';
SELECT artifact_id FROM artifacts LIMIT 1;
COMMIT;
```

```sql
BEGIN;
SET LOCAL app.tenant_id = '22222222-2222-2222-2222-222222222222';
SELECT artifact_id FROM artifacts LIMIT 1;
COMMIT;
```
