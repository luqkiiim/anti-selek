# Repository Instructions

- This app uses Prisma migrations plus a Turso production database.
- Never assume a push or Vercel build has applied database migrations.
- If a task changes `prisma/schema.prisma` or anything under `prisma/migrations/`, run the database migration steps before considering the work done:
  - Apply local SQLite migrations when needed with `npx prisma migrate deploy`.
  - Apply production Turso SQL migrations with `npm run db:migrate:turso` when Turso credentials are available.
- After applying a production migration, verify Vercel runtime errors/logs for fresh 500s or missing-table errors.
- If production migration cannot be run because credentials or access are unavailable, say that explicitly before finalizing or pushing.
- Do not print secrets from `.env` or `.env.local` while checking migration readiness.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
