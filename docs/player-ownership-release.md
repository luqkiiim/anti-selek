# Disconnect a removed Player's account

An admin can disconnect a removed Player from its Account without deleting or retiring the Player. The Player becomes an unclaimed placeholder. Its ID, roster rows, raw timestamps, ratings, matches, score attribution, partner history, achievement eligibility and prior audits are unchanged.

The normal invitation flow then links the same original unclaimed Player to that Account. There is no account eligibility picker or new correction invitation in the unclaimed Player panel.

## Product flow

- Future removal: choose **Also disconnect the account** in the removal confirmation. Archival, revocation and unlink happen in one transaction. A failed unlink rolls back the removal.
- Already removed: open **Removed players**, select the Player and choose **Disconnect account**. This performs no second removal.
- Open the original unclaimed Player, choose **Invite player**, and share the normal link privately.
- The recipient signs in and chooses **Claim my profile**. The claim restores MEMBER access only in the inviting club when its exact revoked access revision matches the disconnect audit.
- A pre-existing authorized invitation can be revoked by its exact ID before creating a normal link.

## Authority and preservation

This is an explicit admin action, not an automatic side effect of removing every member. The actor needs current local ADMIN or OWNER access in every club containing the source Player. Every source roster must already be archived, with the former account's access revoked. Club owners, retired Players, unfinished participation, active identity invitations and pending profile requests are blocked. Platform admin status alone is insufficient.

The retirement inventory remains unchanged. History-bearing Players can be disconnected because their records are retained, rather than retired. No history is merged, transferred, deleted or recalculated.

The release audit captures the former owner, actor, source Player, initiating club, exact access revision and the original archived roster snapshots. Its insert trigger validates authority and applies the unlink atomically. Terminal audit records cannot be changed, deleted or replaced. Existing owner reassignment remains forbidden; only the audited transition to NULL is permitted.

The claim authorization view recognizes a later normal invitation in the initiating club. Changed access revisions, earlier links and used release receipts do not authorize another restoration. One claim receipt records the recipient, release and invitation. Redemption retries return the existing result without granting access again after a later revocation.

## Local evidence

The focused identity/API/UI suite passes 270 tests on the 60-migration schema. Two additional migration preservation cases pass on SQLite and libSQL: every populated predecessor row remains identical, foreign keys remain valid, and the new audit tables start empty. New cases exercise preservation of history-bearing multi-club Players, archived ownership synchronization, cross-club authority, stale invitations, later revocations, direct SQL audit forgery, atomic removal/disconnect, legacy invitation revocation and transaction rollback when receipt insertion fails. Prisma schema validation, TypeScript, scoped lint and the production build pass. The new transition statements compile with SQLite expression depth limited to 100.

The browser flow was completed with synthetic data: an admin disconnected an already removed Player, created a normal invitation, switched to the recipient Account, and claimed the original Player. The database confirmed the original Player ID and rating, one release audit, one claim audit, MEMBER access restored only in the inviting club, and the other club remaining revoked. The development/build runs used a temporary Turbopack root to resolve this worktree's dependency junction; that local-only configuration was removed from the source diff.

The separate release writer and evidence gates pass 26 synthetic tests, including libSQL transactions, rollback, stale backups, lost freeze/migration/thaw acknowledgements, partial fences, receipt tampering, complete host inventory, concrete alias checks, provider JSON key ordering and fresh read-only smoke/runtime evidence.

## Production release procedure

This adds migration **20261011120000_audited_player_ownership_release** after the verified 59-migration baseline. It creates two audit tables, one authorization view, adds guarded unlink/audit triggers, and replaces only the owner immutability and invitation state guards. It performs no existing row update when applied.

Do not use the development Turso migration command or repurpose the pinned release-59 writer. Do not deploy this application before the new schema exists: the new revoked-access path queries the authorization view.

Before release, independently review the migration and writer procedure, rehearse it on a protected production copy with complete before/after row preservation and foreign-key checks, and pin the reviewed source and SQL hash. A read-only production snapshot rehearsal preserved all 7,959 rows in 29 existing tables, with 90 permanent triggers, five views, integrity `ok` and no foreign-key violations. A fresh snapshot is required after draining HTTP traffic so that the writer rejects stale copies.

Once explicitly approved, use the production-only writer procedure with a coordinated write freeze, verify the current project/endpoint and the exact predecessor, back up the database, apply the additive migration transactionally and record the migration ledger/checksum. Verify the resulting schema, preserved existing rows and foreign keys, then deploy the matching application. Check fresh runtime logs and smoke the visible disconnect/normal-claim flow before thawing writes.

Do not run a rollback that discards the new audit tables after releases have occurred. Prefer a forward fix; the former owner is retained in the audit if a separately approved restoration is ever needed.

### Dedicated release-60 commands

The new `scripts/run-production-release60.mjs` is independent of the release-59 writer. It uses the committed source, the unchanged 59-migration predecessor, production endpoint fingerprint, known baseline schema and migration SQL checksum `cfebd9e1866e7df092999d29e926ccdae9c8225f5453570f1e46d176b788eec9`. Every stage requires `--release-commit <reviewed SHA>` and `--confirm-endpoint-sha256 af6c24a4939dcfccb80220dffc4f164896015ca83380547609a3e29d178f6a6d`. Mutations also require `--approved-production-release`.

1. Inspect the linked Vercel project `anti-selek`, team `team_sS6kaZurbqCwtgU9VGhynSMR`, current production commit and complete deployment inventory. Preserve both existing legacy-host deny rules and verify that there is no unrelated firewall draft.
2. Publish a temporary deny rule for all project traffic. Verify denial with the existing deployment-protection bypass on every production deployment host and production alias. Record the last complete observation and wait at least 330 seconds, exceeding the configured 300-second function timeout. Save independently reviewed, pinned `maintenance-evidence.json` under protected ignored `private/production-release60/`.
3. Run `--backup` using only the dedicated read-only `private/production-rehearsal.env`. Run `npm run db:rehearse:production -- --audited-ownership-release` with the same commit and endpoint pins. This explicitly selects the additive release-60 rehearsal; the command's legacy Account/Player rehearsal is unchanged. Source backup, restored copy and all manifests remain private with Windows ACL or Unix mode validation.
4. Run `--freeze`. The writer must match every baseline row, schema object and existing ledger entry to the fresh copy. It installs database INSERT/UPDATE/DELETE fences on every existing data table in one transaction. Run `--apply`: migration 60, fences for the two new tables, ledger entry and checksum receipt are one transaction. Run `--verify` read-only. Unknown commit acknowledgements are reconciled by reads, never blind replay; partial fence inventories stop the release.
5. Advance production to the exact reviewed source SHA and wait for its production deployment to be READY. While database writes remain frozen, permit only the matching protected deployment's unique host for read-only smoke checks. Add a permanent deny rule covering every prior production deployment's unique host; keep the two older deny rules. Verify the new source, aliases, old-host denials and fresh runtime logs. Save pinned `deployment-evidence.json`.
6. Run `--thaw` only after deployment evidence passes. Complete trigger removal is atomic and retryable, including a lost acknowledgement. Keep the HTTP fence until the database state is verified as fully thawed. Then remove only the temporary HTTP rule, publish, and verify the public site, new admin controls and fresh logs. Do not disconnect a real account as a deployment smoke test.

Credentials are never copied into application environment variables, builds or command arguments. The writer accepts only a production-specific, unexpired `rw` token expiring within 24 hours. Builds and the development migration command never invoke this release script. Any uncertainty leaves the HTTP fence in place until reconciled.
