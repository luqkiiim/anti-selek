# Tournament App (Badminton Mexicano)

A web app for running rolling badminton sessions with live court management, score approval, and player ratings.

## What It Does

- Email/password authentication (NextAuth credentials)
- Admin-managed session creation with 6-character session code
- 3-court live session flow (create match, submit score, approve result)
- Session formats:
  - `POINTS`: leaderboard by session points
  - `ELO`: leaderboard by global ELO
- Player pause/resume support for temporary breaks
- Late-join support (admin can add players into active sessions)
- Matchmaking fairness using time-adjusted match-rate + wait time

## Stack

- Next.js `16.1.6` (App Router)
- React `19.2.3`
- TypeScript
- Tailwind CSS v4
- Prisma `5.22.0`
- SQLite (local) + LibSQL/Turso adapter (cloud mode)
- NextAuth v5 beta (credentials provider)
- Vitest (unit tests for matchmaking helpers)

## Local Setup

### Prerequisites

- Node.js 20+
- npm

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

Create `.env`:

```env
DATABASE_URL="file:./dev.db"
AUTH_SECRET="replace-with-a-strong-secret"
ADMIN_EMAILS="admin@example.com"

# Optional (cloud mode via Turso/LibSQL)
# TURSO_DATABASE_URL="libsql://..."
# TURSO_AUTH_TOKEN="..."
```

### 3. Run database migrations

```bash
npx prisma migrate dev
```

### 4. Start the app

```bash
npm run dev
```

Open `http://localhost:3000`.

## Scripts

- `npm run dev` - start dev server
- `npm run build` - production build
- `npm run start` - run production server
- `npm run lint` - run ESLint
- `npm test` - run Vitest

## Admin Setup

1. Sign up a user.
2. Add that user email to `ADMIN_EMAILS`.
3. Restart the app.

Admin capabilities include:

- Create sessions and preselect participants
- Start/end session
- Generate/reshuffle matches
- Approve/override scores
- Manage players (create/edit/delete/reset ELO)
- Community reset (destructive)

## Core Game Rules

### Score validation

A submitted game must be:

- `21+` with win-by-2, or
- `30-29` cap

### Session points

Each player receives their team game score for that match.

### ELO

- Starting ELO: `1000`
- K-factor: `32`
- Team ELO is team average
- Margin multiplier is applied in approval flow
- Same delta is applied to both players on each team

## Matchmaking Summary

Player selection for a new match prioritizes:

1. Lower match-rate (matches per active time)
2. Longer wait time (`availableSince`)
3. Random tiebreak

Additional logic:

- Busy players (already on active/pending courts) are excluded
- Paused players are excluded
- A bubble-prevention rule limits over-selection from the lowest matches-played cohort
- Team partitioning minimizes ELO difference and penalizes repeat partners

## Data Model (High Level)

- `User`: account + ELO + claim state
- `Session`: code, status, type
- `SessionPlayer`: per-session points and matchmaking state
- `Court`: session court slot with optional current match
- `Match`: teams, score, approval/completion status, ELO deltas

## Deployment Notes

- Set production env vars: `DATABASE_URL`, `AUTH_SECRET`, `ADMIN_EMAILS`.
- If using Turso, also set `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`.
- Run migrations in deployment pipeline:

```bash
npx prisma migrate deploy
```

## Current Improvement Priorities

1. Tighten API authorization consistency across all routes.
2. Add stronger input validation and standardized error responses.
3. Expand integration tests for session/match route authorization and race conditions.
4. Add audit logging for admin/destructive operations.
