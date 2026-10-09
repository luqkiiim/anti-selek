# Player identity recovery and protected-club admission

This document describes the implemented local Phase 1 change and its current
verification evidence. It does not authorize production inspection, migration,
deployment, or recovery writes. The feature branch is based on `origin/main` at
`6c47bdfacfa1dc6cbf31208d67ea906e698e4e02`; implementation and documentation
changes remain local and uncommitted. No production account, database, credential,
or deployment was accessed or changed.

The 2026-10-09 read-only fetch found `origin/main` still at that same SHA.
The branch is 0 commits ahead and 0 behind. The current worktree has 61 tracked
modified files and 30 untracked files (91 git-listed paths with untracked files
expanded), with no staged or unmerged files. An external snapshot of the 86
git-listed paths present at
intake, binary diffs, and SHA-256 manifest is at
`C:\Users\pc\AppData\Local\Temp\phase1-resume-snapshot-20261009T014213151`;
all 86 copied file hashes matched the live worktree at that intake point after
the fetch. All 86 paths remain present; five authorized paths were added after
the snapshot: the club-achievements route and test, the community claim-request
and password route tests, and the club-member password route. Later authorized
implementation, tests, E2E, and documentation remain uncommitted. Ignored local
probe artifacts were preserved.

## Identity and history rules

A Player remains permanently owned by its Account. Recovery does not transfer
or merge the accidental duplicate into the original Player. When an eligible
correction explicitly retires a duplicate, its Player and ClubMember row remain
attached to the same Account, become inactive/archived, and are bound to the
immutable approval event. Only rows carrying the audited retirement marker are
exempt from ordinary ownership uniqueness rules; inactive or archived rows
without that marker remain identity conflicts.

The original Player keeps its ID, rating, timestamps, match/session/achievement
history, and roster values. Future participation must reference that original
Player ID. Recovery decisions, invitation consumption, retirement, access
changes, and audit events are transactionally bound. A completed invitation is
idempotent and cannot grant access again after a later revoke.

For an ordinary `CLAIM`, the issuing Account must remain active and retain
local ADMIN or OWNER access to the invited club when the recipient opens,
exchanges, or redeems the link. Losing that authority makes an unredeemed link
unavailable. If the same recipient already completed the claim, retrying returns
the original receipt and does not restore access that was later revoked.

Account-wide identity checks apply when a claim redeems and when an unowned
Player is assigned to an Account. They count other owned Players regardless of
activity or club membership, excluding only explicitly retired identities and
the exact Player being claimed. These checks preserve existing legacy ownership
rows for manual review; they do not add a global unique constraint or rewrite
legacy assignments.

Ordinary `CLAIM` recovery keeps its existing retirement eligibility: an eligible
duplicate must already have its single roster row archived in the invited club,
with no disqualifying relationships, history, queues, partner references,
rating changes, achievements, hosting credit, offline links, notifications,
active invitations, or unresolved requests. Purpose-bound `CORRECTION` uses a
separate eligibility path: its source Player may already be active or inactive,
and its single roster row may be active or archived in the invited club. If that
row is active, confirmation archives it inside the same transaction that
deactivates and marks the source retired. An already-inactive source is never
reactivated. In both flows, the original Player and its Account ownership are
retained; no owner is released or transferred.

`PlayerRetirementBlocker` is the migration-owned SQL view used by the service
and retirement guard. Relevant JSON is inspected structurally, including
nested keys; malformed or ambiguous history blocks retirement. Terminal audit
rows remain in place. There is no history merge or manual override.

## Purpose-bound identity operations

An invitation has one immutable purpose: `CLAIM`, `CORRECTION`, or
`ACCESS_RESTORE`. Correction and access-restoration paths are separate,
account-bound capabilities issued by an active club ADMIN or OWNER. They target
the exact recipient Account and Player. The recipient must confirm the exact
operation while the invitation remains valid; a general club password proof or
ordinary admission request cannot authorize either operation.

The correction path may restore the original Player's club access and retire
the recipient's eligible duplicate in the same audited operation. Access
restoration alone changes membership only: it creates, transfers, activates,
merges, or retires no Player. Existing ACTIVE roles are preserved; an
explicitly restored membership is limited to MEMBER. STAFF, self-approval, and
global-admin status alone cannot issue or approve these club-scoped actions.
Audit records distinguish the recipient who confirmed an operation from the
ADMIN/OWNER who authorized it.

