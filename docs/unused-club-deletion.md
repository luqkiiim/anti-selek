# Permanent deletion of unused clubs

An unused ordinary club can be deleted with its creator's local player profile
and offline placeholders. This includes placeholders that are still on the
roster or were removed, local starting/manual ratings, profile preferences and
the creator's access edits. Setup bookkeeping is cleaned up by deletion; it is
not a reason to refuse it. The actual club row is deleted so its name is reusable.
Login accounts and data in other clubs are unchanged.

Actual hosted/test/shared sessions, match or queue references, profiles shared
with other clubs, other registered accounts, admissions/invitations and identity
relationships remain protected. Deleting an unused club does not authorize
erasing another club's data or an account's sporting history.

The service reserves the writer before reading the account, authority and
eligibility. Active local ADMIN/OWNER permissions and the existing global-admin
capability apply; exact DELETE confirmation is required. Retries work for the
original actor, creator or global admin with an active account. Other callers
receive the usual invalid-target response.

## Database cleanup

Migration 20261021120000_delete_unused_clubs introduced the deletion receipt
and guarded cleanup. The forward correction
20261021180000_delete_unused_placeholders adds nullable cleanupJson, makes
the setup view return one row per club, and allows local offline placeholders
regardless of archive state or number of setup events.

The service inserts a snapshot selected from the database. The receipt guard
validates that it matches the entire current local roster, ownership events and
manual rating adjustments. The same statement removes local ownership events,
rosters, access, the club and its unused player profiles. Full ownership and
rating audit payloads stay in the immutable receipt, so those records no longer
hold foreign keys to profiles that the user wants deleted. They cannot become
user-visible deletion blockers. Deleted IDs cannot be reused. Any failure rolls
back every row and the receipt.

The new migration changes no existing values. Historical receipts get only a
new NULL field. The previously deployed service can still delete the original
creator-only/empty case without the new snapshot. Deletion involving extra
placeholders requires the matching new app. Direct unaudited deletion remains
blocked.

## Verification and release

Integration tests use the real create-player, remove-player and delete-club
handlers on both SQLite and libSQL. They cover mixed active/removed placeholders,
manual starting ratings, physical cleanup, preserved accounts/other clubs, name
reuse, exact audit snapshots, forged/missing snapshots, ID reuse, permissions,
rollback, sessions/shared profiles and concurrent writers. Migration checks
compare every original table/column value, including old deletion receipts and
credentials, then check foreign keys and integrity.

The original migration and app are live. This forward correction requires a
separately reviewed, explicitly approved production migration and matching
deployment; a normal build or push never applies migrations. Reuse the release64
procedure with fresh finite pins and preservation of original receipt columns.
Do not run that historical writer against migration65 or repurpose development
credentials. Follow [database-release-policy.md](database-release-policy.md).

After release, smoke create club → add placeholder → remove placeholder → delete
club → recreate the name. Verify physical cleanup and fresh runtime logs. Keep a
backup and the migration receipt. Do not restore an old database over later user
activity. Reverting the app stops the expanded deletion path and remains schema
compatible; it does not restore already deleted clubs.
