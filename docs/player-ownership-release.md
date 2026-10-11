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

## Production release procedure — held

This adds migration **20261011120000_audited_player_ownership_release** after the verified 59-migration baseline. It creates two audit tables, one authorization view, adds guarded unlink/audit triggers, and replaces only the owner immutability and invitation state guards. It performs no existing row update when applied.

Do not use the development Turso migration command or repurpose the pinned release-59 writer. Do not deploy this application before the new schema exists: the new revoked-access path queries the authorization view.

Before release, independently review the migration and writer procedure, rehearse it on a protected production copy with complete before/after row preservation and foreign-key checks, and pin the reviewed source and SQL hash. The current investigation contains only bounded read transactions; it has not exported a complete production snapshot.

Once explicitly approved, use the production-only writer procedure with a coordinated write freeze, verify the current project/endpoint and the exact predecessor, back up the database, apply the additive migration transactionally and record the migration ledger/checksum. Verify the resulting schema, preserved existing rows and foreign keys, then deploy the matching application. Check fresh runtime logs and smoke the visible disconnect/normal-claim flow before thawing writes.

Do not run a rollback that discards the new audit tables after releases have occurred. Prefer a forward fix; the former owner is retained in the audit if a separately approved restoration is ever needed.
