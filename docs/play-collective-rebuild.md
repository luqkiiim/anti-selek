# Play Collective rebuild

Branch: `codex/prototype-app`, based on main `ff062e9a`.

This is the existing application with a new frontend built from the approved Play Collective prototype. The reference in `prototypes/play-collective` in the original checkout is unchanged. Routes, authorization, Prisma models, ratings, matchmaking, and guest identity rules use main's implementations.

## Screen and feature map

| Surface | Available features |
| --- | --- |
| Entry | Account sign-in, view-only access, registration, password recovery |
| Club chooser | Join/create club, saved club per account, explicit switcher, practice club |
| Club home | Active session, hosting shortcut, personal club rating/rank, recent activity, standings, admin access, notifications |
| Club insights | Club totals, hot players, rating movers, news/reactions, rivalries, partnerships, recent games |
| Sessions | Active/past/practice sessions, join, collaboration acceptance/rejection, latest-session rollback |
| Host setup | Players and numeric guest ratings, courts, balancing, pairing, groups, rest, auto queue, collaboration/interclub settings |
| Live session | Courts / Players / Standings, automatic/manual matches and queue, reshuffle/replace/clear, score review/submission/approval |
| Players | Pause/resume, skip, preferences, add/remove, guest rename through existing management dialogs |
| Session settings/history/results | Court labels and gameplay settings, end/reset/test-to-real, score correction/undo, podium and result sharing |
| Player profile | Club rating/rank, recent form, sessions, match history, all-time stats, session rating changes, partners/opponents, earned achievements |
| Player controls | Exact guest promotion, audited manual rating adjustment/history |
| Club administration | Players and roles, claims, cross-club identity links under Requests, club settings and protected destructive actions |
| Account settings | Avatar upload/remove, rename, gender and existing account rules |

## Design choices

- Three main tabs: Club, Sessions, Profile. Live host tabs: Courts, Players, Standings.
- Statistics are scoped to the selected club. Account settings are global.
- Secondary explanations live in expandable sections below primary actions.
- The prototype's artwork, typography, palette, spacing and interaction language are reused; the simulated phone frame is not part of the actual app.
- Existing transactional dialogs keep their validations and confirmation flows.
- Rating charts display actual session deltas, avoiding a reconstructed absolute history that could misrepresent manual adjustments.

## Verification

The local preview uses a separate SQLite fixture database. No production database migration is required because this work does not change the schema or migration files. The approved prototype runs separately on port 4180; the rebuilt application preview uses port 3006.

The older profile renderer and old view helpers remain in the source for reference and regression coverage; routed profile screens use PlayProfile. Broader cleanup is intentionally separate from replacing working screens.

Validation: production build and TypeScript checks passed. The full regression run passed 1,148 of 1,149 tests; the remaining auth-layout assertion was updated for the new layout and passed in the targeted rerun (9 tests across auth and notifications). Lint passed for the final changed screens. Browser checks covered club selection, home, administration, profiles, phone-width navigation, player editing, standings, and a complete score submission against the isolated fixture database. Phone viewports were checked at 320px and 390px; this was browser testing, not a physical-device test.
