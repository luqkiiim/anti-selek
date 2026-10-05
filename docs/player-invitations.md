# Admin invitations to claim an existing Player

An active club ADMIN/OWNER can invite an active, unowned Player on an unarchived roster. The invitation authorizes that exact Player, club and original ClubMember relationship. The existing player-initiated admission workflow and its approval rules remain separate.

## Storage and lifecycle

`PlayerInvitation` stores a SHA-256 hash of a cryptographically random 32-byte secret, immutable target/issuer/expiry bindings, and redemption/revocation metadata. The lifetime is seven days. A partial unique index permits one ACTIVE invitation per Player/club. Creation expires older links inside its transaction; replacement revokes the current link and creates the replacement atomically.

`PlayerInvitationEvent` records creation and terminal lifecycle transitions through database triggers. Events and terminal invitations cannot be rewritten. An ownership change, Player deactivation or roster archival permanently revokes outstanding links, including ownership assigned through generic admission. Restoring availability does not revive old links. Current database state is also checked on exchange/context/redemption. Invitations retain audit references, so clubs with invitation history cannot be deleted, matching the existing admission-history preservation model.

## Browser continuation

The URL is `/player-invites/<id>#<secret>`. The client captures and removes the fragment immediately and exchanges it through a same-origin JSON POST. The server verifies the invite hash and creates a separate random continuation handle. Only the handle's hash is saved in `PlayerInvitationContinuation`. A host-only HttpOnly, SameSite=Lax cookie contains the handle, expires within 30 minutes (or earlier with the invite), and is Secure in production/HTTPS. The raw invitation secret is never stored in sessionStorage, a cookie or the database.

Signup and sign-in preserve only the secret-free application path. Refreshes, account switching and same-tab callbacks use the continuation cookie. Account switching uses a local client navigation after sign-out to retain the current host. Reopening the original link can establish a new continuation after cookie loss/expiry. A different browser or mobile webview has a separate cookie store and must reopen the original link there. Original invite links are bearer capabilities: share privately. Error/log handlers must not serialize secrets, links, request bodies or cookie handles.

## Redemption

An active authenticated Account must explicitly confirm. Quick access cannot redeem or administer links. The issuer cannot claim their own invitation. The transaction rechecks the exact roster binding, current availability, invitation/continuation validity and ownership conflicts across every club of the target, including archived memberships.

Absent access creates ACTIVE MEMBER access. Existing ACTIVE access remains byte-for-byte unchanged, including ADMIN/OWNER/STAFF roles. Existing REVOKED (or otherwise inactive) access blocks redemption for explicit admin review **before** any consumption or ownership write. Neither historical roster roles nor Player ownership grant privileges in other clubs.

The transaction conditionally consumes the invitation, uses the existing parameterized ownership compare-and-swap, lets Phase 1's triggers project ownership onto rosters, creates access only when absent, and commits the audit together. A failure rolls everything back. Existing ownership cannot be overwritten. A repeated request from the recorded active redeemer returns the same receipt without regranting access, even after its continuation expires; other Accounts cannot replay it.

Only the new ownership field and its existing roster projections change on sporting records. Player IDs, ClubMember IDs, all original values/timestamps, matches, sessions, queues, Elo events and ratings remain unchanged. No Player or ClubMember is allocated during this flow.

## Interface and development validation

Player management, the Player editor and authorized profile views show Account connection status and invitation actions. Copy/QR are available only while the creation response is still in client memory. Later visits show expiry and explicit revocation/replacement; hashes cannot reconstruct an old link. QR rendering is local and encodes the identical secure URL. The recipient sees safe sporting context, account identity and confirmation, then opens the existing club profile and history.

The additive migration is `20261005180000_player_invitations`. Apply it explicitly to approved local/development databases before using the feature. Builds do not migrate databases. Existing production cutover/credential holds and environment safeguards remain in force; this feature does not authorize any production migration or deployment.

Tests cover SQLite/libSQL transactions, conflicts, races, permanent invalidation, audit/uniqueness guards, rollback, revoked-access blocking, unchanged sporting snapshots, QR decoding and browser continuation through refresh/sign-in/signup/account switching/lost state. Browser coverage includes mobile Chromium emulation; it does not certify actual WhatsApp/Telegram webviews or real iOS Safari.

Implementation validation: 1,709 source tests passed (5 skipped), six invitation browser flows and two existing admission browser flows passed, and TypeScript, Prisma validation, build and `git diff --check` passed. Root ESLint reported zero errors and the unchanged 46 warnings (42 unused-variable and four image-element warnings). The migration was applied explicitly to local SQLite and the registered development Turso database after consistent backups in ignored private storage; integrity and foreign-key checks passed. Production migration/deployment remains held.
