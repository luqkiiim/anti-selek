# Club collaboration release63 — online-first revision

The user requested on 17 October 2026 that migrations favour zero downtime when appropriate. This replaces the proposed default maintenance cutover with a staged online design governed by [the database release policy](database-release-policy.md). It does not authorize production writes.

## Current decision and evidence

Prefer an online rollout for this release, subject to the readiness gates below. The application upgrade and additive SQL are implemented, but the online writer and activation controls are not yet implemented or independently approved. Do not run the existing maintenance commands as if they were online commands.

The existing migration `20261015123000_upgrade_club_collaboration` adds columns, two empty tables and indexes without changing historical values. Its current SQL SHA256 is `6192f2dcdbae1a23767aceb00e171dfb9cae716a935a7e2760c4ab228d09af5c`. The read-only production rehearsal preserved all 8,473 original rows, verified legacy defaults and passed integrity/foreign-key checks. This proves preservation on that snapshot; it does not prove concurrent availability.

The previous reviewed application/tooling commit was `2bb992a6ea49babb708317886e0eb0812503542d`. Production remained at `b3abc7cd62d6e51ade78e4b6b7582fd620030139`, deployment `dpl_J1p3wRAcq8PsHKeoXppdoVq9vdo4`, when last inspected. Recheck this binding before executing a new plan. Existing review receipts and rehearsals remain historical evidence; changed source and the online procedure require new exact-source review.

## Staged online sequence

1. **Prepare compatibility and activation controls.** New collaboration behavior must stay disabled at the server while old application requests can still execute. Existing ordinary and legacy sessions must continue working. Decide and test how legacy collaboration creation remains available during this stage; do not silently downgrade a request for Lineup, best-of-three or Unrated. The current creation service immediately enables version2 and cannot be used unchanged for this rollout.
2. **Expand the schema with the old app live.** Use a dedicated, independently reviewed online writer for the pinned additive migration. Take a fresh consistent read-only backup, then validate the current schema/ledger within a serialized transaction. Preserve all data present at transaction start, including legitimate writes since the backup. Commit the migration and an unambiguous receipt atomically. No project-wide HTTP fence, persistent table-blocking triggers, or stale-backup equality requirement belongs in this online path.
3. **Verify the expansion while traffic continues.** Check the exact schema/ledger receipt, integrity, old-application operations and fresh runtime logs. Reconcile an uncertain commit through the receipt before retrying. Do not deploy an application that requires missing schema, and never infer migration success from a build.
4. **Build and verify the new application with activation disabled.** Prepare the exact reviewed deployment without sending public traffic to unverified code. Verify compatibility and protected smoke. Then promote it to all public aliases. A Git push must not accidentally activate the feature or promote an unverified build; the reviewed operator must explicitly control the project's actual Git/deployment behaviour.
5. **Retire incompatible execution without taking public service offline.** Preserve historical access restrictions and deny old immutable/preview hosts while keeping public aliases on the new deployment. Inventory all deployments and background writers. Verify the bound new deployment and aliases, then allow enough time for all incompatible in-flight requests to finish, based on observed runtime limits. This is an old-request drain while new requests continue, not a global traffic drain. Revalidate immediately before activation.
6. **Activate upgraded collaboration.** Enable the server-side gate only after compatibility, old-host isolation, drain, schema and runtime evidence pass. Record the actor, release/activation revision and evidence. Direct API calls and stale clients must not bypass the gate or misinterpret new-format results.
7. **Verify public behavior and recovery controls.** Check Lineup and Free play, own-club permissions, best-of-three and rated/unrated handling through normal authorized accounts, plus fresh logs for errors and missing schema. Do not manufacture production login sessions. Report any unavailable authenticated coverage. Revoke the dedicated writer after completion.

## Readiness gates still to implement and validate

- A server-side activation mechanism that cannot be bypassed by old/new clients, with safe behaviour before activation and after a creation disable.
- A dedicated online writer with current-transaction preservation, a bounded lock budget, exact receipt reconciliation and no all-table freeze. The existing full-table remote snapshot inside the frozen writer must not simply be reused without measuring its lock cost.
- Old/new application concurrency tests, including real driver busy/timeout handling, stale prepared statements, idempotency, acknowledgement loss and active matches. A SQLite snapshot-only test cannot establish Turso runtime availability.
- Deployment promotion and old-host isolation controls that keep active public traffic available and account for all in-flight jobs. No new-format sessions before the final activation gate.
- An exact-source independent review and explicit approval of the concrete online writer, deployment/promotion/activation operations, and recovery procedure. No production migration/deployment/activation has occurred.

## Recovery and maintenance fallback

Before feature activation, keep the compatible old application serving if the online writer or new build fails; reconcile schema state before retrying. Do not drop the additive schema or restore an old snapshot over live writes. If promotion fails, only a proven compatible deployment can be restored.

After activation or creation of any upgraded records, disable new creation if necessary but continue servicing existing upgraded sessions with compatible code. The original predecessor cannot safely score best-of-three/unrated fixtures or enforce the new club ownership rules. Recover forward or use a separately proven compatible rollback build.

If lock/availability or compatibility gates cannot be met, explain the specific blocker and request approval for a maintenance window. The [previous maintenance procedure](production-release63-maintenance.md) and `scripts/run-production-release63.mjs` / `scripts/production-release63-vercel.mjs` are retained only as a maintenance fallback. Their review does not authorize this online design. Do not remove their freeze guards to turn them into an online writer.
