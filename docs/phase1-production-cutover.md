# Phase 1 production cutover procedure

**Preparation only. Production migration and merging `main` remain held.** The operator must obtain explicit cutover approval after credential rotation and every prerequisite below has been verified. An authenticated CLI, a historical rehearsal, or a prepared writer does not authorize production mutation.

## Credential rotation comes first

Keep `.env.local`, the registered development target, Preview credentials, and the disabled production rehearsal mechanism unchanged. Do not reuse the compromised rehearsal token. No writer credential may be created until server-side invalidation covering that credential has completed.

Identify whether the exposed credential is database-scoped or a legacy group token before choosing invalidation. There is a material discrepancy: [Turso's documentation](https://docs.turso.tech/cli/db/tokens/invalidate) describes group-wide impact, while the [official v1.0.33 CLI implementation](https://github.com/tursodatabase/turso-cli/blob/v1.0.33/internal/cmd/db_invalidatetokens.go) rotates database credentials and explicitly says group tokens remain valid. Do not assume a database-only rotation invalidates an older group token, or assume a group-only rotation invalidates newer database credentials. If the original credential's scope cannot be established, require verified invalidation of both relevant scopes and coordinate every affected consumer first.

The production database is `anti-selek` in `luqkiiim/default`. Group membership also includes other databases; changing group credentials requires their consumers to be coordinated. Merely minting a new token does not resolve exposure. An unknown token scope or an unprepared active consumer blocks invalidation.

Prepare this sequence without exposing secret values:

1. Confirm authenticated production authority, affected scopes/consumers, all configuration destinations, and an update/rebuild procedure before invalidating anything. Stop Laptop A's production access. Preserve old configuration privately for incident evidence; never reuse the exposed rehearsal credential.
2. Freeze affected application traffic and drain in-flight functions during the rotation window. Hold automatic production deployments. Coordinate other consumers if group invalidation is needed.
3. Invalidate the required database/group credentials through Turso account authority. Save the sanitized acknowledgement. **Generate replacement credentials afterward**, so they are signed with the current keys.
4. Generate an Anti-Selek database-scoped application credential, a separate short-lived read-only snapshot credential, and a separate short-lived database writer only after invalidation. Do not use `--group` for replacements. Capture CLI output directly to protected files or memory; never to chat, terminal output, command arguments or tracked logs. Use at most one day for cutover reader/writer expiry; one hour is preferred.
5. Update only Anti-Selek Vercel **Production** `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN`. Leave `PREVIEW_TURSO_*` scoped only to Preview, and Development on SQLite. Each other affected service needs its own replacement/update if group keys changed. Laptop A must receive fresh credentials or remain disconnected with its old access invalidated.
6. Rebuild the existing legacy application commit with the replacement Production environment. A project environment edit does not update existing immutable deployments. This credential-only deployment must still run the old schema-compatible application; it is a separate operation from the later Phase 1 deployment.
7. Verify server-side rejection of old credentials without writing data. Do not retrieve/reuse the exposed token to perform a probe: use the relevant invalidation acknowledgement and, where available, an old non-exposed credential of the same scope/key generation for a read-only rejection check. Record any limitation instead of claiming a direct compromised-token probe occurred. Verify replacement application connectivity and Preview isolation. Reopen the legacy application only after credential rotation succeeds.

Turso CLI login-session invalidation is a separate operation. `turso auth logout --all` invalidates account CLI sessions; it does **not** complete database/group token rotation. Complete CLI sign-in outside Codex's browser because the authentication callback can contain a credential in its URL.

## Narrow writer and private artifacts

`npm run db:cutover:production` is an explicit local operator command. It is not called by builds, Prisma development commands, the application or tests. The existing development migration command and default database selection are unchanged.

The writer reads SQL from an exact committed revision descended from reviewed feature commit `411281bd560f74706db7b8b788575fc9bcbc0f23`. It also requires the four migration files to match that reviewed revision. It never executes an arbitrary SQL file or uncommitted migration. These are the complete approved changes, in order:

1. `20261004120000_separate_accounts_players`
2. `20261005120000_preserve_legacy_creator_access`
3. `20261005180000_player_invitations`
4. `20261005190000_cleanup_player_invitation_continuations`

All four SQL files and ledger insertions share the separation migration's existing transaction. A failed statement causes the batch to be rolled back rather than leaving a partially migrated application schema. The ledger must contain the known legacy baseline and either zero or all four Phase 1 migrations; unknown or partially applied migrations are refused. An already-applied chain is verified without being reapplied.

Live access requires all of these independently verified prerequisites:

- explicit `--production-cutover`, outside Vercel and test execution;
- a clean checkout at the approved exact commit, unchanged remote `main`, and compatible ancestry;
- protected `private/production-cutover.env` with exactly `PRODUCTION_CUTOVER_TURSO_URL`, `PRODUCTION_CUTOVER_WRITER_TOKEN`, and `PRODUCTION_CUTOVER_READER_TOKEN`;
- the checked-in production endpoint pin, separate approved token fingerprints, database writer permissions and genuinely read-only reader permissions;
- protected `private/production-cutover-approval.json` version 1, including `approvedCommit`, `expectedMainCommit`, `productionEndpointSha256`, `writerTokenSha256`, `readerTokenSha256`, `freezeCheckedAt`, and `blockedLegacyUrls`;
- all receipt gates explicitly true: `rotationVerified`, `compromisedCredentialRejected`, `vercelProductionCredentialsVerified`, `laptopAProductionCredentialsVerified`, `previewIsolationVerified`, `rollbackRestoreVerified`, `deploymentHoldVerified`, `writesFrozen`, `laptopAWritesStopped`, and `functionsDrained`.

The receipt is an operator attestation, not automatic evidence. Set a gate only after its external condition is verified and recorded. Laptop A's credential gate may mean fresh access is verified **or** production access is retired and old credentials are invalidated. Merely knowing where credentials are stored is insufficient. No approval receipt or writer credential is created by the repository tooling. File permissions must be `600`, directories `700`, inside ignored `private/`, with no credential symlinks. Snapshots, detailed manifests and logs remain private and excluded from deployment uploads.

## Historical offline rehearsal

Before rotation, this command can test the whole chain against an existing protected SQLite snapshot, without loading credentials or contacting production:

```sh
npm run db:cutover:production -- \
  --rehearse-snapshot private/production-rehearsal/snapshot-jh6Yz0/source-snapshot.db \
  --approved-commit 411281bd560f74706db7b8b788575fc9bcbc0f23
```

It writes only a new snapshot copy, manifest and aggregate report. A historical pass is **not** a fresh frozen production backup and cannot satisfy the live writer's final-snapshot requirement.

## Approved cutover sequence

1. Re-fetch `origin`, verify exact feature/main revisions, rerun source tests, TypeScript, Prisma validation, lint, build and preservation tests. Verify the live Production deployment matches the expected legacy commit. Verify rotation is resolved and the old rehearsal file remains unusable.
2. Confirm an account-authorized backup restore/import path and database quota are available. Rehearse restoring a protected snapshot into an isolated disposable recovery database and compare its legacy manifest. Record that drill before setting `rollbackRestoreVerified`; an untested recovery plan blocks the writer.
3. Hold automatic Production Git deployments with a verified project-specific hold, and cancel/drain any pending Production deployments. Save the prior setting for restoration. Do not change Preview credentials or merge `main` during this stage.
4. Freeze **every legacy deployment** that could reach production, including immutable deployment URLs, production aliases/custom domains, old Preview hosts and any direct clients. Use Vercel's project firewall to deny all requests to those hosts, not just HTTP mutation methods: old GET/auth flows can also write. Retain the existing unsafe-Preview firewall rule. Stop Laptop A/direct scripts and drain already running functions before recording the freeze. A denied homepage alone is not proof that an incomplete host inventory is safe.
5. Create the verified private approval receipt and protected fresh credentials. Take a final consistent read-only snapshot and rehearse all four committed migrations on its copy:

   ```sh
   npm run db:cutover:production -- --production-cutover --snapshot
   ```

   This opens a read transaction on production using **only the dedicated reader**, saves `source-snapshot.db`, records the before-manifest and SQL hashes, and applies SQL only to `rehearsal.db`. Require all preservation/integrity/schema checks to pass. Keep the original snapshot untouched. The receipt and snapshot must be less than one hour old.
6. Apply the exact chain after explicit approval:

   ```sh
   npm run db:cutover:production -- --production-cutover --apply --run private/production-cutover/<final-run-directory>
   ```

   Before the sole writer batch, the command checks the same receipt, source hash, migration hashes, remote `main`, host denials and a fresh read-only production manifest. Any source change after the frozen snapshot aborts. It repeats the exact-snapshot rehearsal. Afterward it takes a fresh read-only snapshot and verifies preservation, accounts/access/ownership, expected schema objects, ledger, foreign keys and integrity. Failures leave writes frozen and `main` unmerged.
7. Only after schema verification, restore the deployment hold, safely merge the approved branch to current `main`, and push once. Watch the resulting Git-triggered Production deployment until READY and verify its exact Git SHA. Do not also trigger an independent deployment. The firewall continues to block old code; the new code is built only after its schema exists.
8. Permit controlled smoke access to **only the new verified deployment**, while legacy immutable hosts stay denied and general writes remain closed. Verify login/account resolution, existing Player history, clubs and ADMIN/OWNER/STAFF/MEMBER access, sessions, historical matches, unchanged ratings/leaderboards, safe new-data creation, generic admissions/claims, quick access, invitation administration/continuation cleanup and scoring using designated test data. Never claim a real user's Player just for testing. Inspect fresh Vercel runtime logs for 500s and schema/Prisma errors. Save the smoke time window and sanitized results.
9. Reopen the current Production aliases only after all checks pass and they route to the matching new deployment. Keep incompatible legacy deployments permanently blocked. Restore normal automatic deployment behavior, verify health, retain the protected backup/reports, and leave Preview/local isolation unchanged. Laptop A stays disconnected until explicitly reconfigured and verified.

These external hold/firewall/smoke operations are coordinated by the operator. The writer does not manage Vercel or Git, reopen traffic, or grant approval. The receipt and `HEAD` status checks supplement that procedure; they cannot substitute for a verified deployment inventory and drain.

## Rollback with a compatible database/application pair

**Before SQL commit:** Keep the freeze and deployment hold. Roll back the migration transaction, inspect the ledger/schema, and compare a fresh read-only legacy manifest to the final frozen snapshot. Do not reopen until the old application still has the old schema and valid rotated credentials. A transport error can make commit status uncertain: inspect ledger/schema before retrying rather than assuming no changes were made.

**After SQL commit or a failed deployment/smoke:** Keep every host frozen, stop further deployments/direct clients, and do not activate old code against the migrated database. Restore the untouched **final frozen** snapshot into a new recovery Turso database, using the account-authorized import procedure tested in the recovery drill. Turso supports importing a SQLite file with `turso db create <approved-recovery-name> --from-file <protected-source-snapshot.db> --group <verified-group> --wait`. This is a separately authorized production recovery operation, not a development migration command.

Compare the restored legacy manifest/schema/ledger and integrity checks to the final backup. Update only Production's database URL/token to the verified recovery database, then rebuild/deploy the preserved legacy `main` revision with those fresh environment values. The new recovery endpoint requires explicit target-policy review before any later Phase 1 cutover; never silently replace the development pin or weaken the current production writer's endpoint checks. Verify the legacy app and restored database together before reopening writes. Preserve the failed migrated database for diagnosis.

Do not rely on Instant Rollback alone: [Vercel restores the previous deployment's environment](https://vercel.com/docs/instant-rollback), which may include invalidated credentials. A compatible schema, application revision and fresh configuration must be verified together. Once writes have reopened, restoring the pre-cutover snapshot can lose newer data; freeze again and obtain an incident-specific recovery decision rather than discarding later writes automatically.
