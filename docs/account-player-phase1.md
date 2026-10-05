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

The configured `.env.local` points to a separate development Turso database, not production, and `.env` and `.env.local` remain byte-for-byte unchanged. A read-only rehearsal first confirmed that endpoint had zero application tables. A subsequent development initialization attempt applied 18 older migrations and stopped at `20260403075615_add_test_sessions` because the existing migration chain expects a missing `crossoverMissThreshold` column. No rebaseline or further development endpoint writes were made after that failure; the development migration chain needs its own repair. The rehearsal now rejects empty and non-legacy sources before writing a manifest or copy. `USE_TURSO=false` remains as configured, so the application currently selects SQLite.

A fresh production snapshot was read through the dedicated read-only credential file on 5 October 2026. The snapshot and preservation rehearsal passed: 21 tables and 7,718 original rows were checked, including 609 sporting Players, 48 credentialed Accounts, 311 ClubMembers, 68 legacy authorization grants and 85 raw orphan `lastPartnerId` references. The local copy required no baseline migrations and had zero foreign-key, integrity or creator-access errors; creator authority was preserved. The source was not written and no production migration or deployment was performed. The tracked [safe production rehearsal report](account-player-production-rehearsal-20261005.json) contains per-table digests and aggregate checks only; it contains no raw values or primary keys. The source snapshot and manifests remain in the ignored, protected local `private/` directory.

## Regression coverage

Real SQLite integration tests cover normal historical claims with unequal IDs, no sporting allocation while pending, competing claims, repeated approval, cancellation/rejection, retargeting, new admission, global Player reuse, archived membership restoration and identity conflicts in every club of a target. They assert that offline roster roles cannot grant permissions and that active existing Account permissions survive a claim. Migration tests cover registered legacy identities whose IDs happen to match, copied credentials/permissions, preserved creator authority, immutable ownership, preserved orphan references, libSQL application and atomic rollback of the configured Turso runner.

Authentication regressions cover separate Account and guest Player IDs, pre-separation token invalidation, changed session versions, disabled accounts and invalidation of quick access after claiming or archiving. Sporting tests cover score submission/approval with separate actor and participant IDs, reopening both attribution fields, session creation and participation, matchmaking/queues, ratings, history, statistics and profile rendering. Compatibility tests retain existing sporting DTO shapes while the database queries use Player fields.

Browser tests cover registration through new-Player approval and existing-profile claim through visible historical statistics. Registration and pending requests allocate no Player, ClubMember or ClubAccess. A sign-in bootstrap regression prevents credential submission while the initial authentication session request is still loading, avoiding a CSRF-cookie race during fast form submission.

Integration review also covers current Account credentials when the Account and historical Player IDs differ, active OWNER avatar management and revoked-owner denial, immutable admission history blocking club deletion, and the read-only production-smoke identity preflight. The UI review capture fixtures now seed separate Account and Player records and clean them up in foreign-key order.

The rehearsal CLI now rejects empty and unrelated SQLite sources before generating a manifest or migration copy. The regressions verify the source remains unchanged and no manifest/rehearsal database is created. Production credentials are parsed from `private/production-rehearsal.env` into an isolated object; they are never exported to `TURSO_*` or `DATABASE_URL`. Normal remote app and migration access is restricted to the locally registered development endpoint. Full external smoke runs require both a reviewed CLI flag and environment opt-in.

Validation on 5 October 2026:

