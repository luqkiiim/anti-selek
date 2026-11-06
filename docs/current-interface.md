# Current interface

The cream-and-purple product UI is the sole interface. Production components live in `src/components/product/`; route wrappers and shared application state live in `src/components/app/`.

## Route map

| Real route | Screen / controller |
| --- | --- |
| `/` | `product/HomeScreen.tsx` — club chooser, join/create, optional Practice |
| `/club/[id]` | `app/ClubRoute.tsx` → `product/Club.tsx` |
| `?tab=club`, `sessions`, `rankings`, `profile`, `setup` | Club home, sessions, rankings, self profile, session setup |
| `/club/[id]/admin?tab=players`, `requests`, `settings` | `product/Admin.tsx` — Manage club |
| `/session/[code]?tab=courts`, `players`, `standings` | `app/SessionRoute.tsx` → `product/LiveSession.tsx` |
| `/session/[code]?practice=1` | Current session with `SessionPracticeTools` sheet |
| `/session/[code]/history` | `product/SessionMatchHistory.tsx` |
| `/profile/[id]?clubId=...` | `app/ProfileRoute.tsx` → `PlayerProfilePage` for active members, `PlayerHistoryProfile` for historical/guest profiles |
| `/profile/[id]` | `PlayerHistoryProfile` without an invented club membership |

`view=global` retains read-only navigation. Session links require an exact club context; malformed/duplicate scope parameters remain subject to existing validation. Profile participant links preserve their recorded club context, including explicit unscoped identities.

`/community/...` compatibility routes use the same controllers. `normalizeProductHref` replaces older `tools` bookmarks and tab names (`host`, `tournaments`, `leaderboard`, `members`, `claims`) with current destinations. No parameter selects another renderer. API aliases remain supported.

## Preserved capabilities

- **Practice:** club chooser → Practice opens the private tutorial club. Its guide retains existing step IDs, progress and dismissal. Guide links highlight current controls. Practice sessions appear separately under Sessions.
- **Practice actions:** session Options → Practice tools has reset and eligible test-to-real copy, with the choice to include completed results. Server eligibility/authorization still applies. Tutorial sessions cannot become real sessions.
- **Reset history:** Manage club → Settings → Reset club history / Reset playground. Explicit confirmation remains required; playground reset is restricted to its owner.
- **Recovery:** Manage club → Requests and player editing retain invitation/admission/account recovery. Emergency password reset is visible only to global admins editing a connected player.
- **Historical profiles:** guest, archived and unscoped profiles use current styling, match/session history, relationships, rating history, photo viewing and eligible rating/promotion controls. Existing recorded ledgers are used when available; older derived history is marked reconstructed.
- **Pairing:** Manage club → Players → Edit → Advanced pairing shows Standard, Higher level or Lower level in its collapsed summary. Club admins can change linked and unlinked members' club preference, independently of personal identity and mixed pairing being enabled. Staff gain no saved-pairing permission. Account-holder self-service remains available.

## Verification rule

For UI changes, open the real route above using the application server. Record the source revision and, when diagnosing a deployed issue, the deployed revision or deployment ID separately. Component previews and historical screenshots are not proof of what a live route renders.

Shared modules under `components/club`, `components/club-admin`, `components/profile`, and `app/session/[code]` remain in use. Determine deletion from imports rather than removing whole directories.

## First-time-user check (about five minutes)

1. In a club you administer, open Players, add a saved player, and find them again in session setup. Check that no account is required.
2. Edit a linked player under Manage club → Players. Open Advanced pairing, save a gender-appropriate level, then reopen the editor and check its summary.
3. Prepare a session with four players, including one session-only guest. Start, enter a score, pause a player, and resume them.
4. Finish the session. Review any unfinished games before choosing discard. Find the podium and save the guest to the club; find the same player in the next setup.
5. Return to the club chooser and open Practice. Review players, prepare a practice session, hide/reopen the guide, and try Reset playground from Settings.
6. Open an older `tools=advanced` or `tools=practice` bookmark. Check that it stays in the current design, including after Back and reload.

## Screenshots

All use synthetic local data and real application routes.

| Flow | Mobile | Desktop |
| --- | --- | --- |
| Linked-player pairing | [320px](current-interface/linked-player-pairing-320.png), [390px](current-interface/linked-player-pairing-390.png) | [1280px](current-interface/linked-player-pairing-1280.png) |
| Optional guided practice | [390px](current-interface/guided-practice-390.png) | |
| Reset practice / playground | [Session](current-interface/practice-reset-320.png), [Playground](current-interface/playground-reset-390.png) | |
| Test-to-real copy | [390px](current-interface/test-to-real-390.png) | |
| Historical guest profile | [320px](current-interface/guest-profile-320.png), [390px](current-interface/guest-profile-390.png) | [1280px](current-interface/guest-profile-1280.png) |
| Archived profile | [390px](current-interface/archived-profile-390.png) | |
| Emergency recovery | [390px](current-interface/emergency-recovery-390.png) | |
| Break, finish, podium | [Break](current-interface/pause-controls-320.png), [Finish](current-interface/finish-confirmation-390.png), [Results](current-interface/results-390.png) | |
