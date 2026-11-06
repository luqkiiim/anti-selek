# First-session experience

The first-session flow now starts with **Add players**. New players default to a saved club profile, with **This session only** available for guests. Saving during setup persists immediately and keeps the draft and selected players intact. A failed admission after creation retains the saved identity for retry. Name conflicts offer an existing profile explicitly.

Mixed-pairing exceptions use **Standard**, **Higher level**, and **Lower level** inside **Advanced pairing**. Pause and resume actions are visible, with separate confirmation for **Pause & clear game**. Hosts can finish from the active header, review unfinished courts, and deliberately discard unfinished games. A stale review returns a conflict and requires another action. Results open automatically, with guest promotion available to eligible club admins.

Existing pairing, scoring, ratings, identity, and permission rules remain in place. This work adds no migration and makes no production changes. Unrelated authentication and access-repair work remains in the workspace.

## Local verification

- Passed: 197 focused component/API tests, eight browser scenarios, TypeScript checking, targeted ESLint checks, and one normal `npm run build`. Existing passing checks were reused for unchanged code; the full unrelated suite was not rerun.
- Focused component and API checks cover saved-player retry, duplicate recovery, staff and collaboration permissions, guest promotion, optimistic pause rollback, score revisions, safe discard, pending approval, and strict collaboration completion.
- The browser journey creates saved players and a guest, starts play, saves a score, pauses and resumes, finishes with an explicit discard, opens the podium, saves the guest, and finds that exact player in a subsequent setup.
- Browser assertions verify that completed results and historical guest participation survive promotion, and that the new membership carries the guest's earned rating. Reopening shows **Added**.
- Layouts were inspected at 320px and 390px mobile widths and 1280px desktop width, including long names and keyboard focus.
- Browser data is isolated in `prisma/first-session-ux-e2e.db`; the test harness applies existing migrations only to that disposable local file.

The browser run exposed and resolved a setup draft reset after player creation, a sticky roster button covering the creation form, and crowded long-name rows on narrow phones. Older collaboration test fixtures were updated to add partner players after acceptance and complete the existing shared-reset approval flow during cleanup. Those checks now pass without weakening application permissions.

Before pushing to `main`, the change was integrated with the newer session-details, court controls, player-search, and authentication updates. The merged version passed 95 focused tests, the full first-session browser journey, player-search checks at 390px and 1280px, targeted lint, and a fresh normal production build including TypeScript checking.

## Screenshots

| Flow | Screenshot |
| --- | --- |
| First club: roster before session | [390px](first-session-ux/first-club-390.png) |
| Session setup | [390px](first-session-ux/setup-390.png) |
| Saved player and mixed-pairing help | [Form](first-session-ux/mixed-pairing-390.png) |
| Visible break controls and long names | [320px](first-session-ux/pause-controls-320.png), [390px](first-session-ux/pause-controls-390.png) |
| Explicit finish confirmation | [390px](first-session-ux/finish-confirmation-390.png) |
| Podium | [320px](first-session-ux/results-320.png), [390px](first-session-ux/results-390.png), [1280px](first-session-ux/results-1280.png) |
| Save a completed-session guest | [390px](first-session-ux/save-guest-390.png) |
| Find the saved guest next time | [390px](first-session-ux/next-session-390.png) |
| Add players from the club roster | [390px](first-session-ux/club-players-390.png) |

## First-time-user test (about 10 minutes)

Use a local or test club and ask someone unfamiliar with the app to think aloud. Give the tasks without pointing out the controls.

1. “Set up one court with four friends. Three will play regularly; one is visiting just today.” Observe whether they save the regular players and choose a session-only guest for the visitor.
2. “Turn on mixed pairing. Find where you would account for a stronger woman or a less-experienced man. Tell me what the setting changes.” Check that they understand pairing groups and that club rating stays unchanged.
3. “Start playing and record a result. One player wants a break after the game, then wants to return.” Watch for Pause/Take a break and Resume, without accidental court clearing.
4. “Start another game, then finish the session. The unfinished game has no result worth keeping.” Check whether they review the affected court and understand the explicit discard action.
5. “Find the podium. The visitor now wants to join regularly. Save them, then find them when setting up another session.” Check for identity continuity and **Added** feedback.

Record hesitation, wrong turns, and any help needed. Repeat with a fresh tester after addressing observed confusion; do not coach them through the interface first.

## Release prerequisites

These UX changes require no migration. The requested push contains this work integrated with the existing `main` branch; unrelated local authentication/access-repair changes remain untouched. A successful build does not apply migrations. Any production migration still needs its own reviewed, approved writer procedure. Production deployment and runtime verification are separate from the local checks above.
