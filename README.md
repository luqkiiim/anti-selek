# Tournament App (Badminton Mexicano)

Community-based badminton tournament app with live court management, score approval, and matchmaking fairness controls.

## Highlights

- Email/password authentication (NextAuth credentials)
- Community-scoped administration (no global player admin workflow)
- Community-scoped ELO (`CommunityMember.elo`)
- Tournament/session lifecycle with 6-character code
- Configurable court count per tournament (not fixed to 3)
- Pause/resume players during active tournaments
- Admin late-join support (add players into active tournament)
- Match score submission + admin approval flow
- Matchmaking fairness with wait-time + match-rate balancing and anti-bubble controls

## Tech Stack

- Next.js `16.1.6` (App Router)
- React `19.2.3`
- TypeScript
- Tailwind CSS v4
- Prisma `5.22.0`
- SQLite (local) + LibSQL/Turso adapter (runtime cloud mode)
- NextAuth v5 beta (credentials)
- Vitest (matchmaking unit tests)

## Environment

Create `.env`:

```env
# Local database for Prisma migrations/dev
DATABASE_URL="file:C:/path/to/project/prisma/dev.db"

# Auth
AUTH_SECRET="replace-with-a-strong-secret"

# Admin allowlist (comma-separated emails)
ADMIN_EMAILS="you@example.com"

# Cloud runtime database (optional but required for Vercel+Turso)
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
- `npm run test` - Vitest

## Verification Commands

- Lint:

```bash
npm run lint
```

- Build:

```bash
npm run build
```

- Tests (Windows/iCloud environments may require thread pool mode):

```bash
npx vitest run --pool=threads
```

## Community Workflow

1. Sign up.
2. Create or join a community.
3. Community admin can:
   - Add/remove members
   - Edit member name and community ELO
   - Create tournament and choose courts + participants
   - Start/end tournament
   - Generate/reshuffle matches
   - Approve/override scores
   - Reset the community (destructive and scoped)

## Scoring and ELO Rules

- Score validity: `21+` win-by-2 or `30-29` cap
- Session points: each player gets their team score
- ELO:
  - Base rating: `1000`
  - K-factor: `32`
  - Team ELO uses team average
  - Margin multiplier applied in approval flow
  - Same delta applied to both teammates
- For community tournaments, ELO updates are applied to `CommunityMember.elo`

## Matchmaking Summary

Player selection priority:

1. Lower match-rate (matches per active time)
2. Longer waiting time (`availableSince`)
3. Random tie-breaker

Additional constraints:

- Busy players excluded (active/pending matches)
- Paused players excluded
- Anti-bubble logic to avoid repeated clustering of lowest-cohort players
- Team partitioning minimizes ELO gap and penalizes repeat partners

## Data Model (High Level)

- `User`: account identity/profile
- `Community`: scoped group
- `CommunityMember`: role + community-specific ELO
- `Session`: tournament instance in a community
- `SessionPlayer`: per-session points + matchmaking state
- `Court`: court slot and current match pointer
- `Match`: teams, scores, status, ELO deltas

## Deployment Notes (Vercel + Turso)

- Set `AUTH_SECRET`, `ADMIN_EMAILS`, `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` in Vercel.
- App runtime uses Turso when `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` are present.
- Prisma datasource is SQLite, so `prisma migrate deploy` targets `DATABASE_URL` file DB.
- For Turso schema updates, apply SQL migrations directly to Turso (via Turso CLI or LibSQL client).

## Safety Notes

- Community reset deletes tournaments/sessions/matches for that community and resets that community’s member ELOs.
- Admin actions are permission-checked against community membership role.
