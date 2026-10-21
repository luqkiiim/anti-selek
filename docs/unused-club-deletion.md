# Permanent deletion of unused clubs

An unused ordinary club can be deleted, along with its creator's automatically
created local player profile. The login account and profiles in other clubs are
unchanged. Deleting the actual club row frees its name for reuse.

The only permitted roster is the creator's initial local profile, with its
original OWNER access and initial automatic CLAIM. A genuinely empty club with
no roster also qualifies. Hosted, test and shared sessions (including pending
collaborations), other players/access, admission or invitation history, rating
changes, shared profiles, identity relationships and other sporting references
block deletion. The service returns the specific blocker where available.

`deleteUnusedClub` takes the existing ownership writer reservation before
checking the authenticated account, current club access and eligibility. Current
local ADMIN/OWNER permissions and the existing global-admin capability apply.
The endpoint continues to require the exact `DELETE` confirmation. A successful
retry is allowed for the original actor, creator or global admin with an active
account; other callers receive the same invalid-target response.

The forward migration `20261021120000_delete_unused_clubs` changes no existing
rows. It adds shared eligibility/setup views and an immutable deletion receipt.
Inserting that receipt validates the exact live setup and atomically removes the
initial ownership event, roster/account connection, club access, club and unused
player. The full original setup event is retained as JSON in the receipt. Receipt
target IDs deliberately have no foreign keys to deleted rows. The actor remains
an Account foreign key. Deleted club/profile/roster IDs cannot be reused, so a
receipt cannot become a later deletion bypass. New clubs may reuse the old name
with fresh IDs. An error at any cleanup step rolls back the entire statement and
transaction, including the receipt. Direct unaudited deletions remain blocked.

## Verification

Focused integration tests run the real create/delete/list handlers against both
SQLite and the Prisma libSQL adapter. They cover physical cleanup, name reuse,
account/other-club preservation, typed confirmation, access failures, retries,
global admins, retained sessions/ratings/memberships, forged receipts, immutable
audits, deleted-ID reuse, failed-cleanup rollback and competing session/admission
writers. A migration test compares every existing table/row/column value before
and after installation, including a valid ownership event and password hash.
The settings component test checks confirmation, a rejected deletion and the
success callback. Existing read-store tests cover cache eviction.

## Production release remains held

This application requires the migration; a build or push does not apply it.
Migration first is compatible with the old app: its direct ordinary-club deletes
remain blocked. New application deletion requests require the new receipt/views.
Other application routes continue to use the unchanged existing schema.

Before production release, inspect the actual applied chain and prepare a finite
writer procedure for this SQL and the verified production target. Reuse the
existing maintenance procedure and guards where applicable, with independent
review of the migration and writer differences, exact source/SQL pins, explicit
user approval, a fresh backup and rehearsal on a local protected copy. Historical
release runners pin earlier manifests and must not be invoked for this migration.
The generic production rehearsal is disabled in current target policy; do not
enable it or repurpose development credentials to bypass those guards.

Verify the installed receipt/views/triggers and untouched original row values,
deploy the matching app, then smoke create → delete → recreate and inspect fresh
runtime logs. Use the existing coordinated maintenance window if the selected
writer requires it. No production migration, deployment or cutover is authorized
by the implementation request alone.

Recovery: stop further deletion requests and use a reviewed forward repair if
verification fails. Keep the receipt and backup. Never replay an uncertain writer
or restore an older whole database over newer user activity. Reverting the app
leaves the new database safeguards installed and stops ordinary-club deletion;
it does not restore already deleted clubs. Follow
[database-release-policy.md](database-release-policy.md).
