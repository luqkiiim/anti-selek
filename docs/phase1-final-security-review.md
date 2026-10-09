# Phase 1 identity security review

## Current disposition — 2026-10-09

The confirmed SQL-writer invariant gap is closed by the supplemental 0815
migration and its focused tests. Code is ready for commit/merge subject to human
review. Production release remains **NO-GO** pending a separately reviewed
production migration, read-only rehearsal, eligibility verification, coordinated
write freeze, matching deployment, and explicit authorization.

This report preserves the initial read-only source review and records the
subsequent narrow SQL-guard remediation. It does not authorize a production
migration, production read/write, deployment, merge, or release.

## Frozen source and preservation

Validation froze the implementation at `6c47bdfacfa1dc6cbf31208d67ea906e698e4e02`
on `codex/placeholder-claim-recovery`, equal to `origin/main` at the time of
snapshot. The copy contains 1,177 tracked files and 30 nonignored untracked
files. Its 91 dirty file paths (61 tracked, 30 untracked) all match the live
worktree by SHA-256: 0 mismatches. No path was excluded or missing. The complete
manifest is [source-manifest.json](C:/Users/pc/AppData/Local/Temp/phase1-final-security-review-20261009-0f860e3be07c4f21b6b7e25ade1217db/source-manifest.json)
(SHA-256 `8f91406117734a53903d26cae8fbd48d293cb36f057ebe7574dbd9172bdc727d`);
the frozen source copy and pristine `6c47bdf` baseline are also retained under
`C:\Users\pc\AppData\Local\Temp\phase1-clean-copy-standard-fb9a5d2d02084a4bb88bc4730a5b6d5b`.

The final guard-validation snapshot contains 1,209 copied paths and includes the
final 0815 migration and integration-test hashes. Its manifest is
[`source-manifest-validation-final.json`](C:/dev/phase1-correction-guard-f85e62b7056a480c975a388626c60314/source-manifest-validation-final.json)
(SHA-256 `EC13FCE3C2DD175A93E61C34C5287439057B53E98651BF4C53AB17BEE290308B`).
The two source-versus-copy differences are documentation-only updates made
after that snapshot (`docs/phase1-final-security-review.md` and
`docs/placeholder-claim-recovery.md`).

The complete contents of the 30 untracked entries at that snapshot are preserved
in [untracked-full-contents.txt](C:/Users/pc/AppData/Local/Temp/phase1-final-security-review-20261009-0f860e3be07c4f21b6b7e25ade1217db/untracked-full-contents.txt)
(SHA-256 `34c6df0561da13bb609354562018de10dc9f1fd1636081ea3bacf1efd4b95d95`).
No credential/configuration files were included. The supplemental 0815 migration
and later test/document updates are recorded below and were added after that
initial bundle.

## Security-critical invariant map

