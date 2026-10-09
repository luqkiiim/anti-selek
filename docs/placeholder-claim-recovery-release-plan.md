# Player identity recovery Phase 1 release plan

This is a gated checklist, not approval to access or change production. Phase 1
implementation and validation are local and uncommitted. No production rows,
private rehearsal credentials, hosted migrations, deployment, or recovery
writes were accessed or changed. Focused DB, API, browser, schema, and isolated
build checks completed on disposable local data. The comparable source suite is
red as recorded below, so the branch is not ready to merge or release.

## Phase 1 local readiness gates

Complete these gates against disposable local databases and synthetic accounts
before proposing any release:

- [x] Record the feature branch SHA, fetched
  origin/main SHA, changed-file inventory, and staged/committed status.
- [x] Run the focused proof, admission, invitation, identity, and recovery
  suites. Verify canonical /api/clubs and deprecated
  /api/communities claim-request aliases each reject missing, wrong-account,
  wrong-club, expired, and password-configuration-stale proof; prove each alias
  succeeds only after its own password verification.
- [x] Verify pre-proof discovery returns no public or owned Player candidates,
  ratings, match counts, or last-played values. It may return minimal club
  metadata, the requester’s status-only requests/access, proof state, and the
  boolean identityReviewRequired. Confirm no inactive Player ID/name appears
  in that response and the UI directs the account to admin review rather than
  offering a new Player path that approval will reject.
- [x] Verify proof is bound to active Account, club, current password
  configuration, stable signing secret, and bounded expiry; it uses HttpOnly,
  SameSite cookies scoped to both supported API prefixes, Secure in production,
  and no token/password/hash in URL, response, request logs, or audit details.
  Missing signing configuration must fail closed without revealing the secret.
- [x] Verify a proof cookie cannot authorize a correction or access-restoration
  invitation. Each invitation endpoint must require its exact immutable purpose,
  target Account, target Player, issuer, and recipient confirmation. Wrong
  purpose, wrong account, replay, expiry, and changed access state must fail
  safely.
- [x] Exercise ordinary new-Player request and admin approval separately from
  invitation-backed correction. A pending request must grant no access or
  create a Player. Correction must preserve the original Player and sporting
  history, retain rather than transfer the duplicate, and record issuer and
  confirmer separately. Access-only restoration must change membership only
  and grant at most MEMBER access when explicitly approved.
- [x] Verify a future session/match uses the original Player ID and its
  pre-existing rating/history; preserve a before/after snapshot of historical
  rows while allowing only expected new participation, match, and rating rows.
- [x] Run the comparable `src --maxWorkers=4` Vitest suite. Result: **2,248
  tests: 2,215 passed, 20 failed, 13 skipped**, in 285 files (270 pass, 9 fail,
  6 skip). Keep this red result visible; the matcher pair diagnostic and
  Windows permission findings are described below.
- [x] Run changed-source/source-scope lint, source TypeScript, Prisma
  validation, local migration rehearsal, and isolated production build with
  fresh route types. The standard typecheck and raw full-tree ESLint remain
  blocked by preserved generated/ignored artifacts as documented below.
- [x] Inspect the final diff and evidence. Preserve remaining test failures and
  do not call pre-existing or order-sensitive failures a feature pass.

### Read-only worktree and validation ledger

