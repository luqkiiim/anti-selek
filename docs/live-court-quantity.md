# Court availability during a session

In Session settings, Available courts can change from 1–10 before or during play. Reducing the count closes the highest numbered courts; finish or clear their matches first. Other ongoing matches, session points, ratings, completed matches and lineup references remain intact. Increasing the count reopens retained courts with their original IDs and labels, creating courts only when needed.

`Court.isActive` defaults to true. The forward migration is `20261028000000_court_availability`; it adds one column without rewriting or deleting existing data. Availability changes reserve the same SQLite writer used by match assignments and reread the session and unfinished matches. Match assignment also checks availability at commit time. Matchmaking, automatic queue assignment, manual assignment, lineup starts and session responses exclude unavailable courts. History continues to read all matches.

## Release status

Prepared and verified locally; production migration and deployment remain held. Pushing this change does not apply the migration. Hosted builds perform only a read-only Court schema check and fail before building if the column is absent, leaving the existing deployment in place.

Production activation requires the repository's separately reviewed, explicitly approved database writer and coordinated write freeze. Before approving activation:

1. Pin the application commit, migration SQL hash and current production migration chain; confirm this is the only pending migration, or separately review every other pending migration.
2. Review the writer for the verified production target and normal migration ledger, using separate writer/reader credentials. This feature does not introduce or authorize a production writer.
3. During the approved freeze, take a fresh backup, apply the pinned additive SQL with its ledger entry, and verify every existing court retains its ID, number, label and match references, with `isActive = true`. Check foreign keys and integrity.
4. Deploy the matching commit, exercise settings → increase/decrease/reopen and match/queue assignment, and inspect fresh runtime logs for missing-column/table errors and 500s before reopening writes.

After any court has been closed, older application code is incompatible because it does not filter unavailable courts. Prefer a forward repair; an application rollback needs a reviewed plan for all inactive courts.

## Local verification

Use a new disposable SQLite file for the browser test: `$env:E2E_DATABASE_FILE='prisma/court-quantity-e2e.db'; npx playwright test e2e/court-quantity.spec.ts`. The existing global setup applies the full Prisma migration chain only to this local fixture. It never uses Turso credentials. The browser test changes 1 → 3 → 1 → 3 courts during play and checks ongoing matches, completed history, player state, ratings, stale requests and restored court IDs/labels.

`node --test scripts/check-court-schema.test.mjs scripts/court-availability-migration.test.mjs` covers the deployment hold and migration preservation on synthetic data.