| Area | Source and verified lines | Enforced behavior |
|---|---|---|
| Physical request model | [schema.prisma](C:/dev/tournament-app/prisma/schema.prisma:559), [PlayerInvitation model](C:/dev/tournament-app/prisma/schema.prisma:611) | Prisma `ClubAdmissionRequest` maps to physical SQL table `ClubJoinRequest`; invitation purpose and immutable target/source/recipient/access snapshots are persisted. |
| Permanent retirement | [migration 0812](C:/dev/tournament-app/prisma/migrations/20261008120000_placeholder_claim_recovery/migration.sql:4) | Adds a one-way retirement-event marker and partial uniqueness for nonretired club roster ownership. The blocker view is defined at lines 12–54; the audited marker transition is at 104–120; retired roster/Player update and delete guards are at 121–138. |
| Future references | [migration 0812](C:/dev/tournament-app/prisma/migrations/20261008120000_placeholder_claim_recovery/migration.sql:153) | Rejects new or changed memberships, sessions, matches, queued matches, host credits, rating adjustments, offline links, notifications, and pending claim/admission references to retired Players (lines 153–228). Historical rows remain readable. |
| Purpose-bound SQL authorization | [migration 0814](C:/dev/tournament-app/prisma/migrations/20261008140000_authorized_identity_transitions/migration.sql:45) | Invitation insert validates the local issuer, target membership, purpose, exact recipient/source, access snapshot, and current source/target conditions (lines 45–92). Request and execution event guards bind the same invitation (174–295). |
| Correction retirement | [migration 0814](C:/dev/tournament-app/prisma/migrations/20261008140000_authorized_identity_transitions/migration.sql:391) | Retirement requires the exact redeemed correction, target/source/member IDs, issuer and recipient, immutable issue/execution events, current issuer access revision, reason, and eligible source. Only source deactivation is allowed before marking and all other Player columns are held constant (465–485). |
| Access restoration | [migration 0814](C:/dev/tournament-app/prisma/migrations/20261008140000_authorized_identity_transitions/migration.sql:490) | Three guards reject access-restoration issue, execution, or approval if the recipient owns a different nonretired Player. Same target across clubs and retired duplicates are exempt. |
| Retirement eligibility | [playerRetirement.ts](C:/dev/tournament-app/src/lib/playerRetirement.ts:21) | Service reads the SQL-owned blocker view without performing lazy achievement writes. The source may be active or inactive and is never reactivated; correction requires a currently active, unowned original with an unarchived exact membership ([authorization service](C:/dev/tournament-app/src/lib/playerInvitationAuthorization.ts:261), :511). |
| Writer serialization | [clubAdmissions.ts](C:/dev/tournament-app/src/lib/clubAdmissions.ts:26) | `admissionTransaction` reserves the SQLite writer before reading and retries recognized write conflicts. Ordinary review and special issue/confirmation use it. |
| Ordinary CLAIM | [playerInvitations.ts](C:/dev/tournament-app/src/lib/playerInvitations.ts:87) | CLAIM retains its separate bearer exchange, continuation, redeem, and admin-review path. Redemption requires an active account, rejects self-approval, checks owned-profile conflicts, consumes once, and links only the selected unowned Player (147–168). |
| Existing CLAIM recovery | [playerInvitationRecovery.ts](C:/dev/tournament-app/src/lib/playerInvitationRecovery.ts:19) | Recovery eligibility checks target/source and cross-club ownership. The review path revalidates active local ADMIN/OWNER authority, explicit MEMBER restoration and retirement confirmation, and writes the recovery decision/audit in the same transaction (97–155). |
| Correction and ACCESS_RESTORE | [playerInvitationAuthorization.ts](C:/dev/tournament-app/src/lib/playerInvitationAuthorization.ts:72) | Issuance requires active local ADMIN/OWNER (no STAFF/global-admin-only override); the picker is club-scoped. The global conflict predicate is lines 133–137. Exact issue inputs, replacement CAS, retirement, and access intent are validated at 225–294. |
| Recipient confirmation and replay | [playerInvitationAuthorization.ts](C:/dev/tournament-app/src/lib/playerInvitationAuthorization.ts:476) | Confirmation requires the bound active recipient, continuation, no self-approval, and current issuer access ID/role/status/revision. The recipient’s access ID/status/role/revision is also compared to issuance (492–495). A redeemed invite returns its immutable execution receipt on replay (534–552). |
| Correction execution | [playerInvitationAuthorization.ts](C:/dev/tournament-app/src/lib/playerInvitationAuthorization.ts:559) | Optional supersession requires explicit request ID + revision, exact unavailable prior CLAIM, a cancellation CAS/event, then the new request/event/invitation consumption; all effects are transactional (559–627). The service archives/deactivates/marks only the exact source and claims the original target without transferring history (628–648). |
| Protected join proof | [clubJoinProof.ts](C:/dev/tournament-app/src/lib/clubJoinProof.ts:4), [clubAdmissionApi.ts](C:/dev/tournament-app/src/lib/clubAdmissionApi.ts:101), [join-proof route](C:/dev/tournament-app/src/app/api/clubs/join-proof/route.ts:28) | A short-lived account/club/password-config-bound proof is held in HttpOnly cookies. Locked discovery hides candidates and returns only status summaries; proof is not an identity-invitation capability. |

Migration 0812 is the earlier, already-existing placeholder-claim recovery
migration preserved by this Phase 1 work. Migration 0814 is the new forward-only
purpose-bound transition migration; it adds the access revision field and
identity invitation bindings at lines 3–19. The migration increments revisions
on role/status changes and makes them monotonic at lines 27–40. The schema stores
the revision on `ClubAccess` ([schema.prisma](C:/dev/tournament-app/prisma/schema.prisma:177))
and snapshots both the issuer and recipient access ID/status/role/revision on the
invitation ([schema.prisma](C:/dev/tournament-app/prisma/schema.prisma:616)).