| Check | Result |
| --- | --- |
| `npx vitest run src --maxWorkers=2` | 238 files passed, 3 skipped; 1,662 tests passed, 5 skipped; includes v3. Five added guard regressions were run in the focused command below. |
| `npx vitest run src/lib/accountPlayerMigration.test.ts src/lib/productionSmokeIdentity.test.ts src/lib/productionRehearsalSafety.test.ts --maxWorkers=2` | 3 files passed; 24 tests passed, including the final JWT scope/expiry, typoed loader path, endpoint pin, and smoke bypass regressions |
| `npx vitest run src/lib/accountPlayerMigration.test.ts --maxWorkers=2` | Passed; 1 file, 9 tests, including empty and unrelated-schema rejection |
| `USE_TURSO=false CI=1 npx playwright test e2e/player-admissions.spec.ts` | 2 browser flows passed on the isolated Playwright SQLite server/database; the port 3000 development app and remote development database were not used |
| `npx tsc --noEmit --pretty false` | Passed after final production safety changes |
| ESLint on the earlier 231 Phase 1 changed JavaScript/TypeScript files | 0 errors, 38 warnings |
| ESLint on final safety files (`next.config.ts`, target/credential/migration/smoke scripts, Prisma runtime and safety tests) | Passed with 0 errors and 0 warnings |
| `node --check` on preservation, migration, rehearsal, smoke and guard scripts | Passed |
| `npx eslint --format json .` | 34 errors / 59 warnings; the 34 errors match `origin/main` in six unchanged files: Prototype.tsx (18), BottomSheet.tsx (2), Carousel.tsx (1), FlowStack.tsx (11), Keyboard.tsx (1), and useSessionStandingsImage.test.tsx (1) |
| `npm run build` after removing `.next` | Passed as a clean build with configured `USE_TURSO=false`; Prisma initialized in local SQLite mode, the package build invoked `run-next-build.mjs` directly, and no migrations ran |
| Next server NFT privacy scan | Passed; all 110 `.nft.json` traces contained zero `private/`, `.env`, or `.env.local` paths, and bundled server runtime retained the `process.cwd()` development pin check |
| `npx prisma validate` | Passed |
| Local migration ledger checksums, FK/integrity and creator authority | Passed for both identity migrations on configured SQLite and synthetic fixture |
| `node scripts/verify-benchmark-fixtures.mjs` | Passed; all 19 frozen gzip fixtures and summaries verified |
| `git diff --check` | Passed |
| Scoped production credential and target guard tests | Passed within the 24-test targeted run; isolated RO tokens accepted, writer/DDL and expiry bypasses rejected, matching dev URL accepted, unregistered target refused even with Vercel variables |
| Standard Turso migration guard tests | Passed; production target refused before connection even when separate rehearsal credentials are present, and Vercel production migration is rejected |
| Production smoke access gate | Passed; external HTTP is refused before fetch without both reviewed opt-ins, even if the allowed-host list is overridden; local file preflight remains available |
| `npm run db:rehearse:production` read-only source snapshot | Passed; current safe report is [account-player-production-rehearsal-20261005.json](account-player-production-rehearsal-20261005.json) |

The full source suite includes the v3 matchmaking tests. Legacy sporting DTO field names remain at explicit compatibility boundaries; the final audit found no remaining Account-ID-equals-Player-ID dependency in the inspected authentication, admission, sporting or profile paths.

## Production cutover

Do not apply this schema while the old application can still accept writes. Its registration and claim behavior uses the previous identity contract. Production SQL must be coordinated with a deployment that uses this schema, with writes held during the transition. A build or push alone does not prove migration completion. Obtain explicit approval for a production cutover before taking production action.

1. Before the approved window, hold automatic production deployments and ensure `RUN_DB_MIGRATIONS` is unset or `0`; the production build hook must not apply SQL before the write freeze.
2. Use a read-only credential for a preliminary fresh snapshot and private rehearsal. Compare every original row and column, credentials, permissions, raw orphan references and foreign keys against a private manifest. A read-only rehearsal token must never be used for migration.
3. At the approved window, freeze legacy application writes, take a final consistent snapshot, rehearse that exact snapshot, and save its private `before-manifest.json`. Keep writes frozen through migration, deployment and verification.
4. The production writer procedure is not part of this change. Design and review a separate writer runbook and command, with a separately provisioned short-lived writable credential, before the approved cutover. Do not use `npm run db:migrate:turso`, change `.env.local`, or replace the local development fingerprint with a production fingerprint. The read-only rehearsal token must never be used for migration.
5. Take a post-migration read-only snapshot and compare it against the final frozen-window manifest with `verifyLegacyPreservation` from `scripts/account-player-preservation.mjs`. Require every original row/column fingerprint, credential copy, permission and foreign-key check to pass. Only then activate the matching application deployment and inspect fresh Vercel runtime logs for 500s or missing-table errors.
6. Smoke-test login, safe profile discovery, admin approval, preserved history, guest access and score submission before enabling writes. If any validation fails, keep writes frozen and restore the frozen backup and compatible prior application together; never run only the old application against the new schema.

The production snapshot and preservation rehearsal are complete, but production migration, deployment and runtime smoke remain held. The read-only credential file is not a production writer mechanism. The default build has no migration hook, and the runner rejects Vercel production migrations. `npm run db:migrate:turso` is limited to SQLite files or the locally registered development endpoint. Changing `.env.local` alone is rejected by the endpoint pin; replacing that pin with a production fingerprint would defeat the safeguard and is expressly prohibited. Do not deploy automatically before a coordinated cutover. A separately reviewed writer process and explicit production-cutover approval are required. The read-only token was cleared locally after a failed test diagnostic exposed it; server-side invalidation/rotation is outstanding. See [production rehearsal credential status](production-rehearsal.md#credential-status) before any future rehearsal.

## Deliberately deferred

Physical Player merging, duplicate history transfer, ownership reassignment, historical cleanup, rating recalculation and email verification are outside Phase 1. Existing offline identity groups remain legacy sporting data; linking an account never infers ownership of another grouped Player. Future merge work needs its own conflict rules, preservation proof and audit design.
