# Database releases for this hobby app

Choose the simplest reliable way to ship. Prefer zero downtime when the migration and application versions already support it. A brief approved maintenance window is reasonable when avoiding downtime would require substantial new infrastructure or compatibility work. Do not turn a one-off release into a rollout-platform project.

## Essential checks

- Use the correct production target and separate reader/writer credentials. Keep secrets private. Builds never migrate databases; development migration commands are never production commands.
- Take a fresh consistent backup before changing production data. Reuse completed preservation rehearsals when the SQL and relevant schema are unchanged; refresh only the evidence the actual writer needs.
- Inspect migration compatibility and the affected application behavior. Use focused tests for complex transformations, permissions, scoring/ratings, concurrency, or realistic data-loss risks. Do not test trivial operations or repeat the full application suite for an unchanged release.
- Reuse the existing tested writer and deployment procedure. Keep its safety guards intact. A new or materially changed production writer needs separate review and explicit user approval; previously reviewed code needs only review of relevant changes, not a restart of all verification.
- Keep a practical recovery path. Do not blindly repeat an uncertain migration, restore an old backup over newer legitimate data, or roll back to an app that cannot understand newly created records.
- After migration and deployment, confirm the expected schema/version, check a few important public flows, and inspect fresh runtime logs for errors. Broaden checks only if something fails or a concrete concern remains.

## Choosing online or maintenance

For a straightforward additive change, inspect old/new compatibility and use focused concurrency checks where locking or overlapping writers could affect users. A fast local rehearsal alone is not a guarantee of uninterrupted production writes. Only add feature gates or staged promotion controls if they are actually needed and worth the complexity.

If safe version overlap requires significant extra work, use the existing maintenance path with an approved window instead. Explain the actual trade-off in plain language. Do not routinely require a new online writer, exhaustive provider failure simulation, or a full deployment-inventory system for every migration.

Keep existing access protections and any safeguards required by the selected writer. Reducing unnecessary process is not permission to disable guards in an already-reviewed tool. Approval is for the selected release path; do not ask again for the same authorized action unless its scope or material risk changes.
