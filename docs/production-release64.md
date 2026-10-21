# Unused-club deletion production release64

This finite procedure installs migration `20261021120000_delete_unused_clubs`
(LF SHA256 `7c403265eb774893878cf5a1d38df6c2a641f3a757b5d77871fb1d8c1167a27a`)
on the existing 63-migration production database, then deploys the matching app.
The expected current app is main `596b368a4390d44375424aa57ee28992b7c5a9ba`.
Verify the actual project `anti-selek`, team `team_sS6kaZurbqCwtgU9VGhynSMR`,
project `prj_qouB4g5zkv4d8nL2g4NjLfdvjfeY`, production aliases and source before
any writes. The database endpoint fingerprint is pinned in the runner.
The authenticated preflight's complete predecessor schema SHA256 is
`2ed37ab6993be148424e52892ec8517f1e3495a64ec4988b95535fbdf4e6eb35`.

The user explicitly authorized production release and independent reviewers in
this chat. Record that approval and real reviewer evidence against the final
clean source commit and file hashes; this document alone is not approval.

## Compatibility and writer

The new schema changes no existing application rows or columns. The three
replaced deletion guards still reject all old-app ordinary-club deletes without
a validated new receipt. Existing app operations and older deployment hosts
remain compatible. The new application delete path requires the new schema.
Migration first therefore permits an online atomic DDL transaction without a
traffic fence or a persistent database freeze. Existing firewall restrictions
must not be changed or removed. If online preconditions fail, stop before writes
and prepare a reviewed brief maintenance alternative; do not weaken a guard.

The writer takes a serialized transaction, validates the exact 63-entry source
ledger/schema and the fresh backup/rehearsal's user-data hashes, applies only the
pinned SQL, verifies every original table's columns, row counts and value hashes
unchanged, advances the Turso ledger and adds a release receipt atomically.
RateLimitBucket may advance between backup and writer reservation because it is
transient request bookkeeping. It is still verified unchanged across migration
inside the transaction. All other baseline data changes cause BACKUP_STALE and
no migration is committed. Refresh backup/rehearsal under a new attempt name.

A lost commit acknowledgement is reconciled using a fresh read transaction and
the exact release receipt, SQL/source hashes, complete installed schema and
64-entry ledger. Never blindly replay an uncertain writer. The writer adds no
long-lived freeze and never changes application credentials or development pins.

## Preparation and commands

1. Reuse passing feature checks and builds for unchanged application code. Review
   the final migration/app and production-writer differences with independent
   non-author reviewers. `REVIEW_FILES` pins the writer and its imported helpers.
2. Create protected ignored `private/` and `private/production-release64/` with
   the repository's ACL requirements. A fresh one-day read-only token goes only
   in `private/production-rehearsal.env`, with the two standard reader keys.
   The separately scoped, at-most-one-day writer goes only in
   `private/production-release64/writer.env`, with `PRODUCTION_RELEASE64_URL`
   and `PRODUCTION_RELEASE64_TOKEN`. Never export either as application env vars.
   Do not run the disabled generic rehearsal or any historical release runner.
3. Commit the complete source. Save protected `independent-review.json` containing
   `passed`, final `commit`, exact ordered `fileHashes`, independent `reviewers`
   and scopes `application-migration` and `production-writer`. Save protected
   `approval.json` containing `approved`, `commit`, `planSha256`, `endpoint` and
   the human instruction authorizing this release. Recheck live source/project.
4. Run the runner with the final commit and a fresh attempt such as `final1`:

   ```powershell
   node scripts/run-production-release64.mjs --mode backup --release-commit <sha> --attempt final1 --confirm-endpoint-sha256 af6c24a4939dcfccb80220dffc4f164896015ca83380547609a3e29d178f6a6d
   node scripts/run-production-release64.mjs --mode rehearse --release-commit <sha> --attempt final1 --confirm-endpoint-sha256 af6c24a4939dcfccb80220dffc4f164896015ca83380547609a3e29d178f6a6d
   node scripts/run-production-release64.mjs --mode apply --release-commit <sha> --attempt final1 --confirm-endpoint-sha256 af6c24a4939dcfccb80220dffc4f164896015ca83380547609a3e29d178f6a6d --approved-production-release
   node scripts/run-production-release64.mjs --mode verify --release-commit <sha> --attempt final1 --confirm-endpoint-sha256 af6c24a4939dcfccb80220dffc4f164896015ca83380547609a3e29d178f6a6d
   ```

   Backup is a consistent read-only source snapshot. Local rehearsal proves
   preservation and complete expected schema; it never writes production. All
   outputs are exclusive new files. Rehearsal is valid for at most 15 minutes.
   If acknowledgement is uncertain, preserve evidence and rerun `--mode verify`
   with the same attempt/report before deciding on any retry. Verification
   outputs have exclusive timestamped filenames and require phase64.
5. After reader verification of phase64, push the exact reviewed commit to main
   without force. A concurrent main update requires integration and appropriate
   difference review; do not overwrite it. Wait for Git deployment READY on the
   verified project with that exact SHA and confirm production aliases.
6. Through the existing normal signed-in browser session, create a uniquely named
   disposable release-test club, delete it and recreate the same name. Verify
   the club chooser, normal existing club/session reads, and fresh runtime logs
   for the exact deployment/window, including 500s and missing-table failures.
   Do not impersonate accounts, manufacture auth cookies or delete a real club
   as a smoke test. Preserve protected runtime and aggregate DB evidence.

## Recovery and outcome

Before commit, errors roll back the entire transaction and leave phase63.
After commit, preserve the receipt/backup and fix forward on migration failures.
If the new application fails, the old reviewed app remains schema-compatible;
restoring that deployment disables ordinary-club deletion while preserving the
new schema and any legitimate post-release activity. Never restore an older
whole database over newer user data. Do not invalidate all database/group tokens.
Dedicated release tokens expire after one day; delete their local files after
completion according to protected evidence retention, keeping no secrets in Git.
Report the actual migration/deployment/verification state.
