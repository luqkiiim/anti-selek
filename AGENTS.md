# Repository Instructions

- This app uses Prisma migrations and Turso. Never assume a push or Vercel build has applied database migrations.
- The normal build must not apply database migrations. Production changes require an explicitly user-approved, separately reviewed writer procedure; the read-only production rehearsal is not a migration command.
- Prefer zero downtime when it is straightforward and compatible with existing code. For this hobby app, a brief approved maintenance window is preferable to building substantial rollout infrastructure for one release. Choose the simplest reliable path; follow `docs/database-release-policy.md`.
- `npm run db:migrate:turso` is for local SQLite files or the locally registered development Turso endpoint only. It requires `--force`, rejects Vercel production, and must never be repurposed by changing `.env.local` or replacing `private/development-target.json` with a production fingerprint.
- For a production preservation rehearsal, use the dedicated `private/production-rehearsal.env` file and `npm run db:rehearse:production`. This path accepts a read-only token, stores source snapshots/manifests only under protected ignored `private/`, and never exports those credentials as `TURSO_*` or `DATABASE_URL`. Do not use this credential for writes.
- Apply local SQLite migrations when needed with `npx prisma migrate deploy`; back up the local database first when it contains data. Do not initialize or rebaseline a remote development database unless the task explicitly requires it and its migration chain is understood.
- After an explicitly approved production migration and matching deployment, verify Vercel runtime logs for fresh 500s or missing-table errors. State clearly when the migration/deployment/cutover remains held.
- Do not print secrets from `.env`, `.env.local`, or the private rehearsal credential file while checking configuration.

## Testing and Delivery

- This is a hobby app. Keep the process proportional to the actual change and favour shipping a working result over exhaustive verification.
- Add or run focused tests for hard logic and meaningful risks: permissions, scoring/rating calculations, concurrent updates, destructive operations, migrations, and preservation of existing data. Test outcomes and failure cases that could realistically go wrong.
- Do not write tests for obvious arithmetic, trivial pass-throughs, copy/style changes, or tests that merely repeat the implementation. Use code inspection or a quick visual check where sufficient. Do not invent tests to satisfy a checklist.
- Reuse passing checks for unchanged code. Do not rerun the full suite or repeat reviews without a relevant change, failure, or concrete unresolved concern. Expand testing only when the affected scope justifies it.
- Before deployment, use the relevant existing checks, a normal build when application code changed, and a brief check of important live flows and fresh runtime logs. Documentation-only edits do not need application tests or a build.
- Reuse existing release tooling and completed reviews. Do not build general-purpose rollout frameworks or run exhaustive failure simulations for a one-off release. For changes to previously reviewed work, review the affected differences rather than restarting the whole process.
- Preserve practical safeguards: backups before production data changes, correct target/credentials, migration compatibility, and a recovery path. Keep the required production writer review and user approval; do not add repeated confirmation requests for actions already authorized.

## UI/UX Direction

- Aim for an aesthetic, intuitive, and minimalist feeling throughout the app.
- Keep interface copy concise. Do not add explanatory subtext unless it is necessary to understand an action, make a decision, or avoid an error. Prefer clear labels and intuitive controls over extra explanation.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
