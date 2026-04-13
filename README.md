# Anti-Selek

Community-based badminton tournament web app for running live sessions, managing courts, and tracking community ratings.

## Highlights

- Email/password authentication with NextAuth credentials
- Dashboard for creating, joining, and opening badminton communities
- Community leaderboard, player profiles, and claim-request flow for placeholder profiles
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
- Rollback for the latest completed tournament in a community
- Matchmaking fairness controls for rotation load, wait time, grouping strength, and exact rematch avoidance where applicable

## Tech Stack

- Next.js `16.1.6` (App Router)
- React `19.2.3`
- TypeScript
- Tailwind CSS v4
- Prisma `5.22.0`
- SQLite for local schema/migrations and fallback local runtime
- LibSQL/Turso adapter for runtime when Turso env vars are present
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

# Cloud runtime database
TURSO_DATABASE_URL="libsql://..."
TURSO_AUTH_TOKEN="..."
```

Runtime database selection:

- If `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` are set, the app uses Turso even during local `npm run dev`
- If those Turso variables are unset or empty, the app falls back to local SQLite via `DATABASE_URL`
- Prisma schema and `prisma migrate dev` still use the SQLite datasource from `DATABASE_URL`

## Local Setup

1. Install dependencies

```bash
npm install
```

2. Run local migrations

```bash
npx prisma migrate dev
```

3. Choose runtime database

Use local SQLite runtime:

```bash
# PowerShell
$env:TURSO_DATABASE_URL=""
$env:TURSO_AUTH_TOKEN=""
```

Keep the Turso variables set if you want local app runtime to use the remote Turso database.

4. Start the app

```bash
npm run dev
```

Open `http://localhost:3000`.

## Scripts

- `npm run dev` - dev server
- `npm run db:migrate:turso` - apply pending SQL migrations to Turso
- `npm run build` - production build; runs the Turso migration wrapper first
- `npm run start` - production server
- `npm run lint` - ESLint
- `npm run test` - Vitest using thread pool mode
- `npm run test:e2e` - Playwright end-to-end tests

## Verification Commands

```bash
npm run build
npx vitest run --pool=threads
```

Notes:

- `npm run dev` can run fully offline only if Turso variables are unset and the app is using local SQLite
- `npm run build` always invokes the Turso migration wrapper first, but that wrapper only applies migrations on Vercel unless you force it with `npm run db:migrate:turso`

## Core Workflow

1. Sign up or sign in.
2. Create a community or join an existing one.
3. Open a community dashboard to:
   - review the leaderboard
   - host a tournament
   - join an active tournament
   - reopen a past tournament by clicking its card
4. Community admins can:
   - add or remove member profiles
   - edit member names and ratings
   - reset member passwords and ratings
   - approve or reject claim requests
   - create, start, and end tournaments
   - generate, reshuffle, or manually assign matches
   - add players or guests into active sessions
   - queue the next match while all courts are occupied
   - rollback the latest completed tournament
   - reset or delete the community

## Session Formats and Rules

### Match score validity

- Scores must be valid badminton scores: `21+` win by 2, or `30-29`

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
- In communities, persistent ratings are stored on `CommunityMember.elo`

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
- `Community`: scoped badminton group
- `CommunityMember`: community role plus community-specific rating
- `Session`: tournament instance inside a community
- `SessionPlayer`: per-session standings points and matchmaking state
- `Court`: court slot and current match pointer
- `Match`: teams, scores, approval state, and rating deltas
- `QueuedMatch`: reserved next-up pairing while all courts are occupied
- `ClaimRequest`: request to merge a claimed account with a placeholder community profile

## Deployment Notes

- Set `AUTH_SECRET`, `ADMIN_EMAILS`, `TURSO_DATABASE_URL`, and `TURSO_AUTH_TOKEN` in production
- The app uses Turso when the Turso environment variables are present
- Prisma migrations still target the local SQLite datasource from `DATABASE_URL`
- For Turso schema updates, SQL migrations are applied to Turso separately
- `npm run build` auto-applies pending Turso SQL migrations only on Vercel builds
- You can also apply them manually with `npm run db:migrate:turso`

## Safety Notes

- Community reset is destructive: it deletes that community's tournaments and related session data, and resets member ratings
- Tournament rollback is intended for the latest completed tournament only
- Admin actions are permission-checked against community role or platform admin status
