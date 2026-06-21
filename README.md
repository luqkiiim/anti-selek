# Anti-Selek

Club-based badminton tournament web app for running live sessions, managing courts, and tracking club ratings.

## Highlights

- Email/password authentication with NextAuth credentials
- Self-service password recovery for claimed accounts by email
- Dashboard for creating, joining, and opening badminton clubs
- Club leaderboard, player profiles, and claim-request flow for placeholder profiles
- Host tournaments with configurable court count, selected members, and guests
- Four session formats:
  - `Points`: matchmaking uses current session performance
  - `Ratings`: matchmaking uses persistent player rating
  - `Ladder`: standings use current-session win/loss performance
  - `Race`: standings use current-session wins converted to race points
- Two session modes:
  - `Open`
  - `Mixed`
- Live court management with score submission, approval when required, and queued "next up" matches
- Pause/resume players during active sessions
- Late join support for admins during active sessions
- Rollback for the latest completed tournament in a club
- Matchmaking fairness controls for rotation load, wait time, grouping strength, and exact rematch avoidance where applicable

## Tech Stack

- Next.js `16.2.4` (App Router)
- React `19.2.3`
- TypeScript
- Tailwind CSS v4
- Prisma `5.22.0`
- SQLite for local schema/migrations and fallback local runtime
- LibSQL/Turso adapter for runtime when explicitly enabled locally or when production has Turso credentials
- NextAuth v5 beta
- Vitest
- Playwright

## Environment

Create `.env`:

```env
# Local database for Prisma migrations/dev
DATABASE_URL="file:C:/path/to/project/prisma/dev.db"

# Auth
AUTH_SECRET="replace-with-a-strong-secret"

# Optional platform admin allowlist (comma-separated emails)
ADMIN_EMAILS="you@example.com"

# Optional local runtime override
# - Leave unset to use SQLite locally
# - Set to true to force Turso in local dev
# - Set to false to force SQLite explicitly
USE_TURSO="false"

# Optional local-only verification helper
# - Set to true when you need to disable rate limits during repeated browser checks
# - Ignored in production
LOCAL_DISABLE_RATE_LIMITS="false"

# Cloud runtime database
TURSO_DATABASE_URL="libsql://..."
TURSO_AUTH_TOKEN="..."

# Optional avatar storage (required only when enabling profile photos)
BLOB_READ_WRITE_TOKEN="vercel_blob_rw_token"

# Password reset email delivery
RESEND_API_KEY="re_..."
RESEND_FROM_EMAIL="Anti-Selek <noreply@antiselek.com>"
APP_BASE_URL="https://antiselek.com"
```

Runtime database selection:

- Local development defaults to SQLite via `DATABASE_URL`, even if Turso credentials are present in `.env`
- Set `USE_TURSO=true` when you want local `npm run dev` to use Turso intentionally
- Set `USE_TURSO=false` to force SQLite explicitly in any environment
- Production uses Turso automatically when `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` are present and `USE_TURSO` is not set to `false`
- Prisma schema and `prisma migrate dev` still use the SQLite datasource from `DATABASE_URL`
- Profile photos use Vercel Blob and require `BLOB_READ_WRITE_TOKEN`
- Password reset emails use Resend and require `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, and `APP_BASE_URL`

## Local Setup

Use Node.js `24`. The repo pins Node `24` locally so development matches the
production runtime.

If you use `nvm`, run:

```bash
nvm use
```

1. Install dependencies

```bash
npm install
```

2. Run local migrations

```bash
npx prisma migrate dev
```

Before testing the tutorial playground locally, confirm your SQLite schema is in
sync:

```bash
npx prisma migrate status
```

If the command reports drift or pending migrations, fix the local database first.
The playground seeds practice sessions using the current session columns, so an
out-of-date `dev.db` can surface as an internal server error even when the app
code and e2e database are healthy.

3. Choose runtime database

Use local SQLite runtime (default):

```bash
# .env or .env.local
USE_TURSO="false"
```

Use Turso intentionally in local dev:

```bash
# .env.local
USE_TURSO="true"
```

This requires valid `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`.

To test profile photo uploads locally, create a public Vercel Blob store for the
same Vercel project and pull `BLOB_READ_WRITE_TOKEN` into your local env:

```bash
vercel env pull
```

4. Start the app

```bash
npm run dev
```

Open `http://localhost:3000`.

If you are doing repeated in-app browser verification against local routes and
run into `429 Rate limit exceeded`, you can temporarily add this to
`.env.local`:

```bash
LOCAL_DISABLE_RATE_LIMITS="true"
```

This bypass is local-only and is ignored in production.

## Scripts

- `npm run dev` - dev server
- `npm run db:migrate:turso` - apply pending SQL migrations to Turso
- `npm run build` - production build; runs the Turso migration wrapper first
- `npm run start` - production server
- `npm run smoke:production` - non-mutating production smoke against `https://antiselek.com`
- `npm run lint` - ESLint
- `npm run test` - Vitest using thread pool mode
- `npm run test:e2e` - Playwright end-to-end tests

## Verification Commands

```bash
npm run build
npx vitest run --pool=threads
```

Notes:

