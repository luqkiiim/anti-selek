# Badminton Mexicano App

A web app for scheduling badminton matches with true rolling Mexicano format.

## Features

- **User Authentication**: Email/password signup and login
- **Session Management**: Create/join sessions with 6-character codes
- **3-Court Scheduling**: Each court runs independently
- **Rolling Mexicano**: When a court finishes, immediately generate the next match
- **Score Tracking**: One game to 21, win by 2, cap at 30
- **Session Points**: Players earn the game score as session points
- **ELO Rating**: K-factor 32, team average ELO, same delta applied to both players
- **Partner Avoidance**: Penalty applied to avoid repeat partners from previous match
- **Admin Controls**: Start/end sessions, approve/override scores

## Tech Stack

- Next.js 14 (App Router)
- TypeScript
- Tailwind CSS
- Prisma ORM
- SQLite (dev) / PostgreSQL (prod)
- NextAuth v5 (Credentials provider)

## Getting Started

### Prerequisites

- Node.js 18+
- npm

### Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Set up environment variables:
   ```bash
   # .env
   DATABASE_URL="file:./dev.db"
   AUTH_SECRET="your-secret-key-min-32-chars"
   ADMIN_EMAILS="admin@example.com"
   ```

3. Initialize database:
   ```bash
   npx prisma migrate dev --name init
   ```

4. Run development server:
   ```bash
   npm run dev
   ```

5. Open http://localhost:3000

### Creating an Admin User

1. Sign up with an email
2. Add that email to `ADMIN_EMAILS` in your `.env` file
3. Restart the server

## Deployment to Vercel

1. Push code to GitHub
2. Import project in Vercel
3. Add environment variables:
   - `DATABASE_URL`: PostgreSQL connection string (e.g., from Neon, Supabase, or Railway)
   - `AUTH_SECRET`: Generate with `openssl rand -base64 32`
   - `ADMIN_EMAILS`: Comma-separated admin emails
4. Deploy

For production, use PostgreSQL (not SQLite). Update `prisma/schema.prisma`:
```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

Then run:
```bash
npx prisma migrate deploy
```

## Scoring Rules

- One game to 21, win by 2, cap at 30
- Session points = game score (21-17 means winners get 21, losers get 17)

## ELO Rules

- Starting ELO: 1000
- K-factor: 32
- Win/loss only (ignore margin)
- Team rating = average of two players' ELO
- Same ELO delta applied to both players on a team

## Mexicano Algorithm

When a court finishes a match:
1. Mark 4 players as available
2. Take top 8 available by session points
3. Try all 3 possible doubles partitions
4. Choose partition with smallest |teamPointsDiff|
5. Apply +100 penalty if partition repeats last partner
6. Create match on that court
