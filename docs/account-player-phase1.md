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

### Earlier Phase 1 checkpoint (historical)

The original Phase 1 checkpoint recorded the following counts from its local database and a read-only Turso snapshot rehearsal. They describe that earlier checkpoint only; they are not evidence about the current configured local database or a fresh production snapshot.

| Check | Earlier local SQLite | Earlier Turso snapshot rehearsal |
| --- | ---: | ---: |
| Original sporting Players preserved | 70 | 609 |
| Accounts copied from registered identities | 5 | 48 |
| Original ClubMember IDs preserved | 70 | 311 |
| Original rows checked across every original column | 949 | 7,716 |
| Tables checked | 20 | 21 |
| New foreign-key errors | 0 | 0 |
| Raw orphan lastPartner values retained | 0 | 85 |

A separate historical claim rehearsal used a disposable Turso snapshot with 7,707 rows. The account ID differed from the claimed Player ID. That report recorded unchanged original columns across 21 tables, including the Player's raw timestamp representation, and unchanged history/statistics digests for 19 session participations, 94 completed matches and 89 match-rating adjustments. These historical results have not been independently repeated in this integration run.

### Independent integration verification (5 October 2026)

Before applying migrations to the configured local SQLite database, a private backup and preservation manifest were saved outside the repository. `npx prisma migrate deploy` applied both identity migrations locally. The database had 21 tables and one original row; that row was preserved. It had no Players, Accounts or ClubMembers before migration. The migration ledger contained 52 entries with zero checksum mismatches; SQLite integrity, foreign-key and creator-access checks reported zero errors, and the raw orphan reference check passed.

A separate synthetic historical SQLite fixture exercised a non-empty migration rehearsal. Both migrations preserved 24 original rows across 21 tables and produced 5 Players, 2 Accounts and 4 ClubMembers. The fixture's one orphan `lastPartnerId` remained unchanged; foreign-key and creator-access checks reported zero errors. This fixture is synthetic and is not represented as a production snapshot.

No fresh production Turso snapshot was read or migrated in this run. Credentials were not configured, so the production rehearsal remains pending user setup. The production database has not been migrated or written.

## Regression coverage

Real SQLite integration tests cover normal historical claims with unequal IDs, no sporting allocation while pending, competing claims, repeated approval, cancellation/rejection, retargeting, new admission, global Player reuse, archived membership restoration and identity conflicts in every club of a target. They assert that offline roster roles cannot grant permissions and that active existing Account permissions survive a claim. Migration tests cover registered legacy identities whose IDs happen to match, copied credentials/permissions, preserved creator authority, immutable ownership, preserved orphan references, libSQL application and atomic rollback of the configured Turso runner.

Authentication regressions cover separate Account and guest Player IDs, pre-separation token invalidation, changed session versions, disabled accounts and invalidation of quick access after claiming or archiving. Sporting tests cover score submission/approval with separate actor and participant IDs, reopening both attribution fields, session creation and participation, matchmaking/queues, ratings, history, statistics and profile rendering. Compatibility tests retain existing sporting DTO shapes while the database queries use Player fields.

Browser tests cover registration through new-Player approval and existing-profile claim through visible historical statistics. Registration and pending requests allocate no Player, ClubMember or ClubAccess. A sign-in bootstrap regression prevents credential submission while the initial authentication session request is still loading, avoiding a CSRF-cookie race during fast form submission.

Integration review also covers current Account credentials when the Account and historical Player IDs differ, active OWNER avatar management and revoked-owner denial, immutable admission history blocking club deletion, and the read-only production-smoke identity preflight. The UI review capture fixtures now seed separate Account and Player records and clean them up in foreign-key order.

Validation on 5 October 2026:

| Check | Result |
| --- | --- |
| `npx vitest run src --maxWorkers=2` | 237 files passed, 3 skipped; 1,652 tests passed, 5 skipped; includes v3 |
| `npx playwright test e2e/player-admissions.spec.ts` | 2 browser flows passed |
| `npx tsc --noEmit --pretty false` | Passed |
| ESLint on 231 changed JavaScript/TypeScript files | 0 errors, 38 warnings |
| `npx eslint --format json .` | 34 errors / 59 warnings; all 34 errors match the main baseline in six unchanged files |
| `env DATABASE_URL='file:./dev.db' TURSO_DATABASE_URL= TURSO_AUTH_TOKEN= USE_TURSO=false RUN_DB_MIGRATIONS=0 VERCEL= node scripts/run-next-build.mjs` | Passed; explicit SQLite build bypasses the Turso migration hook |
| `npx prisma validate` | Passed |
| Local migration ledger checksums, FK/integrity and creator authority | Passed for both identity migrations on configured SQLite and synthetic fixture |
| `node scripts/verify-benchmark-fixtures.mjs` | Passed; all 19 frozen gzip fixtures and summaries verified |
| `git diff --check` | Passed |

The full source suite includes the v3 matchmaking tests. Legacy sporting DTO field names remain at explicit compatibility boundaries; the final audit found no remaining Account-ID-equals-Player-ID dependency in the inspected authentication, admission, sporting or profile paths.

## Production cutover

Do not apply this schema while the old application can still accept writes. Its registration and claim behavior uses the previous identity contract. Production SQL must be coordinated with a deployment that uses this schema, with writes held during the transition. A build or push alone does not prove migration completion. Obtain explicit approval for a production cutover before taking production action.

1. Before the approved window, hold automatic production deployments and ensure `RUN_DB_MIGRATIONS` is unset or `0`; the production build hook must not apply SQL before the write freeze.
2. Use a read-only credential for a preliminary fresh snapshot and private rehearsal. Compare every original row and column, credentials, permissions, raw orphan references and foreign keys against a private manifest. A read-only rehearsal token must never be used for migration.
3. At the approved window, freeze legacy application writes, take a final consistent snapshot, rehearse that exact snapshot, and save its private `before-manifest.json`. Keep writes frozen through migration, deployment and verification.
4. Only after explicit approval, use a separately provisioned, short-lived writable credential to run `npm run db:migrate:turso`. Supply it to the migration process environment; the standalone runner loads `.env`, not Next.js's `.env.local`. Never use the read-only rehearsal token for migration. The managed transaction includes the migration ledger write and preservation guards.
5. Take a post-migration read-only snapshot and compare it against the final frozen-window manifest with `verifyLegacyPreservation` from `scripts/account-player-preservation.mjs`. Require every original row/column fingerprint, credential copy, permission and foreign-key check to pass. Then activate the matching application deployment and inspect fresh Vercel runtime logs for 500s or missing-table errors.
6. Smoke-test login, safe profile discovery, admin approval, preserved history, guest access and score submission before enabling writes. If any validation fails, keep writes frozen and restore the frozen backup and compatible prior application together; never run only the old application against the new schema.

At this integration checkpoint the production migration is held: no fresh Turso snapshot was available, and no production migration, deployment or runtime smoke test was performed. Production preservation rehearsal and runtime verification remain required before cutover.

## Deliberately deferred

Physical Player merging, duplicate history transfer, ownership reassignment, historical cleanup, rating recalculation and email verification are outside Phase 1. Existing offline identity groups remain legacy sporting data; linking an account never infers ownership of another grouped Player. Future merge work needs its own conflict rules, preservation proof and audit design.
