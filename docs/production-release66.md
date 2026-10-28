# Online court availability release66

This release applies only `20261028000000_court_availability` to the verified 65-migration production database, followed by the matching application. The user authorized execution only without downtime: stop before any step that would require an outage or a traffic/write freeze. No maintenance mode, database freeze, token revocation, or old application rollback after court closure is authorized.

## Source and database pins

- Project `anti-selek`, `prj_qouB4g5zkv4d8nL2g4NjLfdvjfeY`, team `team_sS6kaZurbqCwtgU9VGhynSMR`.
- Existing live application at preflight: `acd06e0d8214d753a1a888e4114e5ca82a599c7d`; recheck the live aliases before applying.
- Production endpoint SHA256: `af6c24a4939dcfccb80220dffc4f164896015ca83380547609a3e29d178f6a6d`.
- Migration LF SHA256: `7fa23720fab0a714e93e12b7d77619f79e5f2c1646675453fdc22d21eeff5a33`.
- Expected schema SHA256, from release65 reader evidence: `369bc9bb34aa20d1f5fd8e12702a10201cdc3c753ce4333841575ab94c114062`. A fresh authenticated source must match before writes. Historical evidence alone does not authorize or establish the current state.

## Why overlap is compatible

The SQL appends `Court.isActive BOOLEAN NOT NULL DEFAULT true`, preserving all current column values, court IDs, match references, labels, scores and audits. Both old and new code behave the same while every court remains active. The new application checks availability at each assignment writer. A server-side activation gate holds court reductions until compatible writers serve all supported application URLs and older in-flight requests have drained. The rest of the app continues to work while this feature is held.

`COURT_AVAILABILITY_ENABLED` is a server-only Production setting. Keep it absent/false for the first matching deployment. Its absence must not block same-count settings saves or court additions. Activate it only after verifying the first deployment and retiring incompatible retained hosts; the next deployment then enables reductions. Both deployments understand `isActive`. Do not weaken existing access protections or change unrelated firewall rules. If old-host retirement would interrupt current public service, stop with activation held.

## Reviewed procedure

1. Commit the final application, writer, tests and this procedure. Obtain genuine independent reviews of the application/migration and the production writer, bound to the final commit and `REVIEW_FILES` hashes. The author's own review does not satisfy this requirement.
2. Verify current aliases, ready deployment, existing access restrictions and function durations through authenticated Vercel evidence. Check the public app remains available. Reconfirm the user's no-downtime condition at every operational boundary; do not replace a failed online precondition with maintenance.
3. Keep a fresh reader in protected ignored `private/production-rehearsal.env` with `PRODUCTION_REHEARSAL_TURSO_URL/TOKEN`. Keep a dedicated at-most-one-day writer in protected `private/production-release66/writer.env` with `PRODUCTION_RELEASE66_URL/TOKEN`. Never export them as application or development database variables. Preserve the existing credential ACL validation.
4. Use the finite `scripts/run-production-release66.mjs` runner with `--mode backup`, then `--mode rehearse`, `--release-commit <final-sha>`, a fresh `--attempt <name>`, and the exact `--confirm-endpoint-sha256` above. Backup is a consistent read transaction; rehearsal modifies only the new local copy. Verify concurrency behaviour appropriate to the actual Turso deployment before apply; short local DDL timing alone does not establish uninterrupted production saves.
5. Store protected `independent-review.json` and `approval.json` using the existing reviewed receipt formats. Approval must bind the final commit, plan hash, endpoint and the human instruction, including `noDowntime: true`. The runner rejects an approval without that condition. Use `--mode apply --approved-production-release` only after all prior evidence passes.
6. The writer reserves one normal write transaction. It checks schema, ledger and backup freshness; applies the pinned SQL; proves every old column/value unchanged and every existing court active; advances the Turso ledger; and writes `_production_release66_receipt` atomically. It never installs a persistent freeze. Application data changing since backup causes `BACKUP_STALE`, not a request to stop users from playing. Refresh backup/rehearsal naturally or leave the release held.
7. Verify with the reader using `--mode verify` and the same attempt. If commit acknowledgement is uncertain, inspect the immutable receipt before retrying. Deploy the exact reviewed application with reductions still gated. Reuse passing checks for unchanged code, and use the existing application build for the new gate.
8. Verify normal public reads and authenticated disposable test-session writes, and inspect fresh complete logs for the new deployment and migration window. After supported aliases and old-host restrictions are verified, wait the observed maximum old request duration plus margin while the app remains available. Recheck inventory and availability before setting `COURT_AVAILABILITY_ENABLED=true` for Production and deploying the same commit again.
9. In a disposable test session, confirm increase/decrease/reopen, playing-court rejection, preserved history/ratings and automatic assignment avoiding closed courts. Check fresh complete runtime logs for 500s and missing schema errors. Record final aliases, source, database receipt, activation and verification evidence. Remove expired release credentials while retaining protected evidence and backup.

## Recovery

Before commit, errors roll back the whole transaction. After a committed migration, retain the additive column and current data. While all courts are active, the old app is compatible. After any court closes, roll back only to the first compatible deployment with reductions gated, or fix forward. Never restore an old whole database over newer user activity. If safe recovery requires downtime, stop and report the actual state without taking the app offline.
