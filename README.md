# Anti-Selek

Community-based badminton tournament web app for running live sessions, managing courts, and tracking community ratings.

## Highlights

- Email/password authentication with NextAuth credentials
- Dashboard for creating, joining, and opening badminton communities
- Community leaderboard, player profiles, and claim-request flow for placeholder profiles
- Host tournaments with configurable court count, selected members, and guests
- Two session formats:
  - `Points`: matchmaking uses current session performance
  - `Ratings`: matchmaking uses persistent player rating
- Two session modes:
  - `Open`
  - `Mixed`
- Live court management with score submission and approval
- Pause/resume players during active sessions
- Late join support for admins during active sessions
- Rollback for the latest completed tournament in a community
- Matchmaking fairness controls for wait time, match rate, repeat partners, and player clustering

## Tech Stack

- Next.js `16.1.6` (App Router)
- React `19.2.3`
- TypeScript
- Tailwind CSS v4
- Prisma `5.22.0`
- SQLite for local development
- LibSQL/Turso adapter for runtime cloud mode
- NextAuth v5 beta
- Vitest

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

## Local Setup

1. Install dependencies

```bash
npm install
```

2. Run local migrations

```bash
npx prisma migrate dev
```

3. Start the app

```bash
npm run dev
```

Open `http://localhost:3000`.

## Scripts

- `npm run dev` - dev server
- `npm run build` - production build
- `npm run start` - production server
- `npm run lint` - ESLint
- `npm run test` - Vitest using thread pool mode

## Verification Commands

```bash
npm run build
npx vitest run --pool=threads
```

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
   - approve or reject claim requests
   - create, start, and end tournaments
   - generate, reshuffle, or manually assign matches
   - add players or guests into active sessions
   - rollback the latest completed tournament
   - reset or delete the community

## Session Formats and Rules

### Match score validity

- Scores must be valid badminton scores: `21+` win by 2, or `30-29`

### Standings

- Session standings use:
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

### Rating updates

- Ratings update after approved matches
- Base rating is `1000`
- K-factor is `32`
- Team rating uses the average of both teammates
- Margin of victory affects the rating delta
- Both teammates receive the same rating delta
- Guest participation reduces rating impact through a multiplier
- In communities, persistent ratings are stored on `CommunityMember.elo`

Note: user-facing copy says `rating` or `Ratings`, but some internal code and database fields still use `elo`.

## Matchmaking Summary

Player selection priority:

1. Lower match rate
2. Longer waiting time
3. Random tie-breaker

Additional constraints:

- Busy players are excluded
- Paused players are excluded
- Anti-bubble logic reduces repeated clustering of the same low-cohort players
- Team partitioning tries to minimize balance gaps and penalize repeat partners
- Mixed sessions respect gender and partner-preference rules

## Data Model

- `User`: base account identity
- `Community`: scoped badminton group
- `CommunityMember`: community role plus community-specific rating
- `Session`: tournament instance inside a community
- `SessionPlayer`: per-session standings points and matchmaking state
- `Court`: court slot and current match pointer
- `Match`: teams, scores, approval state, and rating deltas

## Deployment Notes

- Set `AUTH_SECRET`, `ADMIN_EMAILS`, `TURSO_DATABASE_URL`, and `TURSO_AUTH_TOKEN` in production
- The app uses Turso when the Turso environment variables are present
- Prisma migrations still target the local SQLite datasource from `DATABASE_URL`
- For Turso schema updates, apply SQL migrations to Turso separately

## Safety Notes

- Community reset is destructive: it deletes that community's tournaments and related session data, and resets member ratings
- Tournament rollback is intended for the latest completed tournament only
- Admin actions are permission-checked against community role or platform admin status
