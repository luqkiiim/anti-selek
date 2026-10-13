# UI/UX refinement — 14 October 2026

The main app and direct links now share the cream-and-purple screens. Navigation lives in the URL; profiles, history, and administration retain their permissions and existing actions. Overview and profile sections appear when they have useful data, with concise copy and compact statistics.

## Review stages

1. **Shared screens and navigation** (`8874e17`): route adapters, a shared session controller, canonical links, legacy aliases, profile overlays, scroll restoration, participant scoring and approval, self-rest controls, and interclub invitation review.
2. **Copy, overview, and profiles** (`ee0aeb1`): concise authentication and setup forms, session-first overview, one initial empty state, connected-player progress, compact account status, and populated profile insights.
3. **Visual and responsive polish:** Nunito Sans, consistent cream-and-purple tokens, lighter names, a compact activity strip, all standings columns, tablet layouts from 768px, and screenshot verification.

Advanced hosting and practice tools remain available contextually. Invitation correction, access restoration, removed-account recovery, and rating history remain in administration. Guest, retired, and unscoped aggregate profiles retain their specialist view.

## Verification

- Full unit/integration run: **2,465 passed**, 13 skipped, across 307 passing files.
- Final affected UI/navigation run: **173 passed** across 23 files, including request cancellation, rate-limit recovery, history correction, score approval, manual matching, and queue controls.
- Browser regression run: **23 passed** across the refinement, minimal-copy, and view-only callback suites. Covers canonical/direct links, reload, Back/Forward, settled swipes, overlays, scroll restoration, authentication callbacks, legacy aliases, host/staff/player permissions, view-only/global readers, self-joining and rest controls, interclub approval and profile scope, results, and score correction.
- Extended session flow: **1 passed**, covering court/player actions, settings, reset, completed standings, reduced-motion celebration, history navigation, and recap download.
- TypeScript, lint, and the migration-free production build passed. The first delivery stage also passed an independent TypeScript check. Lint reports 0 errors and 60 existing warnings.

Browser tests used a disposable SQLite database with `USE_TURSO=false`, synthetic accounts, and the existing migration chain. No backend API, schema, or production database changes were made. The production database migration and cutover remain held.

## Before and after

The before images use revision `97a1e49`. Both versions use the same isolated visual fixture. Developer controls are hidden in screenshots.

| Screen (390px) | Before | After |
| --- | --- | --- |
| Empty club | [Before](ui-ux-refinement/before-club-empty-390.png) | [After](ui-ux-refinement/after-club-empty-390.png) |
| Populated club | [Before](ui-ux-refinement/before-club-populated-390.png) | [After](ui-ux-refinement/after-club-populated-390.png) |
| Unplayed profile | [Before](ui-ux-refinement/before-profile-empty-390.png) | [After](ui-ux-refinement/after-profile-empty-390.png) |
| Played profile | [Before](ui-ux-refinement/before-profile-populated-390.png) | [After](ui-ux-refinement/after-profile-populated-390.png) |
| Direct session standings | [Before](ui-ux-refinement/before-standings-390.png) | [After](ui-ux-refinement/after-standings-390.png) |

## Responsive matrix

| Screen | 320px | 390px | 768px | 1280px |
| --- | --- | --- | --- | --- |
| Empty club | [View](ui-ux-refinement/after-club-empty-320.png) | [View](ui-ux-refinement/after-club-empty-390.png) | [View](ui-ux-refinement/after-club-empty-768.png) | [View](ui-ux-refinement/after-club-empty-1280.png) |
| Populated club | [View](ui-ux-refinement/after-club-populated-320.png) | [View](ui-ux-refinement/after-club-populated-390.png) | [View](ui-ux-refinement/after-club-populated-768.png) | [View](ui-ux-refinement/after-club-populated-1280.png) |
| Unplayed profile | [View](ui-ux-refinement/after-profile-empty-320.png) | [View](ui-ux-refinement/after-profile-empty-390.png) | [View](ui-ux-refinement/after-profile-empty-768.png) | [View](ui-ux-refinement/after-profile-empty-1280.png) |
| Played profile | [View](ui-ux-refinement/after-profile-populated-320.png) | [View](ui-ux-refinement/after-profile-populated-390.png) | [View](ui-ux-refinement/after-profile-populated-768.png) | [View](ui-ux-refinement/after-profile-populated-1280.png) |
| Standings | [View](ui-ux-refinement/after-standings-320.png) | [View](ui-ux-refinement/after-standings-390.png) | [View](ui-ux-refinement/after-standings-768.png) | [View](ui-ux-refinement/after-standings-1280.png) |
| Courts | [View](ui-ux-refinement/after-courts-320.png) | [View](ui-ux-refinement/after-courts-390.png) | [View](ui-ux-refinement/after-courts-768.png) | [View](ui-ux-refinement/after-courts-1280.png) |
| Administration | [View](ui-ux-refinement/after-administration-320.png) | [View](ui-ux-refinement/after-administration-390.png) | [View](ui-ux-refinement/after-administration-768.png) | [View](ui-ux-refinement/after-administration-1280.png) |
| Setup | [View](ui-ux-refinement/after-setup-320.png) | [View](ui-ux-refinement/after-setup-390.png) | [View](ui-ux-refinement/after-setup-768.png) | [View](ui-ux-refinement/after-setup-1280.png) |

Additional checks: [long names](ui-ux-refinement/after-long-names-320.png), [loading](ui-ux-refinement/after-loading-320.png), [error and retry](ui-ux-refinement/after-error-320.png), [profile details](ui-ux-refinement/after-profile-details-390.png), [sign-up](ui-ux-refinement/after-signup-390.png), and [focused settings sheet](ui-ux-refinement/after-settings-keyboard-320.png).

The focused-field check uses a reduced 320×460 viewport to simulate keyboard space. The final compact joining controls passed a further **4 browser checks**; another **114 affected unit tests** passed after the final copy changes. Browser verification used Chromium; a physical-device keyboard was not available.
