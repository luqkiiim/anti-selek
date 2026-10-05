# Account and Player separation: Phase 1

Phase 1 is implemented and validated locally. Production migration and runtime verification await a coordinated deployment cutover.

`User` is an authenticated account stored in physical `Account`. `Player` is a durable sporting identity stored in the existing physical `User` table. The mapping keeps all historical Player identifiers intact. `Player.ownerUserId` is nullable. Account metadata and sporting metadata are independent after migration.

`ClubMember.playerId` identifies the roster entry and carries club Elo, settings and archived state. `ClubAccess.userId` identifies the account and supplies authorization. An active ADMIN/OWNER grant is required for club administration, including legacy club creators. The existing STAFF operator role is preserved. Claiming an offline ADMIN placeholder grants only MEMBER access. Account authorization is never inferred from a sporting roster role. Owning a multi-club Player does not authorize club-scoped writes in another club: participant actions require active access to an accepted club in that session, and joining or scoring for a represented club requires access to that club. Global Player profile ownership and legacy sessions with no club context remain separate from club authorization.

## Admission

Registration creates only an Account. Club discovery asks whether the person has played there before. Existing-profile search returns safe sporting context (name, photo, rating, match count and last played date), without candidate email addresses. Selecting a profile creates a pending request, with no Player or ClubMember allocation. Names never establish ownership.

Admins can approve the selected profile, select another profile, approve as new, or reject. Self approval is prohibited. Approval of an existing profile updates only its new ownership field and the ownership projections; all original Player and sporting columns remain intact. Access is granted in the reviewed club only, even when the Player already has sporting memberships in other clubs. A revoked account grant is reactivated as MEMBER rather than inheriting previous elevated permissions.

For a new club, an account can explicitly choose its owned global Player. Approval adds a ClubMember and MEMBER access. If it owns no Player, approval creates one. An archived roster entry requires renewed admin approval; approval restores that same ClubMember ID and history. A second identity in the same club, including an archived roster identity or an overlap in another club of the target, blocks approval for admin review. There is no merge, ownership release or history transfer path.

Requests retain terminal decisions and immutable audit events. A partial unique index permits one pending request per account/club. Idempotency keys are bound to exact normalized request payloads. Reviews use revision compare-and-swap inside a transaction; ownership compare-and-swap, unique indexes and projection triggers guard races. Repeated identical approval returns the recorded result.

## Storage invariants

The migration `20261004120000_separate_accounts_players` preserves the existing physical sporting tables and IDs. Registered credentials and profile data are copied to Account. Registered legacy permissions are copied to ClubAccess. The additive migration `20261005120000_preserve_legacy_creator_access` records legacy creators' existing owner authority as OWNER, including creators whose sporting role was MEMBER or STAFF. It affects only active grants copied by the first migration and leaves explicit revocations intact. Original roster roles remain provenance and cannot authorize an account.

ClubMember has a nullable owner projection maintained by triggers and a unique `(clubId, ownerUserId)` constraint. This prevents two owned Players for the same account in a club. Ownership cannot be replaced or released in Phase 1. Player IDs and existing ClubMember IDs/Player/Club relationships are immutable. Match slots, session participants, queues, rating adjustments, achievements, history and embedded JSON continue to reference Player IDs. Actors such as reviewers, score submitters and manual-rating editors reference Account IDs. Score submission separately records the participating Player when applicable.

Known orphan raw `lastPartnerId` values remain raw values, without a fabricated foreign key or data repair.

## Compatibility boundaries

Prisma storage and permission queries use Account and Player fields explicitly. Legacy URLs containing `users/[id]` or `members/[userId]` still carry **Player IDs** for sporting endpoints. Existing UI/matchmaking DTO aliases such as `userId`, `team1User1Id` and `lastPartnerId` are emitted by `sportingIdentity.ts`; these aliases carry Player IDs. They are never session Account IDs. The Social/Mixed matchmaking algorithms and historical snapshots are preserved.

Account avatar changes use `/api/user/me/avatar`. Player avatars use the sporting profile endpoint. Quick access uses an explicit guest Player identity and cannot submit account admission requests. Claiming a Player invalidates its offline quick-access identity.

## Preservation evidence

`account-player-migration-preservation.json` contains safe per-table digests covering every original row and column, plus credentials, permissions and raw orphan references. Private backups/manifests contain protected source data and are kept outside the repository.

Both identity migrations were applied to configured local SQLite with `npx prisma migrate deploy`. A consistent read-only Turso snapshot was rehearsed on a private SQLite copy, and the configured SQL runner applied both migrations with their ledger entries against local libSQL. Every original row and column was rechecked after the creator-authority correction, including the actual local database. Production Turso has not been migrated.

