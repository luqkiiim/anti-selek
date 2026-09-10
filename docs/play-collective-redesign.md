# Play Collective redesign

Branch: `codex/play-collective-redesign`. Production and main are not release targets.

The actual application now uses the approved cream/purple direction, rounded Nunito Sans typography, tactile buttons, and the neutral spark illustration. Business logic, permissions, guest identities, rating calculations, and database schema are preserved.

## Placement

- Club selection is account-specific. A single club opens automatically; returning users resume a still-authorized saved club. Switch club opens the chooser explicitly. Join and create remain available there.
- Main club navigation: Club, Sessions, Profile. Host setup and leaderboard remain addressable secondary destinations.
- Club overview prioritizes the live session, latest recap and club leaders, with deeper activity/insights collapsed below.
- Live navigation: Courts, Players, Standings. Players shows the roster with management access governed by existing permissions; session controls are collapsed while live.
- Score entry uses one team per row with its score alongside, avoiding cramped player names on phones.
- Administration: Players, Requests, Settings. Requests retains both profile claims and cross-club identity links; old links URLs still work.
- Existing profile Overview, Matches, Stats and Achievements remain available, including manual rating adjustments.

## Verification

Focused component/navigation/profile tests: 87 passed. Final club overview checks: 11 passed. Changed component lint passed. Local test fixture score submission (21-18) updated standings and earned ratings (1017 / 983). Player manager and request screens were exercised. Mobile 390px, narrow 320px and desktop 1280px checked; no document horizontal overflow at 320px or 1280px.

Local verification uses the isolated codex-ux-audit SQLite database. No schema migration is part of this change. Prototype directories remain separate and are excluded from production TypeScript checking.
