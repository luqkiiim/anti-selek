# Placeholder cleanup correction: release65

Prepared only. This correction is not approved for production by the previous
completed release64 approval. No production write or deployment has occurred.

Use the existing reviewed release64 sequence, with this finite release65 runner.
Do not invoke or edit historical writers. The database remains at 64 migrations
and the expected app/source is main 4c3dde88e78881df041883f9d157323859682a52.
Recheck those facts before any release action.

## Pins and preservation

- Project anti-selek: prj_qouB4g5zkv4d8nL2g4NjLfdvjfeY.
- Team luqkiiims-projects: team_sS6kaZurbqCwtgU9VGhynSMR.
- Production alias: antiselek.com.
- Endpoint SHA256: af6c24a4939dcfccb80220dffc4f164896015ca83380547609a3e29d178f6a6d.
- SQL 20261021180000_delete_unused_placeholders, LF SHA256:
  9363c4f1e7dd26573eee3abffc31a9dbe5eb8c9874e8cfe3713a2ccf858b3b6e.
- Predecessor schema SHA256, from release64's authenticated final verification:
  af8b7a40db3c4881d9930ef64fa17d441f3298116409e87b0117e46b8bba3ce4.

The only existing-table change is nullable ClubDeletionReceipt.cleanupJson.
Every original column/value, old deletion receipt and historical release table
must be preserved. The writer projects only that new column out of the before/
after hashes, and independently requires it to be NULL for all existing receipts
immediately after DDL. Rehearsal and writer verify the complete expected schema,
64-entry predecessor ledger, 65-entry resulting ledger, integrity and foreign keys.
No application rows are deleted by installing the migration.

The original app remains compatible for its creator-only/empty deletion case.
New placeholder cleanup requires the new app and full snapshot. Until it is
deployed, attempts at the expanded case are rejected. The migration and writer
are atomic and preserve existing behavior for other routes. Use the compatible
online procedure reviewed for release64; preserve existing firewall rules.

## Reviewed release sequence

1. Finish focused tests/build and separate application/migration and writer
   review of the changed bytes. Commit the final source. Bind protected
   independent-review.json to that commit, exact ordered REVIEW_FILES hashes,
   two independent reviewers and both review scopes.
2. Obtain explicit user approval for this correction. Save approval.json with
   approved, final commit, planSha256, endpoint and that actual instruction.
   A runbook or an author's claim of approval is not authorization.
3. Use fresh read-only credentials only in private/production-rehearsal.env;
   use a dedicated at-most-one-day writer only in
   private/production-release65/writer.env (PRODUCTION_RELEASE65_URL/TOKEN).
   Enforce the existing private ACL/reparse guards. Do not export application
   credentials or change development pins. No credentials are currently present
   for this release.
4. Run scripts/run-production-release65.mjs with --release-commit <final-sha>,
   --attempt final1 and --confirm-endpoint-sha256 <the pin above>. Run the modes
   backup, rehearse, apply, verify in order. Apply additionally requires
   --approved-production-release. Fresh backup/rehearsal must be less than
   15 minutes old, and all baseline data except transient RateLimitBucket must
   still match under the writer reservation. Every table, including buckets, is
   checked unchanged across DDL. Stale data stops before commit; use a new attempt.
5. Reader verification must confirm phase65 before pushing the exact reviewed
   commit to main without force. Wait for READY on the correct project/source
   and all production aliases. A concurrent main update requires integration.
6. In the normal signed-in app, create a uniquely named disposable club, add
   offline placeholders, remove one, delete the club, recreate the name and
   clean up. Confirm local profiles/events were removed with their snapshots in
   the receipt, and existing account/other-club data are unchanged. Read an
   existing club/session and inspect fresh complete runtime/request logs for
   500s and missing-schema errors. Save protected aggregate evidence.

Rollback before commit restores schema/data/ledger together. For uncertain
acknowledgement, verify the same attempt first; the writer reconciles using the
exact receipt/schema without blindly replaying DDL. Verification can be repeated
and writes timestamped evidence. If app rollback is needed, keep schema65 and
post-release data; the prior app simply lacks expanded placeholder deletion.
Never restore an old whole database over new user activity. Remove temporary
credential files after verification; keep the protected backup/release evidence.