| Check | Configured local SQLite | Read-only Turso snapshot rehearsal |
| --- | ---: | ---: |
| Original sporting Players preserved | 70 | 609 |
| Accounts copied from registered identities | 5 | 48 |
| Original ClubMember IDs preserved | 70 | 311 |
| Original rows checked across every original column | 949 | 7,716 |
| Tables checked | 20 | 21 |
| New foreign-key errors | 0 | 0 |
| Raw orphan lastPartner values retained | 0 | 85 |

A separate claim rehearsal used an earlier disposable Turso snapshot with 7,707 original rows. The account ID differed from the claimed Player ID. All original columns in all 21 tables stayed unchanged, including the Player's raw timestamp representation. The Player's 19 session participations, 94 completed matches and 89 match-rating adjustments produced the same history/statistics digest after approval. Only the new account, admission, access and ownership fields were added. The later migration rehearsal saw nine additional production rows because the live application remained writable between snapshots.

## Regression coverage

Real SQLite integration tests cover normal historical claims with unequal IDs, no sporting allocation while pending, competing claims, repeated approval, cancellation/rejection, retargeting, new admission, global Player reuse, archived membership restoration and identity conflicts in every club of a target. They assert that offline roster roles cannot grant permissions and that active existing Account permissions survive a claim. Migration tests cover registered legacy identities whose IDs happen to match, copied credentials/permissions, preserved creator authority, immutable ownership, preserved orphan references, libSQL application and atomic rollback of the configured Turso runner.

Authentication regressions cover separate Account and guest Player IDs, pre-separation token invalidation, changed session versions, disabled accounts and invalidation of quick access after claiming or archiving. Sporting tests cover score submission/approval with separate actor and participant IDs, reopening both attribution fields, session creation and participation, matchmaking/queues, ratings, history, statistics and profile rendering. Compatibility tests retain existing sporting DTO shapes while the database queries use Player fields.

Browser tests cover registration through new-Player approval and existing-profile claim through visible historical statistics. Registration and pending requests allocate no Player, ClubMember or ClubAccess. A sign-in bootstrap regression prevents credential submission while the initial authentication session request is still loading, avoiding a CSRF-cookie race during fast form submission.

The local production build bypasses the `npm run build` Turso migration hook and explicitly selects SQLite. A successful local build does not imply a production migration or deployment. The six existing React hook lint errors in the legacy session page were reproduced against its unchanged HEAD version; they are not part of this identity change.

Final validation on 5 October 2026:

| Check | Result |
| --- | --- |
| `npx vitest run src --exclude 'src/lib/matchmaking/v3/**' --maxWorkers=2` | 213 files / 1,313 tests passed |
| `npx playwright test e2e/player-admissions.spec.ts` | 2 browser flows passed |
| `npx tsc --noEmit --pretty false` | Passed |
| ESLint on affected JavaScript/TypeScript files | Passed, excluding the six existing legacy session-page hook errors |
| Direct production build with explicit SQLite environment | Passed |
| `npx prisma validate` | Passed |
| Local migration ledger checksums, FK/integrity and creator authority | Passed for both identity migrations |
| `git diff --check` | Passed |

The independent v3 matchmaking suite was excluded from this run; identity work does not change its algorithm. Other Social/Mixed, generation, queue and rating regressions are included. Legacy sporting DTO field names remain at explicit compatibility boundaries; the final audit found no remaining Account-ID-equals-Player-ID dependency in the inspected authentication, admission, sporting or profile paths.

## Production cutover

Do not apply this schema while the old application can still accept writes. Its registration and claim behavior uses the previous identity contract. Production SQL must be coordinated with a deployment that uses this schema, with writes held during the transition. A build or push alone does not prove migration completion.

1. Freeze legacy application writes and take a fresh consistent backup.
2. Rehearse that snapshot and inspect the preservation report.
3. Run `npm run db:migrate:turso` with the configured credentials. The managed transaction includes the migration ledger write and preservation guards.
4. Take a post-migration read-only snapshot and compare it against the saved private `before-manifest.json` with `verifyLegacyPreservation` from `scripts/account-player-preservation.mjs`. Require every original row/column fingerprint, credential copy, permission and foreign-key check to pass. Then activate the matching application deployment and inspect fresh Vercel runtime logs for 500s or missing-table errors.
5. Smoke-test login, safe profile discovery, admin approval, preserved history, guest access and score submission before enabling writes.

At this implementation checkpoint the production migration is held: Turso credentials are available, but deployment API access and a safe coordinated cutover have not been established. Production runtime verification remains required.

## Deliberately deferred

Physical Player merging, duplicate history transfer, ownership reassignment, historical cleanup, rating recalculation and email verification are outside Phase 1. Existing offline identity groups remain legacy sporting data; linking an account never infers ownership of another grouped Player. Future merge work needs its own conflict rules, preservation proof and audit design.
