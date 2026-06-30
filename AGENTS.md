# Repository Instructions

- This app uses Prisma migrations plus a Turso production database.
- Never assume a push or Vercel build has applied database migrations.
- If a task changes `prisma/schema.prisma` or anything under `prisma/migrations/`, run the database migration steps before considering the work done:
  - Apply local SQLite migrations when needed with `npx prisma migrate deploy`.
  - Apply production Turso SQL migrations with `npm run db:migrate:turso` when Turso credentials are available.
- After applying a production migration, verify Vercel runtime errors/logs for fresh 500s or missing-table errors.
- If production migration cannot be run because credentials or access are unavailable, say that explicitly before finalizing or pushing.
- Do not print secrets from `.env` or `.env.local` while checking migration readiness.