On 2026-10-09, the branch is `codex/placeholder-claim-recovery` at
`6c47bdfacfa1dc6cbf31208d67ea906e698e4e02`. A read-only fetch found
`origin/main` at the same SHA: 0 commits ahead and 0 behind. The current
worktree has 61 tracked modified files and 30 untracked files (91 git-listed
paths with untracked files expanded), with staged 0 and unmerged 0. No commits
or remote updates were made. A
preserved copy of the 86 git-listed paths present at intake, binary diffs, and
a SHA-256 manifest is at
`C:\Users\pc\AppData\Local\Temp\phase1-resume-snapshot-20261009T014213151`;
all 86 hashes matched the worktree at intake after fetch. Later authorized
implementation, tests, migrations, and documentation are included in the
current uncommitted state. No intake path disappeared; five paths were added
after that snapshot: the club-achievements route and test, the community
claim-request and password route tests, and the club-member password route.
Those additions are authorized implementation/test work. Existing ignored
probe artifacts were preserved.
The temporary Next config and project `tsconfig.json` were restored byte-for-byte
to their captured hashes. The ignored `next-env.d.ts` currently references
generated route types under
`node_modules/.cache/phase1-next-build-final-capture-4984d8153b234fd5a6fab48e7efd11fb`,
and that target exists; this is a harness-generated ignored wrapper, not a
tracked source edit. The prior `.next` cache and user probe artifacts were
preserved.

Focused checks passed: **179/179** recovery integration tests; **31/31** legacy
wrapper and protected-claim alias tests; **10/10** final Playwright cases; and
Prisma schema validation. The populated predecessor migration rehearsal passed
**2/2** on native SQLite and local file-backed libSQL. These DB subsets overlap
the 179-test integration suite and are not additive. The exact recovery/API
logs and case mapping are recorded in the implementation report and temporary
audit directory.

The comparable current `src --maxWorkers=4` Vitest run completed in 417 seconds:
**2,248 tests: 2,215 passed, 20 failed, 13 skipped**, in 285 test files (270
passed files, 9 failed files, 6 skipped files). Assertion-file plus full-title
comparison against the pristine baseline found **15 common failures, 5
current-only failures, and 2 baseline-only failures**. The current-only tests
are one player-group selection integration assertion and four
`productionCutoverSafety` cases. The paired player-group assertion passed in
isolation against both pristine and current code (1 passed, 15 filtered skips
each, with separate Temp SQLite fixtures), so its full-suite failure is
load/order-sensitive but not conclusively explained. The 20 full-suite failures
remain open: 15 are matchmaking-family assertions and 5 are Windows
mode/ACL/cutover safety fixture failures. The pristine baseline used the same
`npx vitest run src --maxWorkers=4` scope and completed with **1,964 tests:
1,934 passed, 17 failed, 13 skipped**. Current JSON/log are at
`C:\Users\pc\AppData\Local\Temp\phase1-src-final-20261009-2a9c65a0b15d4acfa5a13c1ad1f8d83b\vitest-results.json`
and `...\vitest-console.log`; baseline comparison is in that directory.
An earlier unfiltered exploratory run completed with **2,253 tests: 2,190
passed, 50 failed, 13 pending** in 305 files. It included E2E and ignored probe
files and is not the canonical source-suite result. The exploratory title-level
comparison is at
`C:\Users\pc\AppData\Local\Temp\phase1-final-vitest-full-8c708063491441b38a836a16eaa62607\baseline-title-comparison.txt`;
do not characterize every current failure as pre-existing.

Source TypeScript passed with an external Temp tsconfig inheriting the project
compiler options/source globs, excluding the malformed stale `.next/dev/types`
directory, and including fresh isolated route declarations and validator.
Standard `npx tsc --noEmit` remains blocked by the preserved malformed
`.next/dev/types/routes.d.ts:106`. The final `npm run build` exited 0 using the
documented Next `typescript.tsconfigPath` and isolated `distDir` overrides; it
completed TypeScript, generated 14/14 static pages, and emitted route/build
manifests. The ignored `next-env.d.ts` points at the generated route declaration
under `node_modules/.cache/phase1-next-build-final-capture-4984d8153b234fd5a6fab48e7efd11fb`;
that target exists. `next.config.ts` and `tsconfig.json` were restored to their
captured prebuild hashes. The normal build script runs Next build only and
contains no migration hook. Native Prisma deploy applied all **56** migrations
to a precreated empty disposable SQLite file; this Windows Prisma setup emits a
blank schema-engine error if the SQLite target file does not exist first.

