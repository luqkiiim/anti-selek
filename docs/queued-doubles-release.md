# Queued doubles production release

The online migration adds two nullable columns to `QueuedMatch`. Existing lineups read with both values empty. The currently deployed app can serve the expanded schema while the Vercel build runs. The build checks the schema using read-only queries.

## Writer procedure for separate review and approval

1. Pin the tested commit, migration SQL hash, current live main deployment, and production Turso endpoint fingerprint. Using the protected read-only rehearsal credential, check the live migration ledger against the predecessor chain through `20261105000000_google_sign_in` and check that both new columns are absent. Take a fresh consistent backup and rehearse the exact migration against a disposable copy under `private/`. Verify existing queued lineups and database integrity.
2. With a separate short-lived writer credential, open one reserved write transaction using the existing libSQL release procedure. Recheck the endpoint pin before connection and the predecessor ledger and schema inside the transaction. Apply the two statements in `20261124000000_queued_doubles_type/migration.sql`. Compare the old queue columns and row count within the transaction, verify both new fields are null for existing rows, then insert the migration name and UTC apply time in `_turso_sql_migrations`. Commit schema and ledger together. If commit acknowledgment is uncertain, inspect the schema and ledger with the reader before deciding on a retry.
3. With the reader, confirm both columns, the matching ledger entry, and database integrity. Push the compatibility commit to `main` without force. That revision can maintain typed queues and still offers Best Match for new queues during rollout. Verify that the production aliases serve the compatible deployment and that predecessor deployment URLs require Vercel login. Wait for the previous function-duration window to elapse, then fast-forward `main` to the commit that enables the picker. Check an existing session and verify the live deployment, public flow, and fresh logs.

Review the exact writer command and its checks. The protected approval record must identify the same commit and migration that the user authorized. Verify that production session requests reach compatible code before hosts can create typed queues. If a rollback is needed after typed queues exist, use a compatible deployment or resolve those queues before rolling back. Leave the nullable columns in place during application recovery.

## Commands

Use the full reviewed commit SHA and the same attempt name across all commands. Use a new attempt if the backup is older than 15 minutes.

```sh
npm run db:rehearse:production -- --queued-doubles-release <commit> <attempt>
node scripts/run-queued-doubles-release.mjs apply <commit> <attempt> --approved-production-release
node scripts/run-queued-doubles-release.mjs verify <commit> <attempt>
```

The rehearse command uses `private/production-rehearsal.env` and writes to a new protected folder under `private/production-queued-doubles/`. Apply requires `private/production-queued-doubles/review.json` with the exact reviewed commit, `passed: true`, and two distinct reviewer IDs. It also requires a dedicated writer in `private/production-queued-doubles/writer.env` with `QUEUED_DOUBLES_WRITER_URL` and `QUEUED_DOUBLES_WRITER_TOKEN`. Both credentials must match the pinned production endpoint. The writer expires within 24 hours.

Record explicit approval of this online migration and the release-specific fresh-credential exception in protected `approval.json`. The generic production rehearsal remains disabled. The protected `deployment.json` must identify the pinned predecessor and confirm both production aliases and predecessor deployment protection within two minutes of apply. The backup age starts when the read-only snapshot starts. If writer acknowledgement is uncertain, run `verify` before deciding on a retry. It reports either a verified migrated schema, an intact predecessor, or a verification failure that requires inspection.