The administrator UI that collects the exact target, Account ID, source Player
ID, access action, retirement authorization, reason, and replacement consent is
[PlayerIdentityInvitationActions.tsx](C:/dev/tournament-app/src/components/club-admin/PlayerIdentityInvitationActions.tsx:37)
(selection and access-action mapping at lines 21–35, issue payload at 115–165,
ACCESS_RESTORE guard at 210–254, correction review/consent at 270–326). It is
mounted in the existing admin profile [PlayerInvitationPanel.tsx](C:/dev/tournament-app/src/components/club-admin/PlayerInvitationPanel.tsx:10)
and is fed by the server-authorized profile controls in
[PlayerProfileView.tsx](C:/dev/tournament-app/src/components/profile/PlayerProfileView.tsx:1969).
The old CLAIM recovery review UI remains
[PlayerRecoveryReview.tsx](C:/dev/tournament-app/src/components/club-admin/PlayerRecoveryReview.tsx:14),
mounted from [ClaimRequestsPanel.tsx](C:/dev/tournament-app/src/components/club-admin/ClaimRequestsPanel.tsx:124).
The recipient’s purpose-specific confirmation, exact source/target preview,
authorizer/recipient attribution, access before/after receipt, and explicit
supersession checkbox are in
[PlayerInvitationClaim.tsx](C:/dev/tournament-app/src/components/profile/PlayerInvitationClaim.tsx:47)
(confirmation request at lines 211–220; purpose dispatch at 262). Protected
ordinary admission proof and inactive-owned identity guidance are shown in
[JoinClubAdmission.tsx](C:/dev/tournament-app/src/components/prototype/JoinClubAdmission.tsx:193).

## Thin HTTP entrypoints

These route files are wrappers; the authorization and transactions live in the
shared services above.

- Admin picker and issue: [identity-options](C:/dev/tournament-app/src/app/api/clubs/[id]/players/[playerId]/identity-options/route.ts:1), [correction-invitations](C:/dev/tournament-app/src/app/api/clubs/[id]/players/[playerId]/correction-invitations/route.ts:1), and [access-restore-invitations](C:/dev/tournament-app/src/app/api/clubs/[id]/players/[playerId]/access-restore-invitations/route.ts:1).
- Recipient actions: [purpose-specific correction confirmation](C:/dev/tournament-app/src/app/api/player-invites/[invitationId]/confirm-correction/route.ts:1) and [access-restoration confirmation](C:/dev/tournament-app/src/app/api/player-invites/[invitationId]/confirm-access-restore/route.ts:1); ordinary [context](C:/dev/tournament-app/src/app/api/player-invites/[invitationId]/route.ts:1), [secret exchange](C:/dev/tournament-app/src/app/api/player-invites/[invitationId]/exchange/route.ts:1), [CLAIM redemption](C:/dev/tournament-app/src/app/api/player-invites/[invitationId]/redeem/route.ts:1), and [CLAIM recovery](C:/dev/tournament-app/src/app/api/player-invites/[invitationId]/recovery-request/route.ts:1) remain separate.
- Admission and review: [canonical join-requests](C:/dev/tournament-app/src/app/api/clubs/join-requests/route.ts:1), per-club [admission review](C:/dev/tournament-app/src/app/api/clubs/[id]/join-requests/[requestId]/route.ts:1), and deprecated [community claim-request alias](C:/dev/tournament-app/src/app/api/communities/[id]/claim-requests/route.ts:1) delegate to `clubAdmissionApi`.

`playerInvitationApi.ts:44–57` provides same-origin/rate-limit and authenticated
account guards, including rejection of QuickAccess sessions. It fixes invitation
purpose from the route rather than request body and wraps authorized mutations
with the writer-reserved transaction (`:127–175`).

## Confirmed SQL parity issue at initial review (resolved below)

The application service rejects correction when the bound recipient owns another
distinct nonretired Player: `playerInvitationAuthorization.ts:271–273` and
`:500–515`, through `globalOwnedConflict` at `:133–137`. The 0814 correction
branches at `:79–85` (invitation insert), `:280–288` (execution event), and
`:413–458` (retirement marker) do not repeat that account-wide predicate. Its
final-approval correction arm at `:350–367` also lacks it. The only SQL
`IDENTITY_CONFLICT` guards at `:490–513` are scoped to ACCESS_RESTORE.

