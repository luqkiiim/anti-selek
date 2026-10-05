# Read-only production preservation rehearsal

**Currently disabled.** `config/database-targets.json` sets `productionRehearsalEnabled=false`. The command refuses access before loading credentials or creating a database client. Keep it disabled until the compromised read-only token has been invalidated through coordinated rotation and a replacement credential is approved. The setup below describes the retained read-only mechanism for that later approval.

The production rehearsal uses a separate read-only Turso credential. It does not read production credentials from `.env` or `.env.local`, export its credential as `TURSO_*` or `DATABASE_URL`, apply SQL to the source, or enable production application access.

Create a short-lived read-only token for the production database. A one-day expiry is recommended; a Turso non-expiring read-only token is also accepted.

```sh
turso db tokens create <production-database-name> --read-only --expiration 1d
```

Edit the dedicated private file without putting the token in shell history:

```sh
chmod 700 private
chmod 600 private/production-rehearsal.env
$EDITOR private/production-rehearsal.env
```

Set only these two values in `private/production-rehearsal.env`:

```dotenv
PRODUCTION_REHEARSAL_TURSO_URL=libsql://<production-database-host>
PRODUCTION_REHEARSAL_TURSO_TOKEN=<read-only-token>
```

The protected directory and file must remain private to the current user. The loader checks the token's read-only claim and endpoint fingerprint locally; the Turso server verifies the signature and enforces permissions. It rejects writer/DDL grants and an endpoint matching the locally registered development database. It accepts legacy `a=ro` tokens without an `exp` claim; if `exp` or `nbf` is present, it must be valid and current. Local claim screening does not verify the token signature, and the rehearsal never probes permissions with a write.

## Local development target pin

Local Prisma and migration commands require `private/development-target.json` before using a remote Turso URL. Its version 1 format stores only the SHA-256 fingerprint of the canonical HTTPS endpoint origin (a `libsql:` URL is normalized to `https:`); it contains neither the endpoint nor a token. The checked-in database policy additionally requires the approved non-production endpoint and token fingerprints, and always rejects the production endpoint outside the Production deployment. The current checkout already has this private registration. A different checkout must be pinned to its approved development endpoint before remote local access; missing registration fails closed. An existing local registration takes precedence even if Vercel variables are copied into the shell. See [database isolation](database-isolation.md).

Run the dedicated command:

```sh
npm run db:rehearse:production
```

The runner reads the credential file directly into an isolated object and makes a read-only snapshot into a newly created protected directory under ignored `private/production-rehearsal/`. It applies migrations only to the local SQLite copy, compares the preserved source values and reports safe row counts and hashes. Keep the source snapshot, manifests and detailed verification files private. Share only a reviewed aggregate report with no raw values or primary keys.

This command is not a production migration command. The normal Prisma runtime and `npm run db:migrate:turso` use standard development configuration and require the endpoint to match `private/development-target.json`; production credentials are never a fallback. The build has no migration hook. Full external smoke tests require both `--reviewed-production-access` and `PRODUCTION_SMOKE_REVIEWED_ACCESS=1` after a separate review. Do not set either for a preservation rehearsal.

## Credential status

A temporary test-fixture path error caused one failed local test diagnostic to include the configured read-only token. The fixture now uses an isolated temporary file, and the token was cleared from the local credential file. That failed test made no network request. Server-side token invalidation/rotation is still outstanding; do not use the exposed token again or run another rehearsal until token invalidation has been coordinated. Turso's [token invalidation command](https://docs.turso.tech/cli/db/tokens/invalidate) invalidates all database tokens and tokens in its group, so coordinate application/group credential rotation before using it; creating a replacement token alone does not invalidate the exposed token. The already completed successful snapshot remains the only production access in this integration.

Production writes and deployment remain held until an explicitly approved cutover has a separately reviewed writer procedure, a final frozen snapshot and matching before-manifest, and a rollback plan that restores the database backup and compatible application together. The read-only credential and `db:migrate:turso` are not substitutes for that writer procedure.