Identity options and invitation issuance are scoped under
`/api/clubs/{clubId}/players/{playerId}`; confirmation uses
`/api/player-invites/{invitationId}/confirm-correction` or
`/confirm-access-restore`. Server-side purpose checks apply at issuance and
confirmation. Invitation continuation material remains hashed for
server-side verification and is never included in audit detail JSON.

## Protected-club admission privacy

For a password-protected club, ordinary candidate discovery, search, and
admission submission require a short-lived proof. The authenticated client
submits `{ clubId, password }` to `POST /api/clubs/join-proof`; the password
is not placed in a URL or later request body. Successful verification sets
HttpOnly, SameSite cookies scoped to canonical `/api/clubs` and deprecated
`/api/communities` API prefixes. Proof is bound to the active Account, club,
current password configuration, stable server signing secret, and expiry.
The secret is never returned, raw password hashes and proof tokens are not
serialized, and missing signing configuration fails closed. Production cookies
are Secure.

Before proof is verified, discovery exposes only minimal club metadata, the
requester's own status summary, `passwordProof.status`, and the own-account
`identityReviewRequired` boolean. Public and owned Player candidate collections
are empty. Own request/status reads remain available without proof but omit
requested/approved Player and other requester details. A missing or stale proof
returns `428 PASSWORD_REQUIRED`; the UI clears both candidate collections and
selection before relocking. A wrong password returns a safe error. Proof does
not bypass review or grant club membership, and it is not accepted by
invitation-specific identity endpoints. Existing member roster and admin review
routes retain their independent access checks.

`identityReviewRequired` indicates that the authenticated Account has an
inactive, non-retired owned Player that is not a reusable choice but still
blocks approval of a new Player. It exposes no Player ID or name. The admission
UI explains that admin review is needed and disables the new-Player path when
there is no active owned profile to reuse. Active owned profiles remain usable;
inactive profiles are never presented as reusable.

The modern admission UI obtains proof before rendering ordinary candidate
choices. The older claim-requests UI handles `PASSWORD_REQUIRED` by prompting
for the password, requesting proof, and retrying the original request through
the same endpoint. Both `/api/clubs/{id}/claim-requests` and the deprecated
`/api/communities/{id}/claim-requests` remain available and enforce the same
gate. The name-based legacy `/api/clubs/join` endpoint (and its community
alias) continues to validate the club password and derive a new-Player request
from the authenticated account; client-supplied target IDs cannot select or
claim an existing Player through that route.

## Migration and validation evidence

The feature includes `20261008120000_placeholder_claim_recovery`,
`20261008140000_authorized_identity_transitions`, and two additive migrations:
`20261008150000_correction_global_identity_guards` and
`20261008160000_ordinary_claim_identity_authority`. Migration 0815 adds
correction-only global ownership checks at issuance, execution, retirement,
and final approval. Migration 0816 adds checks at ordinary CLAIM redemption
and at the unowned-Player-to-Account ownership transition. These checks count
all non-retired owned Players, regardless of membership or active state, and
exempt only explicitly retired rows and the exact target Player. Neither
migration rewrites legacy ownership rows or adds a global unique constraint.
Prisma cannot express all views, triggers, or partial unique indexes; use the
reviewed migration chain. The 0814 migration SHA-256 remains
`D7612A0A886FA0B721F06633182869628C7FEFC36153DCCFD72A87FF40A7CA14`; 0815 is
the correction-specific forward migration and 0816 is the ordinary-claim
forward migration. Do not use `db push` as a substitute.

The pristine `origin/main` baseline at the SHA above was tested in an isolated
checkout with a baseline-generated Prisma client, local SQLite, and no copied
`.env` or private credential files. The command was
`npx vitest run src --maxWorkers=4 --reporter=json --outputFile=origin-6c47-vitest.json`.
It completed in 9m37s with **1,964 tests: 1,934 passed, 17 failed, 13 pending**
in 272 test files (262 passed files and 10 failed files). Fifteen failures were
in matchmaking tests and two were Windows harness/platform failures. A
controlled baseline smoke/rehearsal run passed 15/16: production smoke passed
5/5 and production rehearsal passed 10/11; the remaining fixture expects
restrictive POSIX mode bits, while Windows Node reports broader mode bits after
`chmod`. The fail-closed guard was not weakened.