The database reviewer independently reproduced a full direct-SQL correction on
native SQLite and local file-backed libSQL with a bound owned source and a
second distinct nonretired Player owned in another club. The SQL path reached
REDEEMED/APPROVED, retired the selected source, linked the target, and left the
other identity nonretired; foreign-key validation was clean. This is a database
writer policy bypass. The application request path remained gated by the service
predicate inside the writer-reserved transaction. At the initial review,
database enforcement was incomplete and the branch was not ready to merge.

The disposable evidence is in
[`probe-full.log`](C:/Users/pc/AppData/Local/Temp/phase1-sql-policy-05219469b6d84114b8d3044adee51130/probe-full.log)
and [`probe-libsql.log`](C:/Users/pc/AppData/Local/Temp/phase1-sql-policy-05219469b6d84114b8d3044adee51130/probe-libsql.log).
The narrow SQL correction is a `NOT EXISTS` for another owned, nonretired Player
at the correction insert, execution-event, retirement-marker, and final
approval guards. Before source retirement, allow the exact bound source as the
recipient’s one existing identity; at final approval, allow the newly linked
target and ignore the source only after it is retired. Do not add a global
ownership unique index or alter existing multi-owned legacy accounts.

At the time of this initial review, no SQL guard patch had been applied and the
confirmed bypass was an open blocker. The supplemental migration and its
resolution evidence are recorded below; the earlier direct-SQL reproduction
and initial no-go finding remain preserved here.

## Documentation and validation bounds

The initial review caught an archived-only wording issue in
[placeholder-claim-recovery.md](C:/dev/tournament-app/docs/placeholder-claim-recovery.md:40).
The overview now scopes that requirement to ordinary `CLAIM` recovery;
`CORRECTION` allows an eligible active or archived source membership and
archives an active row during the confirmed transaction. Its target remains
constrained to an active Player and exact unarchived roster row;
`ACCESS_RESTORE` only restores an existing row and does not activate an inactive
Player. The release plan
[placeholder-claim-recovery-release-plan.md](C:/dev/tournament-app/docs/placeholder-claim-recovery-release-plan.md:47)
retains the earlier exploratory full-suite status as a separate release record;
this report's current disposition above supersedes its code-merge status. It
does not claim production migration or deployment.

The initial read-only audit ran no tests or production commands. The SQL
reproduction used only disposable local SQLite and file-backed libSQL data. The
snapshot and source bundle are evidence artifacts; all untracked file contents
present at that snapshot are in the linked bundle above. The later migration,
focused tests, and documentation updates are separately recorded below.

## Independent final validation and preservation

Validation completed the standard command sequence in two disposable source
copies with independent installs. The clean-root copy under
`C:\dev\phase1-clean-copy-standard-0bde33678d144862af3fae8d4922a8f8` passed:

- `npm ci --no-audit --no-fund` and Prisma Client generation.
- `npx tsc --noEmit` before build.
- `npx prisma migrate deploy`, applying 56 migrations only to a precreated
  disposable local SQLite file.
- Plain `npm run build`, with default Next config and no workspace-root warning,
  override, or ignored build errors.
- `npx tsc --noEmit` after build/type generation.

The first copy under Temp also passed, but Next warned that a parent lockfile
caused it to infer `C:\Users\pc` as its workspace root. The clean-root run
avoids that harness condition. The exact command logs, JSON ledger, and
preservation manifests are in
[`clean-copy-standard-validation-report.md`](C:/Users/pc/AppData/Local/Temp/phase1-clean-copy-standard-fb9a5d2d02084a4bb88bc4730a5b6d5b/clean-copy-standard-validation-report.md)
and the same directory.

The comparable full Vitest title comparison was **20 current failures versus
17 pristine-baseline failures**: 15 are common, 5 current-only, and 2
baseline-only. The 5 current-only results are:

1. Four Windows mode/ACL fixture failures in
   `src/lib/productionCutoverSafety.test.ts`: the atomic libSQL batch rollback;
   copy-only rehearsal/provenance; incomplete cutover-authorization refusal;
   and unprotected-file/symlink refusal cases.