Final raw `eslint .` exited 1 across 813 files with **12 errors and 48
warnings**. All 12 errors are `no-explicit-any` in preserved ignored
`test-results-social-probe/live.test.ts` (6) and `wait.test.ts` (6). The
artifact-excluded source scope exited 0 across 811 files with **0 errors and 46
warnings**. The 85 changed TS/JS paths had **0 errors and 3 warnings**, all
unused `NextResponse` imports at line 2 in `sessions/[code]/join/route.ts`,
`sessions/[code]/roster/route.ts`, and `users/[id]/stats/route.ts`; each import
is present in `HEAD` and is a baseline warning. The three introduced unused
symbols were removed. Raw/scoped JSON is in
`C:\Users\pc\AppData\Local\Temp\phase1-final-eslint-2146432d3c004bc596f4856b6ca0c8b8`.

### Existing baseline evidence

Pristine origin/main at
6c47bdfacfa1dc6cbf31208d67ea906e698e4e02 was tested from an isolated
snapshot with its own install and Prisma client, local SQLite, and no copied
.env or private credential files. The full suite completed in 9m37s:
**1,964 tests: 1,934 passed, 17 failed, 13 pending/skipped**. The failures
spanned eight files. Fifteen were in six matchmaking test files. Two were
harness/platform failures: one STACK_TRACE_ERROR in the full parallel run and
one production-rehearsal safety test whose synthetic credential fixture expects
restrictive POSIX mode bits. A controlled isolated rerun of those two files
passed 15/16 (smoke identity 5/5; production rehearsal safety 10/11). On this
Windows Node environment, chmod still reports mode 666; the guard was kept
unchanged and failed closed. The remaining platform fixture failure is not a
product pass and must remain documented.

The Playwright flow used synthetic accounts and disposable local data. It
verified same-Account and original/target Player continuity across normal
`NEW_PLAYER` request → admin approval → removal/revocation → exact-account
correction, unchanged sporting-history snapshots, and future match/rating
attribution to the original Player ID. A separate case covered access-only
restoration and receipt replay. The score path returned `200 COMPLETED` through
the host/admin flow; this does not cover pending-score review. Browser testing
does not establish any real person's recovery eligibility. No hosted or
production database was inspected.

## Production authorization gates

Every item below requires its own explicit user authorization. The current task
does not grant any of these permissions.

1. **Read-only inspection:** obtain approval before reading production rows or
   runtime data. Limit any future inspection to fields needed to determine the
   exact requester, original Player, duplicate, invitation, access state, and
   blocker categories. Do not read or print secrets.
2. **Production-copy rehearsal:** obtain separate approval for the source,
   protected destination, access list, retention period, and deletion schedule.
   If approved, use the dedicated private/production-rehearsal.env with
   npm run db:rehearse:production. This is a read-only preservation rehearsal;
   its token must never be used for writes or exported as TURSO_* or
   DATABASE_URL. Keep snapshots and manifests only under protected ignored
   private/.
3. **Writer cutover:** obtain separate approval for the exact migration and
   matching code revision, named operator and backup owner, restore decision
   owner, stop authority, maintenance window, and coordinated application and
   background-writer freeze. A protected backup and a separate disposable-copy
   restore rehearsal must be complete before any writer action. Use a separately
   reviewed writer procedure; a build or deployment never applies migrations.
4. **Post-cutover verification:** only after an approved migration and matching
   deployment, inspect Vercel runtime logs for new 500s or missing table/column
   errors and confirm schema/code alignment. Keep the freeze until the named
   release owner authorizes reopening writes.

## Recovery eligibility and execution record

For each individually authorized recovery, confirm the active recipient
Account; exact original Player ID and invitation; active, unexpired invitation
issued by a different account; target club and original roster state; and
whether the target Player is unowned. Inspect the duplicate independently.
Record its same-account ownership, ID, activity state, archived roster row,
and the retirement blocker result. Do not infer eligibility from display name,
inactivity, or archive state alone. Any ambiguous account, missing or changed
invitation, malformed history, unrecognized sporting reference, ownership
conflict, or nonempty blocker inventory is a stop condition.

