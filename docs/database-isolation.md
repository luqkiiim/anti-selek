# Database environment isolation

| Context | Database and credentials |
| --- | --- |
| Vercel Production | Production Turso; standard `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN`, scoped to Production only |
| Vercel Preview | Isolated development Turso; dedicated `PREVIEW_TURSO_DATABASE_URL` / `PREVIEW_TURSO_AUTH_TOKEN`, scoped to Preview only |
| Vercel Development / local builds / tests | SQLite by default using `DATABASE_URL` |
| Explicit local Turso development | Approved non-production credentials plus private endpoint registration and `USE_TURSO=true` |
| Production preservation rehearsal | Disabled pending credential rotation; retained separate read-only loader, never application environment variables |

`config/database-targets.json` contains only SHA-256 fingerprints, never credentials. Canonical endpoint origins normalize `libsql:` to `https:`. Non-production clients must match both the approved endpoint and the approved token fingerprint before constructing any remote client. This also rejects a production token accidentally paired with a development URL. Unknown endpoints and malformed URLs fail closed. Tests cannot use the Production exception. A private local registration takes precedence over copied Vercel metadata.

Only an actual Production deployment (`NODE_ENV=production`, `VERCEL=1`, `VERCEL_ENV=production`, and `VERCEL_URL`, with no local registration) can use the production target. Preview accepts dedicated `PREVIEW_TURSO_*` variables only and refuses any standard `TURSO_*` variables. Missing configuration or client initialization failure disables access; there is no fallback database. Local `NODE_ENV=production` alone does not enable Turso.

When approving a different non-production database or rotating its token, update the corresponding policy fingerprints after independently verifying that the endpoint is not production. Calculate hashes privately with `tursoEndpointFingerprint` and `tursoTokenFingerprint`; do not put credentials in shell arguments, history, logs, fixtures, or commits. A new local checkout also needs ignored `private/development-target.json` containing `{ "version": 1, "endpointSha256": "<approved non-production hash>" }`. Do not register production locally.

## Development migration repair

The separate development database stopped after 18 migrations. `20260403075615_add_test_sessions` rebuilds `Session` using eight columns that no earlier migration created: pool enablement/names, assignment and missed-turn counters, and crossover threshold. LibSQL correctly rejects the missing identifiers. Native SQLite can interpret an unknown double-quoted identifier as a string literal, so an empty Prisma migration success alone does not demonstrate safe preservation.

The development/local migration runner now adds only missing rebuild-input columns with their historical defaults immediately before that migration. Existing columns and values remain unchanged. Historical migration SQL is unchanged. Integration tests exercise all 52 migrations from an empty database and from a populated predecessor schema with a custom existing value, then check the ledger, integrity and foreign keys.

The approved development database was consistently backed up into ignored, protected `private/development-isolation/` before repair. It now has all 52 migrations, the Phase 1 schema, `integrity_check=ok`, zero foreign-key errors and zero business rows. No production database operation was involved.

`npm run db:migrate:turso` remains an explicit local/development action. It requires the endpoint and token policy pins and private registration. Every Vercel context is refused, even with `--force` or the old `RUN_DB_MIGRATIONS=1` flag. `npm run build` runs only Next; installation generates the Prisma client and does not migrate.

## Existing Preview deployments

Environment edits affect future deployments; old immutable deployments may retain earlier credentials. Keep those unsafe Preview deployments denied by the project firewall. The Preview-only safety rule initially denies all Preview traffic while isolated credentials and a safe deployment are prepared. Never remove that protection merely because the environment-variable scopes were changed. Allow a verified isolated Preview only after checking its deployment configuration; retain the block on older Preview hosts. Production must not match the rule.

The compromised production read-only token remains unused. This change does not invalidate group tokens, rotate production application credentials, deploy Production, perform the Phase 1 production cutover, or alter local `.env` / `.env.local`.

## Verification

```sh
npm run test:file -- src/lib/prisma.test.ts src/lib/productionRehearsalSafety.test.ts src/lib/accountPlayerMigration.test.ts
node --test scripts/session-rebuild-prerequisite.test.mjs
npx tsc --noEmit
npm run lint
npm run build
```

Credential and snapshot exclusions from the retained safety commit cover Git and Vercel CLI uploads. Keep private backup files and actual environment values out of build traces and deployment artifacts.
