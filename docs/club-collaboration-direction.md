# Club collaboration

Implementation: October 2026. Local verification precedes release. Production release preparation uses the existing tested maintenance procedure, with focused checks and reuse of completed verification.

## Goal and setup

Two clubs prepare and play one shared session. Each club manages its own players and guests, while both see the same rules, lineup, courts, scores, and recap. A player keeps one identity and represents one club in the session.

Normal setup preserves the entered name, courts, and player selections when a partner is added. **Play together** retains the combined-pool format. **Club vs club** offers **Free play** (automatic partner rotation within each club) or **Lineup** (a shared fixture sheet). New Club vs club sessions default to Free play, Single game, Unrated. Scheduling is fixed at creation; scoring and rating settings can change during preparation.

An empty roster can be prepared and an invitation sent without access to the visiting club’s roster. The visiting club accepts or declines separately from rules agreement. Both clubs’ owners/admins confirm the current scoring and rating revision. Changing those settings clears both confirmations. Cancelling an invitation or withdrawing before play keeps the shared session blocked from starting; it never silently becomes a single-club session.

## Roles and play

- Each accepted club’s owners/admins/staff manage only its own players, guests, and lineup pair. Existing player self-service availability remains available. Representation locks after participation in a started match, including after that match is undone.
- Host operators control start/end, court labels, assignment, and lineup row creation/order/cancellation. Operators from either accepted club may score. Participant score submission and opponent approval remain available.
- Lineup rows can be incomplete while other rows play. Four distinct eligible players and both pair confirmations make a row ready. Pair changes clear both confirmations. Starting requires an available court and players, and creates exactly one Match inside the existing serialized writer transaction. Repeated starts return the linked match. Automatic generation and queues are disabled for Lineup.
- Free play retains existing matchmaking and queue choices, manual selection, and availability controls. Start requires agreed rules and two available players per club. Players may arrive or leave during play.
- Foreground shared-state reads refresh every two seconds and after mutations. Local input drafts remain separate from fetched state; stale revisions are rejected for review.

A session can start when rules are agreed and at least one lineup row is ready. Unplayed rows can be cancelled without scores. Ending early requires acknowledging remaining rows; started matches must be completed or undone first. Completed results remain intact.

Active shared resets require both clubs’ admin approval of the current results revision. Subsequent result changes make old approvals invalid. The host then executes rating reversal and reset in one transaction, retaining lineup selections, clearing confirmations and results, and returning to preparation. Active shared sessions cannot bypass this consent by being deleted directly.

## Results and ratings

A fixture is one Match whether Single game or Best of three. Series scores are ordered games; scalar match scores remain aggregate rally points for existing statistics. Completed series must end 2–0 or 2–1 with no tied games or extra games after the deciding win. Scores must be nonnegative safe whole numbers; no 21/30/31 target is enforced. Partial series progress can be saved without completing the match or releasing the court.

Each completed fixture contributes one appearance, one club match win, and three standing points for a win / zero for a loss. A series winner is determined by games won even when its aggregate rally total is lower. Equal club match wins are a draw in upgraded sessions; legacy point-difference tiebreaks remain unchanged.

Rated single games keep the existing formula. Rated series apply one outcome-based adjustment with the existing expected result, K-factor, and guest treatment, using a neutral margin. Unrated results produce neither rating ledger entries nor persistent or derived guest-rating changes. Participation, wins/losses, streaks, and standings still count. A series close-win achievement requires a deciding third game won by one or two points and counts once per fixture.

Approval, correction, undo, reset, profile/history readers, achievements, share images, and scoreboards use the resolved result and ordered games. Explicitly unrated history does not report missing rating data as an error.

## Additive storage and API contract