An active club ADMIN or OWNER other than the recipient must issue the exact
purpose-bound operation. The recipient confirms that operation using the
account-bound invitation. Preserve issuer and recipient as distinct audit
actors. If membership access is restored, require the explicit access action
and grant no more than MEMBER. Preserve existing ACTIVE roles; never restore a
revoked elevated role implicitly. Do not approve a generic admission request as
a substitute for an identity correction.

After the separately approved write, compare protected before/after snapshots.
The original Player ID, ownership, historical match/session/rating/achievement
rows, and old roster sporting values must remain identical. A retired duplicate
must remain owned by the same Account, inactive, archived, and bound to its
immutable authorization event; do not delete it or move its history. Any newly
created session, match, or rating record is expected only if it references the
original Player and follows the normal application flow. Verify request,
invitation, and event records agree on purpose, issuer, confirmer, target, and
terminal state.

## Migration and deployment boundaries

The recovery and authorized-identity migrations are
20261008120000_placeholder_claim_recovery and
20261008140000_authorized_identity_transitions. The reviewed migration chain
contains views, triggers, and partial uniqueness not expressible in Prisma
schema. Do not replace it with db push.

For local SQLite, back up any database containing useful data before applying
local migrations with npx prisma migrate deploy. The
npm run db:migrate:turso command is only for local SQLite or the locally
registered development Turso endpoint; it requires --force, rejects Vercel
production, and must never be redirected to production by changing
.env.local or private/development-target.json. Do not initialize or rebaseline
a remote development database unless the task explicitly requires it and its
chain is understood.

The normal build runs the Next build and does not apply migrations. Use an
isolated local database URL, USE_TURSO=false, and blank/disabled external
Turso credentials for local builds and browser tests. Never load production
rehearsal credentials into app environment variables. No production inspection,
rehearsal, migration, deployment, or recovery has been performed for this
change.

## Compatibility and deferred UX

Keep the name-based join API, both claim-request aliases, existing invitation
links, and their password checks during Phase 1. A later coordinated UX phase
should unify modern and legacy join screens to show owned Players and eligible
placeholders, require an explicit identity choice, and make creation of a new
Player an explicit user choice requiring admin approval. Do not silently map a
legacy payload without an identity kind to NEW_PLAYER; do not remove or rewrite
compatibility endpoints until every caller has been migrated and verified as
part of the same release. Matching names are not identity proof, and ordinary
admission/password proof never authorizes merging or retirement.

Stop and return to the named decision owner if any baseline snapshot differs,
any historical Player/roster value changes unexpectedly, an invitation or
account binding is inconsistent, a guard or migration fails, an unauthorized
access change appears, or application errors occur. Do not perform an automatic
restore or continue a partially understood identity transition.

## Final recommendation

**Merge: NO-GO under the current red canonical source-suite and standard
typecheck results.** Focused identity, authorization, migration, API, browser,
Prisma, changed-source lint, isolated source/fresh-route TypeScript, and isolated
build evidence found no remaining Phase 1 identity defect. The canonical source
run still has 20 failures: 15 shared with the pristine baseline and five
current-only. One current-only player-group-selection failure passes in a paired
isolated run on both baseline and current, but its full-suite load/order
behavior remains unresolved. Two baseline failures pass on current. Do not
describe the full suite as green or expand the repair into unrelated
matchmaking/UI work. Standard `npx tsc --noEmit` is blocked by preserved
malformed `.next/dev` route types; strict isolated source and fresh-route checks
passed.

**Production: NO-GO.** No hosted Turso compatibility check, production
preservation rehearsal, actual requester eligibility review, production
migration, deployment, or recovery write was performed. Before production,
separately authorize and review exact requester/duplicate eligibility, hosted
schema compatibility, protected backup and restore rehearsal, the writer
procedure, coordinated write freeze, migration, matching deployment, and
runtime verification. Local SQLite/libSQL rehearsals do not authorize or
substitute for those steps.
