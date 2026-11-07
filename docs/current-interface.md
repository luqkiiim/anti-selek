# Current interface

The cream-and-purple product UI is the sole interface. Production components live in `src/components/product/`; route wrappers and shared application state live in `src/components/app/`.

## Route map

| Real route | Screen / controller |
| --- | --- |
| `/` | `product/HomeScreen.tsx` — club chooser, join/create |
| `/club/[id]` | `app/ClubRoute.tsx` → `product/Club.tsx` |
| `?tab=club`, `sessions`, `rankings`, `profile`, `setup` | Club home, sessions, rankings, self profile, session setup |
| `/club/[id]?tab=recap&session=[code]` | Latest completed personal session recap |
| `/club/[id]/admin?tab=players`, `requests`, `settings` | `product/Admin.tsx` — Manage club |
| `/session/[code]?tab=courts`, `players`, `standings` | `app/SessionRoute.tsx` → `product/LiveSession.tsx` |
| `/session/[code]/history` | `product/SessionMatchHistory.tsx` |
| `/profile/[id]?clubId=...` | `app/ProfileRoute.tsx` → `PlayerProfilePage` for active members, `PlayerHistoryProfile` for historical/guest profiles |
| `/profile/[id]` | `PlayerHistoryProfile` without an invented club membership |

`view=global` retains read-only navigation. Session links require an exact club context; malformed/duplicate scope parameters remain subject to existing validation. Profile participant links preserve their recorded club context, including explicit unscoped identities.

Club home starts with the live session, otherwise the first waiting session, otherwise the viewer's permitted session action. Additional current sessions remain in Sessions. The compact personal recap follows, then club activity, highlights, monthly climbers, partnerships and rivalries. Personal rating/rank progress lives in Profile; partnership and rivalry previews retain their separate View all sheets.

`/community/...` compatibility routes use the same controllers. `normalizeProductHref` replaces older `tools` bookmarks and tab names (`host`, `tournaments`, `leaderboard`, `members`, `claims`) with current destinations. No parameter selects another renderer. Old practice parameters open regular screens. Existing test records stay outside the club’s Sessions list. API aliases remain supported.

## Preserved capabilities

- **Reset history:** Manage club → Settings → Reset club history. Explicit confirmation remains required.
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
5. Open an older `tools=advanced` or `tools=practice` bookmark. Check that it stays in the current design, including after Back and reload.

## Screenshots

All use synthetic local data and real application routes.

| Flow | Mobile | Desktop |
| --- | --- | --- |
| Linked-player pairing | [320px](current-interface/linked-player-pairing-320.png), [390px](current-interface/linked-player-pairing-390.png) | [1280px](current-interface/linked-player-pairing-1280.png) |
| Historical guest profile | [320px](current-interface/guest-profile-320.png), [390px](current-interface/guest-profile-390.png) | [1280px](current-interface/guest-profile-1280.png) |
| Archived profile | [390px](current-interface/archived-profile-390.png) | |
| Emergency recovery | [390px](current-interface/emergency-recovery-390.png) | |
| Break, finish, podium | [Break](current-interface/pause-controls-320.png), [Finish](current-interface/finish-confirmation-390.png), [Results](current-interface/results-390.png) | |
