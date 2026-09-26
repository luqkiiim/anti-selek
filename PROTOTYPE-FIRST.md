# Prototype first

Branch: codex/prototype-first, based on main.

The deployed frontend is the approved Play Collective prototype rendered by the main Next.js app. Its visual language, screens, styles and artwork are preserved while the visible club, profile and session paths read and write through the existing authenticated APIs. The browser runtime uses a responsive app surface without a phone simulator. Achievements remain an explicit preview and do not read backend achievement data.

The connected scope currently includes real club selection, club creation and invite based join requests, club administration, profile and session data, session start and end, score entry and correction, guest players, pause and resume, and session standings. Quick access accounts remain restricted by the existing APIs. Join request records use the Prisma migration under `prisma/migrations/20260911020000_club_join_requests/`; local migrations must be applied before testing against a local database.

Run `npm ci` and `npm run dev -- --port 3007` locally. Validate with `npm run lint`, `npx tsc --noEmit`, and the focused Vitest files covering the page, join request integration, score submission, and pause flows. The production migration is a separate deployment step and must not be assumed to have run with the frontend build.

Add features individually on this foundation, preserving the approved interface and keeping each new visible action connected to a real API before exposing it in the prototype.
