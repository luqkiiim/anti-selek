# Repository Instructions

- This app uses Prisma migrations and Turso. Never assume a push or Vercel build has applied database migrations.
- The normal build must not apply database migrations. Production cutover requires an explicit user-approved, separately reviewed writer procedure and a coordinated write freeze; the read-only production rehearsal is not a migration command.
- `npm run db:migrate:turso` is for local SQLite files or the locally registered development Turso endpoint only. It requires `--force`, rejects Vercel production, and must never be repurposed by changing `.env.local` or replacing `private/development-target.json` with a production fingerprint.
- For a production preservation rehearsal, use the dedicated `private/production-rehearsal.env` file and `npm run db:rehearse:production`. This path accepts a read-only token, stores source snapshots/manifests only under protected ignored `private/`, and never exports those credentials as `TURSO_*` or `DATABASE_URL`. Do not use this credential for writes.
- Apply local SQLite migrations when needed with `npx prisma migrate deploy`; back up the local database first when it contains data. Do not initialize or rebaseline a remote development database unless the task explicitly requires it and its migration chain is understood.
- After an explicitly approved production migration and matching deployment, verify Vercel runtime logs for fresh 500s or missing-table errors. State clearly when the migration/deployment/cutover remains held.
- Do not print secrets from `.env`, `.env.local`, or the private rehearsal credential file while checking configuration.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