- Session: `collaborationVersion`, `schedulingMode`, `scoringFormat`, `ratingMode`, `rulesRevision`, `resultsRevision`.
- SessionClub: nullable `rulesConfirmedRevision` and `resetConfirmedRevision`.
- SessionPlayer: `hasStartedMatch` protects representation after participation.
- Match: `scoringFormat`, `gameScoresJson`, `scoreRevision`. One fixture remains one Match.
- SessionLineupRow: ordered nullable pair slots, court preference, pair confirmations, revision, cancellation state, optional unique Match link.
- SessionCollaborationEvent: actor, action, details, timestamp for terms, row changes, and reset approvals.

`GET/PATCH /api/sessions/:code/collaboration` exposes shared state/capabilities and versioned rules/reset/invitation actions. `POST /lineup`, `PATCH /lineup/:rowId`, and `POST /lineup/:rowId/start` manage fixtures. Score requests add `gameScores`, `scoreRevision`, and `finalize: false` for progress saves. The existing reset and end endpoints enforce the shared lifecycle rules.

The additive migration `20261015123000_upgrade_club_collaboration` preserves existing rows, rating values, indexes, and identity triggers. Existing sessions default to behavior version 1, Free play scheduling, Single game, and their existing rated treatment. After activation, every new partner session uses behavior version 2; callers cannot opt into legacy permissions. Historical results are not recalculated.

Retired test sessions remain legacy records. Ordinary session creation still rejects the old test flag. Guided tutorial sessions remain isolated, classified by the server. Unrated play uses its own setting.

## Release boundary

The normal build does not migrate a database. Local SQLite verification uses disposable databases; back up any populated local database before applying migrations. Production requires a separately reviewed, explicitly approved writer procedure, matching deployment, and fresh runtime-log/public-flow verification. Prefer zero downtime when straightforward; for this hobby app, a brief approved maintenance window is preferable to substantial new rollout infrastructure. Test complex logic and meaningful risks, and reuse passing checks for unchanged code. The user authorized release preparation through deployment and requested this proportional approach. See `database-release-policy.md` and the revised `production-release63.md` for the remaining readiness and approval gates.

## Local verification — 16 October 2026

- Two separate club accounts completed the real browser Lineup / best-of-three and Free play / single-game scenarios. Checked phone widths 320px and 390px and the compact 1280px lineup sheet; no horizontal overflow. The series fixture included a winner with fewer aggregate rally points, partial score saving, and shared history.
- Migrated disposable SQLite tests cover empty invitations, own-side permissions, stale revisions, substitutions, ready and incomplete rows, concurrent/idempotent starts, court/player conflicts, rules confirmation, start/end/reset consent, rated/unrated ledgers and guest ratings, correction, undo, and rollback. An additive-migration preservation test checks original columns, rows, ratings, indexes, triggers, foreign keys, and integrity.
- The broad serial sweep passed 2,677 tests. A collaboration test added during that sweep passed on the fresh focused and component reruns. The final component rerun passed 417 tests with one unrelated failure: `PlayerIdentityInvitationActions` / “lets a scoped admin revoke an exact legacy CLAIM invite on an already-owned Player”. That same failure reproduces on unchanged commit `b3abc7c`; it is not introduced by this upgrade.
- Existing matchmaking budget-sensitive tests pass in isolation and in the final serial sweep. The expression-depth test passes with the bundled Python runtime supporting SQLite limit controls.
- TypeScript, Prisma schema validation, the normal build, and diff whitespace checks pass. Full lint has zero errors and 58 existing warnings; the final touched-file lint is clean.

Unrated rollback is verified without rating ledgers. Rated rollback refuses to erase earlier changes when later rated fixtures depend on those club profiles; the existing rollback route does not replay other sessions. Supplied score revisions are required for upgraded score mutations, and draft revisions are retained across polling.

Application verification used disposable local databases. A later production read-only backup was rehearsed locally, preserving all 8,473 original rows with integrity and foreign-key checks passing. No production migration, deployment, runtime-log check, or public deployed-flow verification has occurred. Release preparation and the approval boundary are documented in `production-release63.md`.