- `npm run dev` can run fully offline when `USE_TURSO` is unset/`false` and the app is using local SQLite
- `npm run build` always invokes the Turso migration wrapper first, but that wrapper only applies migrations on Vercel unless you force it with `npm run db:migrate:turso`
- `npm run smoke:production` defaults to public, non-mutating checks. Set `PRODUCTION_SMOKE_EMAIL`, `PRODUCTION_SMOKE_PASSWORD`, `PRODUCTION_SMOKE_COMMUNITY_ID`, and `PRODUCTION_SMOKE_SESSION_CODE` to include signed-in production paths. Signed-in smoke checks mobile first, then desktop. Set `PRODUCTION_SMOKE_MUTATE=1` only for a disposable production session where score submission and approval are safe.

## Core Workflow

1. Sign up or sign in.
2. Create a club or join an existing one.
3. Open a club dashboard to:
   - review the leaderboard
   - host a tournament
   - join an active tournament
   - reopen a past tournament by clicking its card
4. Club admins can:
   - add or remove member profiles
   - edit placeholder names and member ratings
   - approve or reject claim requests
   - create, start, and end tournaments
   - generate, reshuffle, or manually assign matches
   - add players or guests into active sessions
   - queue the next match while all courts are occupied
   - rollback the latest completed tournament
   - reset or delete the club
5. Global admins can:
   - perform emergency password resets for claimed members when email recovery is unavailable

## Session Formats and Rules

### Match score validity

- Scores must be non-negative whole numbers with one team ahead. The higher score wins, with no minimum target score or win-by-2 requirement.

### Standings

- `Points` and `Ratings` standings use:
  - `+3` points for a win
  - `0` points for a loss
  - point difference as the next tie-breaker
  - player name as the final tie-breaker

### Format behavior

- `Points` format:
  - matchmaking uses current session performance
  - standings use session points and point difference
- `Ratings` format:
  - matchmaking uses persistent player rating
  - standings still use session points and point difference
- `Ladder` format:
  - matchmaking groups players by current session win/loss performance
  - standings use ladder score (`wins - losses`) and point difference
  - late joiners only accumulate ladder results from matches completed after they enter
- `Race` format:
  - matchmaking groups players by current session race performance
  - standings use race score (`wins * 3`) and point difference
  - late joiners only accumulate race results from matches completed after they enter

### Rating updates

- Ratings update when results are finalized, including auto-approved results
- Base rating is `1000`
- K-factor is `32`
- Team rating uses the average of both teammates
- Margin of victory affects the rating delta
- Both teammates receive the same rating delta
- Guest participation reduces rating impact through a multiplier
- In clubs, persistent ratings are stored on `CommunityMember.elo`

Note: user-facing copy says `rating` or `Ratings`, but some internal code and database fields still use `elo`.

## Matchmaking Summary

Shared constraints:

- Busy players are excluded
- Paused players are excluded
- Late joiners and resumed players re-enter at the current fair baseline without catch-up
- Mixed sessions respect gender and partner-preference rules

`Points` and `Ratings` matchmaking priority:

1. Lower rotation load
2. Longer waiting time
3. Team-vs-team balance
4. Exact rematch avoidance
5. Controlled randomness among near-equal options

- `Ladder` and `Race` matchmaking:
  - group players by current competitive standing before selecting pairings
  - still respect availability, pause state, and mixed-session constraints
  - use point difference as a tie-breaker in standings
  - do not rely on session standing points

- Additional `Points` and `Ratings` constraints:
  - exact repeated partitions are heavily penalized using recent completed-match history

## Live Session Notes

- Submitted scores may complete immediately or move to opponent approval, depending on who submitted and whether the opposing side has claimed accounts
- When all courts are occupied, admins can queue the next match; it can be assigned when a court frees up and may auto-assign after a result is finalized

## Data Model

- `User`: base account identity
- `Community`: scoped badminton club
- `CommunityMember`: club role plus club-specific rating
- `Session`: tournament instance inside a club
- `SessionPlayer`: per-session standings points and matchmaking state
- `Court`: court slot and current match pointer
- `Match`: teams, scores, approval state, and rating deltas
- `QueuedMatch`: reserved next-up pairing while all courts are occupied
- `ClaimRequest`: request to merge a claimed account with a placeholder club profile
- `PasswordResetToken`: single-use claimed-account password reset token

## Deployment Notes

- Set `AUTH_SECRET`, `ADMIN_EMAILS`, `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, and `APP_BASE_URL` in production
- Create a public Vercel Blob store for the project so Vercel provisions `BLOB_READ_WRITE_TOKEN`
- The app uses Turso in production when the Turso environment variables are present, unless `USE_TURSO=false` is explicitly set
- Prisma migrations still target the local SQLite datasource from `DATABASE_URL`
- For Turso schema updates, SQL migrations are applied to Turso separately
- `npm run build` auto-applies pending Turso SQL migrations only on Vercel builds
- You can also apply them manually with `npm run db:migrate:turso`

## Safety Notes

- Club reset is destructive: it deletes that club's tournaments and related session data, and resets member ratings
- Tournament rollback is intended for the latest completed tournament only
- Admin actions are permission-checked against club role or platform admin status
