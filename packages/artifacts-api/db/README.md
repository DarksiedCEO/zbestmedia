# Database migrations

Apply migrations locally from the `packages/artifacts-api` directory:

```bash
pnpm db:migrate
```

The command requires `DATABASE_URL` and runs:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrations/001_artifacts_rls.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrations/002_artifacts_determinism_input.sql
```

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
