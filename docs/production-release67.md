# Online session sharing release67

Prepared for review. Production apply and the matching push to main remain held
until explicit user approval of this writer procedure. The request to push main
authorizes preparing the release; it does not bypass the production migration
approval required by AGENTS.md.

The release applies only `20261102000000_session_details` to the verified
66-migration production database. It adds seven nullable Session fields and two
nullable Court booking fields. Existing application versions safely ignore these
fields. Court availability, session settings, all previous values and history
are preserved. No maintenance window, traffic freeze or token revocation is needed.

## Pins

- Project `anti-selek`, `prj_qouB4g5zkv4d8nL2g4NjLfdvjfeY`, team `team_sS6kaZurbqCwtgU9VGhynSMR`.
- Predecessor main: `21ea79cae5544d3d476e937ae77fb0f85f03cdf9`.
- Production endpoint SHA256: `af6c24a4939dcfccb80220dffc4f164896015ca83380547609a3e29d178f6a6d`.
- Authenticated predecessor schema SHA256: `eba7799ef3dac3dea71d6f4c61537e265d51f974bef07d19438d1f21a9c7b18f`.
- The runner pins the migration SQL, previous migration bytes, reviewed source
  hashes and final commit. Recheck live aliases and remote main before apply.

## Procedure

Reuse release66's tested online backup, rehearsal, atomic apply and verification
sequence through the finite release67 sibling runner. Historical writers remain
unchanged. Independent review covers only the new application/migration changes
and the affected writer differences from release66.

1. Complete the merged application checks/build and independent application and
   writer reviews. Bind `private/production-release67/independent-review.json` to
   the final commit and REVIEW_FILES hashes. Obtain explicit approval of this
   additive online migration and matching production deployment; save its actual
   instruction in the protected `approval.json`, with `noDowntime: true` and the
   final commit, plan hash and endpoint. Do not infer approval from this document.
2. Keep a fresh read-only token only in protected ignored
   `private/production-rehearsal.env`. Use a separate at-most-one-day writer only
   in protected `private/production-release67/writer.env`, with keys
   `PRODUCTION_RELEASE67_URL/TOKEN`. Never export either as application or
   development credentials.
3. Run `node scripts/run-production-release67.mjs` with modes `backup`, `rehearse`,
   `apply`, then `verify`, using `--release-commit <reviewed-sha>`, a fresh
   `--attempt <name>` and `--confirm-endpoint-sha256 <pin above>`. Apply additionally
   requires `--approved-production-release`. Backup/rehearsal must be under 15
   minutes old. Reuse the completed offline evidence when only a fresh backup is
   needed by the existing writer.
4. Apply checks current schema/history and all non-transient data under one
   normal reserved write transaction. It executes the nine ALTER statements,
   proves existing rows unchanged and new fields NULL, then appends the ledger
   entry and exact `_production_release67_receipt` atomically. Closed courts stay
   closed. Legitimate activity since backup causes BACKUP_STALE; refresh naturally
   rather than stopping users. No persistent freeze or new rollout framework is used.
5. Reader verification must confirm phase67 before pushing the reviewed source
   to main without force. A changed remote main requires integration and review
   of the affected differences. Wait for READY on the expected source and live
   aliases. The normal build checks schema without applying migrations.
6. Verify existing session reads and a disposable sharing/details flow, then
   inspect fresh Vercel logs for 500s or missing schema errors. Keep protected
   backup, receipt and verification evidence; remove temporary credential files.

Before commit, errors roll back schema, data and ledger together. On uncertain
commit acknowledgement, inspect the exact immutable release evidence before any
retry. After commit, retain the additive fields and new user data when rolling
the application back to the existing compatible main deployment. Never restore
an old whole database over newer activity. If an unexpected step needs downtime,
stop and leave the live app serving its existing version.