The final browser suite on the current 0816 runtime passed **10/10**, with zero
failures, skips, or flaky cases. It includes the exact normal
`NEW_PLAYER` request → admin approval → removal/revocation → exact-account correction and future session
flow, an access-only restoration, the older recovery flow, and the existing
invitation continuation cases. The correction scenario verified the same
Account and original Player IDs, no third owned Player, unchanged sporting
history, and future match/rating writes on the original ID. The host/admin
score submission returned `200 COMPLETED`; this is not coverage of a pending
score-review flow. The access-only scenario restored the exact owned Player to
MEMBER without creating, transferring, or retiring a Player and verified
receipt replay. Browser log and artifacts are under
`C:\Users\pc\AppData\Local\Temp\phase1-e2e-validation-20261009-node-cache-ea2fca6417ff4fccabbcdcaf40ffaa56\full-10-final.log`
and
`C:\Users\pc\AppData\Local\Temp\phase1-e2e-validation-20261009-node-cache-ea2fca6417ff4fccabbcdcaf40ffaa56\full-10-final-output`.

The final recovery integration file passed **215/215**, with no failures or
skips, after adding the 0816 ordinary-claim issuer and account-wide identity
guards. The expanded cases cover current issuer authority, successful receipt
replay without re-granting revoked access, typed cross-club identity conflicts,
database guard checkpoints, and preservation of legacy multi-owned rows. The
populated predecessor migration checks passed **2/2** on native SQLite and
local file-backed libSQL; these are included in the 215 total. The legacy
wrapper plus protected-alias integration tests separately passed **31/31**.
The alias checks preserve the old
`targetUserId` input, require a matching account/club-scoped password proof,
return a pending request after valid proof, and reject a missing target with
400 without creating a request. The final recovery JSON/log are at
`C:\Users\pc\AppData\Local\Temp\phase1-crossclaim-validation-20261009-747edb1e471d468bbf3f88d5aca665cf\player-invitations-final-215.json`
and the adjacent `.log`. DB migration, guard, race, and snapshot details are in
`C:\Users\pc\AppData\Local\Temp\placeholder-claim-db-final-verification-20261009.md`.
The independent retired-identity/access audit is in
`C:\Users\pc\AppData\Local\Temp\retired-identity-final-audit-20261009-6c47bdfa\identity-audit.md`.

Prisma schema validation passed. Source TypeScript passed with an external Temp
tsconfig inheriting the project compiler options/source globs, excluding the
malformed stale `.next/dev/types` directory, and including fresh isolated route
types and validator. The standard `npx tsc --noEmit` command remains blocked by
a parse error in `.next/dev/types/routes.d.ts:106`; that ignored cache was
preserved. The final `npm run build` exited 0 using the documented Next
`typescript.tsconfigPath` and an isolated `distDir`; it completed strict
TypeScript, generated 14/14 static pages, and emitted build/route manifests. The
ignored `next-env.d.ts` points at the fresh route declaration under
`node_modules/.cache/phase1-next-build-final-capture-4984d8153b234fd5a6fab48e7efd11fb`;
that path exists. The harness changes to `next.config.ts` and `tsconfig.json`
were restored to their captured prebuild SHA-256 hashes. The raw full-tree
ESLint run reported 12 errors/48 warnings across 813 files; all 12 errors are
`no-explicit-any` in preserved ignored `test-results-social-probe/live.test.ts`
and `wait.test.ts` (6 each). Excluding that artifact folder, source ESLint
exited 0 across 811 files with 0 errors/46 warnings. The 85 changed TS/JS paths
had 0 errors/3 warnings: baseline `NextResponse` imports at line 2 in the
sessions join route, sessions roster route, and users stats route. Three new
unused symbols were removed. Lint JSON logs are under
`C:\Users\pc\AppData\Local\Temp\phase1-final-eslint-2146432d3c004bc596f4856b6ca0c8b8`.

The canonical current `npx vitest run src --maxWorkers=4` completed in 417
seconds with **2,248 tests: 2,215 passed, 20 failed, 13 skipped** in 285 test
files (270 pass, 9 fail, 6 skipped). Compared with the pristine same-scope
baseline, there are **15 common failures, 5 current-only, and 2 baseline-only**.
The 15 common failures are 14 matchmaking assertions and one Windows
production-rehearsal guard test. The current-only failures are 15th
player-group-selection assertion and four Windows mode/ACL cutover safety
tests. The paired player-group assertion passed in an isolated run on both
baseline and current source (1 pass/15 filtered skips on each), so its
full-suite-only failure is load/order-sensitive but remains unresolved. The
two baseline-only failures (a production smoke preflight and another
matchmaking API-selection assertion) passed on current source. The exact
title/file comparison is
`C:\Users\pc\AppData\Local\Temp\phase1-src-final-20261009-2a9c65a0b15d4acfa5a13c1ad1f8d83b\baseline-title-comparison.txt`;
raw JSON and console log are in the same folder. Keep the 20 full-suite failures
visible; the isolated paired result does not erase the order-sensitive failure.

