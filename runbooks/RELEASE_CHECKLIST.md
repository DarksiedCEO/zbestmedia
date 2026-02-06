# Release Checklist

1. `pnpm run verify`
2. `pnpm run schemas:check`
3. Prisma clients generated (if changed schema)
   - `pnpm -C services/brandgraph prisma generate --schema prisma/schema.prisma`
   - `pnpm -C services/artifact-registry prisma generate --schema prisma/schema.prisma`
4. Git clean
   - `git status` shows no uncommitted changes
5. Branch pushed
   - `git push origin <branch>`