2. One full-suite-only timeout in
   `src/lib/matchmaking/playerGroupSelection.integration.test.ts`, for the
   three-court 12 Competitive / 9 Social office workflow. The sequential run
   passed on baseline/current in 4,443.7/4,798.4 ms; the loaded default run
   passed baseline in 4,079.2 ms and timed out current at 5,326.9 ms. An
   instrumented exact-fixture run with a 30-second budget passed on both at
   5,598.9/5,969.7 ms, with identical 12 selected players, groups, fallback,
   and reason codes. Timing sensitivity is demonstrated, but its specific
   scheduling cause is unresolved; do not call this failure preexisting.

The four cutover cases failed identically on both trees: 0 passed, 4 failed, and
34 filtered skips. The loaded 87-test office diagnostic group was 77 passed / 10
failed / 0 skipped on baseline and 78 passed / 9 failed / 0 skipped on current.
These loaded stress-group results are separate from the five current-only
comparison failures and do not establish a Phase 1 product regression.

All 15 common failures remain visible in
[`baseline-title-comparison.txt`](C:/Users/pc/AppData/Local/Temp/phase1-src-final-20261009-2a9c65a0b15d4acfa5a13c1ad1f8d83b/baseline-title-comparison.txt);
they include 14 matchmaking assertions and one Windows production-rehearsal
fixture. The two baseline-only failures (production smoke preflight and one
matchmaker API-selection assertion) passed on current sources. These results
must not be summarized as “all failures were preexisting.” The four Windows ACL
fixture failures have identical baseline/current outcomes. The matcher timeout
is timing-sensitive but has no established cause. These are distinct from the
confirmed SQL-writer invariant bypass. The public application service still
checks `globalOwnedConflict` before issue and confirmation; no application
request bypass was found in this review.

The final preservation check found 0 mismatches across all 1,207 tracked and
nonignored source hashes in the frozen snapshot. The original `next.config.ts`
and `tsconfig.json` hashes match. Recursive hashes also match for `.next`
(5,968 files), `node_modules/.cache` (12,106 files), ignored probe artifacts
(3 files), and `next-env.d.ts` (1 file).

One ignored file was not captured in the before-run preservation manifest:
`node_modules/.vite/vitest/da39a3ee5e6b4b0d3255bfef95601890afd80709/results.json`.
Its current size is 29,461 bytes and SHA-256 is
`16047205c4eb4a19ae918b586c29c67c2e92a388e3653246566af7471c706e22`; its
modification time was shortly after the junction-based comparator ended.
Because there is no before-run hash, the content change and causal attribution
cannot be established. Validation did not modify, clear, or restore it. The
follow-up evidence is
[`vitest-cache-preservation-followup.md`](C:/Users/pc/AppData/Local/Temp/phase1-clean-copy-standard-fb9a5d2d02084a4bb88bc4730a5b6d5b/vitest-cache-preservation-followup.md).
Therefore this review does not claim every ignored artifact is preserved. The
the review document was the only post-snapshot addition at that preservation
check. The later 0815 migration, its test updates, and documentation changes
are captured in the final guard-validation snapshot below. The branch remained at
`6c47bdfacfa1dc6cbf31208d67ea906e698e4e02`, equal to `origin/main`; there were
no commits, pushes, merges, production access, or production writes.

## Supplemental SQL guard resolution — final results

The earlier raw-SQL reproduction was a real database-writer policy bypass: a
complete correction could proceed while the recipient owned a second distinct,
non-retired Player. The public issuance and confirmation services already
rejected that conflict through `globalOwnedConflict`; this was not a public API
request bypass. The narrow correction is the new forward migration
[`20261008150000_correction_global_identity_guards`](C:/dev/tournament-app/prisma/migrations/20261008150000_correction_global_identity_guards/migration.sql:8).
It adds four correction-only guards: issuance, execution event, source
retirement, and final approval. Before retirement only the bound source is
allowed; after retirement only the original target is allowed. Each query
counts all owned Player rows regardless of membership or active state and
excludes only IDs represented in `RetiredPlayer`. Ordinary `CLAIM` recovery is
outside these four triggers. The final approval guard is transition-only, so a
later update to an already-approved receipt is not newly blocked by this
supplemental guard.