An exploratory unfiltered Vitest run completed with **2,253 tests: 2,190
passed, 50 failed, 13 pending** in 305 test files (264 passed files, 41 failed
files). It included E2E and ignored probe files, so it is not the canonical
`src` suite. At title level, all 17 baseline failed titles appeared in that
run, with 33 additional failed titles; the exploratory comparison is
`C:\Users\pc\AppData\Local\Temp\phase1-final-vitest-full-8c708063491441b38a836a16eaa62607\baseline-title-comparison.txt`.
Do not characterize every current failure as pre-existing.

The separate production safety/smoke diagnostic used only synthetic
credentials and local Temp fixtures: 43 tests, 39 passed and 4 failed. All five
smoke tests passed; no production request was made. The four failures are
Windows file-mode/ACL assumptions in cutover safety fixtures (`chmod` and
directory cleanup), which stop at `PRIVATE_DIRECTORY_REQUIRED` or the expected
POSIX mode check. No production or hosted Turso rehearsal was performed.
Native Prisma deploy successfully applied all 56 migrations to a precreated
empty disposable local SQLite file; this Windows Prisma version fails with a
blank schema-engine error if the SQLite file does not exist first. Evidence is
in
`C:\Users\pc\AppData\Local\Temp\phase1-prisma-cli-emptyfile-33d8098dd2bf4052bf8382e1922615fd`.

The final worktree snapshot is 61 tracked modified plus 30 untracked files
(91 paths with untracked files expanded), with no staged changes, commits,
pushes, merges, or production actions. The 86 intake paths are all still
present; five additional authorized paths are listed above. The ignored
`next-env.d.ts` is generated harness state and references a fresh route-types
file that exists; the normal project `next.config.ts` and `tsconfig.json` are
restored.

The normal package build invokes Next build only; `prebuild` checks the Node
version and no build hook applies migrations. The final `npm run build` passed
with the isolated `distDir` and strict temporary TypeScript config described
above, after the browser server stopped. Standard `npx tsc --noEmit` remains
blocked by the preserved malformed `.next/dev` route declaration; the isolated
source and fresh-route checks passed. All tests use synthetic accounts and
disposable local databases; no production account, database, credentials,
deployment, or private rehearsal file was accessed.

## Current decision

**Merge: NO-GO under the current red canonical source-suite and standard
typecheck results.** The focused identity, authorization, database, browser,
schema, and isolated-build checks passed, and no remaining Phase 1 identity
defect was identified. The 20 canonical source-suite failures remain visible:
15 shared with baseline, five current-only (including one paired test that
passes when isolated), and two baseline failures that now pass. The paired
matcher result does not clear its full-suite load/order-sensitive failure.
Resolve or reproducibly classify the remaining suite failures and the preserved
standard typecheck cache issue before merge; do not broaden into unrelated
matchmaking or UI redesign.

**Production: NO-GO.** Hosted database compatibility, the actual requester's
eligibility and duplicate history, and the separately reviewed writer
procedure, backup/restore rehearsal, write freeze, migration, matching deploy,
and runtime verification remain unperformed and require their own explicit
authorization. The local migration rehearsal is not a production rehearsal.

## Release boundary and compatibility follow-up

Production remains held. A build, deployment, or push never applies migrations.
A production cutover requires separate explicit approval, a reviewed writer
procedure, protected backup and restore rehearsal, a coordinated write freeze,
matching code/schema revisions, and runtime-log verification. The repository's
`db:migrate:turso` command is limited to local SQLite or the registered
development endpoint with `--force`; it must not target Vercel production.
The read-only production rehearsal, if separately authorized, uses only
`private/production-rehearsal.env` and
`npm run db:rehearse:production`; its credential must not be exported as
`TURSO_*` or `DATABASE_URL`. Neither production path has been used for this
work. See the [separate release plan](placeholder-claim-recovery-release-plan.md).

The older name-based join API, both claim-request aliases, invitation links,
and existing password behavior remain compatibility surfaces during Phase 1.
A later UX phase should unify modern and legacy joining so users first see
their owned Players and eligible placeholders, make an explicit
existing-identity or new-Player choice, and receive admin approval for a new
Player. That phase must not silently translate an old payload lacking an
identity choice into a new-Player request, merge same-person records, or retire
a second Player solely because of a name match. Keep endpoint aliases until
their callers are migrated and verified together.