The pre-existing 0814 migration file remains byte-for-byte unchanged at
SHA-256
`D7612A0A886FA0B721F06633182869628C7FEFC36153DCCFD72A87FF40A7CA14`.
The new 0815 migration SHA-256 is
`20F0EBB899ED3C32398D3067B2A26848CD7B4A6DA153F84C1ED6EDEAC83D243A`.
Validation confirmed Prisma schema validation and a local disposable SQLite
deployment of all 57 migrations. The current focused raw SQL results are 2/2
issuance checks across SQLite and file-backed libSQL, plus 4/4 source-marker and
final-approval checks across both engines. Each rejected the conflicting write
with `IDENTITY_CONFLICT`, preserved the transaction snapshot, and left
`PRAGMA foreign_key_check` empty. The full recovery integration file passed
197/197, the authorized API routes passed 43/43, and the populated predecessor
migration preservation checks passed on both engines (2/2). The final isolated
source TypeScript check passed. The four guard-omission controls passed 4/4.
When the marker guard was omitted, the application path reached the later
`linkUnownedPlayer` conflict and rolled back. When the final approval guard was
omitted, the disposable direct-SQL flow could approve a dual-owned identity
with a clean foreign-key check; this demonstrates why the final SQL checkpoint
is required. The final browser suite passed 10/10 with zero skips, unexpected
failures, or flaky retries in 215.9 seconds; it applied all 57 migrations to a
fresh local database. It covered legacy recovery, normal new-Player approval
followed by exact-account correction and future play on the original Player,
and exact-owned-Player access restoration. Results and logs are at
[`playwright-results.json`](C:/dev/phase1-correction-guard-f85e62b7056a480c975a388626c60314/browser-final-10/playwright-results.json)
and the adjacent `playwright-run.log`. This closes the Phase 1 code merge
blocker subject to human review. Production release remains held as stated at
the top of this report. The exact control evidence is in
`C:\Users\pc\AppData\Local\Temp\phase1-correction-guard-controls-20261009\diagnostic.json`
and its `.log` companion.

The initial ORM-wrapped checkpoint attempt reported four Prisma `P2003`
failures, prompting direct SQL probes. The raw probes then observed the
expected literal `IDENTITY_CONFLICT` at each blocked checkpoint, unchanged
transaction snapshots, and no foreign-key violations; the final focused and
full test runs passed. The initial attempt is preserved at
`C:\dev\phase1-correction-guard-f85e62b7056a480c975a388626c60314\focused-correction-identity-guards.json`
and its `.log` companion. A first full 197-assertion run also exited 1 during
libSQL fixture teardown with `EBUSY`; the final registered-fixture rerun exited
0 at 197/197. Both logs remain under the same run directory's
`full-recovery-final` and `full-recovery-clean-exit` folders, respectively.

Local migration metadata did not list 0814 in 11 inspected ledgers. The remote
format endpoint was unregistered and was not contacted, so this does not prove
the migration is globally unapplied. No remote migration, production access,
or production write occurred.

One additional ignored-file preservation caveat was identified during
validation: a TypeScript command ran in the original checkout and wrote
`C:\dev\tournament-app\tsconfig.tsbuildinfo` (899,316 bytes, modified
2026-10-09 06:35:50.704Z). There was no pre-run hash, so the byte delta cannot
be established; the file was left untouched afterward. Combined with the
Vitest cache caveat above, the review does not claim that every ignored artifact
was preserved.

The final local Git view is branch `codex/placeholder-claim-recovery`, with
`HEAD` and the fetched `origin/main` both at
`6c47bdfacfa1dc6cbf31208d67ea906e698e4e02`. The worktree reports 61 tracked
modified paths, 32 untracked file paths, and 0 staged paths (93 porcelain file
entries total). No commit, push, merge,
or remote migration was performed. The four files in the narrow SQL-guard fix
slice are the new
[`0815 migration`](C:/dev/tournament-app/prisma/migrations/20261008150000_correction_global_identity_guards/migration.sql:8),
[`playerInvitations.integration.test.ts`](C:/dev/tournament-app/src/lib/playerInvitations.integration.test.ts:1610)
(guard-specific tests in an already-modified Phase 1 test file),
[`placeholder-claim-recovery.md`](C:/dev/tournament-app/docs/placeholder-claim-recovery.md:40),
and this review document. The 0814 migration checksum remains
`D7612A0A886FA0B721F06633182869628C7FEFC36153DCCFD72A87FF40A7CA14`; final
0815 SHA-256 is
`20F0EBB899ED3C32398D3067B2A26848CD7B4A6DA153F84C1ED6EDEAC83D243A`, and the
test file SHA-256 is
`63ECC9296D63A133155E7141F1581F8084D21662AF987F44C6DDC5060C7CE162`.
