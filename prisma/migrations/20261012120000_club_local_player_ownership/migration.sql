-- Forward-only local ownership. Old sporting values, IDs and terminal receipts
-- remain byte-for-byte intact. Only explicitly incompatible pending work is
-- cancelled below, with its original payload included in an immutable audit.
ALTER TABLE "Account" ADD COLUMN "mixedSideOverride" TEXT CHECK ("mixedSideOverride" IS NULL OR "mixedSideOverride" IN ('UPPER','LOWER'));
ALTER TABLE "CommunityMember" ADD COLUMN "ownershipRevision" INTEGER NOT NULL DEFAULT 0 CHECK ("ownershipRevision">=0);
ALTER TABLE "Session" ADD COLUMN "ratingPolicyVersion" INTEGER NOT NULL DEFAULT 1 CHECK ("ratingPolicyVersion" IN (1,2));
ALTER TABLE "SessionPlayer" ADD COLUMN "profileClubId" TEXT REFERENCES "Community"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SessionPlayer" ADD COLUMN "participantAccountId" TEXT REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PlayerInvitation" ADD COLUMN "targetOwnershipRevision" INTEGER NOT NULL DEFAULT 0 CHECK ("targetOwnershipRevision">=0);
CREATE UNIQUE INDEX "SessionPlayer_sessionId_participantAccountId_key" ON "SessionPlayer"("sessionId","participantAccountId");
CREATE INDEX "SessionPlayer_profileClubId_userId_idx" ON "SessionPlayer"("profileClubId","userId");

-- Canonical preference is backfilled only when every retained, nonretired local
-- profile agrees after applying the existing legacy gender/preference rules.
WITH resolved AS (
 SELECT DISTINCT m."ownerUserId" AS accountId,p."id" AS playerId,
 CASE WHEN p."mixedSideOverride" IN ('UPPER','LOWER') THEN
   CASE WHEN (p."gender"='FEMALE' AND p."mixedSideOverride"='UPPER') OR (p."gender"='MALE' AND p."mixedSideOverride"='LOWER') THEN p."mixedSideOverride" ELSE NULL END
  WHEN p."gender"='FEMALE' AND p."partnerPreference"='OPEN' THEN 'UPPER'
  WHEN p."gender"='MALE' AND p."partnerPreference"='FEMALE_FLEX' THEN 'LOWER' ELSE NULL END AS value
 FROM "CommunityMember" m JOIN "User" p ON p."id"=m."userId"
 WHERE m."ownerUserId" IS NOT NULL AND m."retiredByAdmissionEventId" IS NULL
), agreement AS (
 SELECT accountId,min(value) AS value FROM resolved GROUP BY accountId HAVING count(DISTINCT coalesce(value,'<NULL>'))=1
)
UPDATE "Account" SET "mixedSideOverride"=(SELECT value FROM agreement WHERE accountId="Account"."id")
 WHERE "id" IN (SELECT accountId FROM agreement);

CREATE TABLE "ClubPlayerOwnershipEvent" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "clubId" TEXT NOT NULL REFERENCES "Community"("id") ON DELETE RESTRICT,
 "clubMemberId" TEXT NOT NULL REFERENCES "CommunityMember"("id") ON DELETE RESTRICT,
 "playerId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
 "actorUserId" TEXT NOT NULL REFERENCES "Account"("id") ON DELETE RESTRICT,
 "action" TEXT NOT NULL CHECK ("action" IN ('CLAIM','REMOVE','DISCONNECT','LEAVE','ARCHIVE')),
 "previousOwnerUserId" TEXT REFERENCES "Account"("id") ON DELETE RESTRICT,
 "newOwnerUserId" TEXT REFERENCES "Account"("id") ON DELETE RESTRICT,
 "previousOwnershipRevision" INTEGER NOT NULL,
 "newOwnershipRevision" INTEGER NOT NULL,
 "accessId" TEXT REFERENCES "ClubAccess"("id") ON DELETE RESTRICT,
 "previousAccessRevision" INTEGER,
 "newAccessRevision" INTEGER,
 "previousAccessStatus" TEXT,
 "newAccessStatus" TEXT,
 "previousAccessRole" TEXT,
 "newAccessRole" TEXT,
 "invitationId" TEXT REFERENCES "PlayerInvitation"("id") ON DELETE RESTRICT,
 "admissionRequestId" TEXT REFERENCES "ClubJoinRequest"("id") ON DELETE RESTRICT,
 "releaseEventId" TEXT REFERENCES "ClubPlayerOwnershipEvent"("id") ON DELETE RESTRICT,
 "metadataBeforeJson" TEXT NOT NULL CHECK(json_valid("metadataBeforeJson")),
 "metadataAfterJson" TEXT NOT NULL CHECK(json_valid("metadataAfterJson")),
 "detailsJson" TEXT NOT NULL DEFAULT '{}' CHECK(json_valid("detailsJson")),
 "reason" TEXT NOT NULL,
 "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "ClubPlayerOwnershipEvent_clubMemberId_newOwnershipRevision_key" ON "ClubPlayerOwnershipEvent"("clubMemberId","newOwnershipRevision");
CREATE UNIQUE INDEX "ClubPlayerOwnershipEvent_invitationId_key" ON "ClubPlayerOwnershipEvent"("invitationId");
CREATE UNIQUE INDEX "ClubPlayerOwnershipEvent_releaseEventId_key" ON "ClubPlayerOwnershipEvent"("releaseEventId");
CREATE INDEX "ClubPlayerOwnershipEvent_clubId_playerId_createdAt_idx" ON "ClubPlayerOwnershipEvent"("clubId","playerId","createdAt");
CREATE INDEX "ClubPlayerOwnershipEvent_previousOwnerUserId_clubId_idx" ON "ClubPlayerOwnershipEvent"("previousOwnerUserId","clubId");
CREATE TRIGGER "ClubPlayerOwnershipEvent_no_update" BEFORE UPDATE ON "ClubPlayerOwnershipEvent"
BEGIN SELECT RAISE(ABORT,'LOCAL_OWNERSHIP_AUDIT_IMMUTABLE'); END;
CREATE TRIGGER "ClubPlayerOwnershipEvent_no_delete" BEFORE DELETE ON "ClubPlayerOwnershipEvent"
BEGIN SELECT RAISE(ABORT,'LOCAL_OWNERSHIP_AUDIT_IMMUTABLE'); END;
CREATE TRIGGER "ClubPlayerOwnershipEvent_no_replace" BEFORE INSERT ON "ClubPlayerOwnershipEvent"
WHEN EXISTS (SELECT 1 FROM "ClubPlayerOwnershipEvent" e WHERE e."id"=NEW."id"
 OR (e."clubMemberId"=NEW."clubMemberId" AND e."newOwnershipRevision"=NEW."newOwnershipRevision")
 OR (NEW."invitationId" IS NOT NULL AND e."invitationId"=NEW."invitationId")
 OR (NEW."releaseEventId" IS NOT NULL AND e."releaseEventId"=NEW."releaseEventId"))
BEGIN SELECT RAISE(ABORT,'LOCAL_OWNERSHIP_AUDIT_IMMUTABLE'); END;

-- Retain old immutable receipts, but permanently close the global release,
-- correction, restore, recovery and retirement writer capabilities.
CREATE TRIGGER "LegacyRelease_writer_closed" BEFORE INSERT ON "PlayerOwnershipRelease"
BEGIN SELECT RAISE(ABORT,'LEGACY_IDENTITY_WRITER_CLOSED'); END;
CREATE TRIGGER "LegacyReleaseClaim_writer_closed" BEFORE INSERT ON "PlayerOwnershipReleaseClaim"
BEGIN SELECT RAISE(ABORT,'LEGACY_IDENTITY_WRITER_CLOSED'); END;
CREATE TRIGGER "LegacyRelease_update_closed" BEFORE UPDATE ON "PlayerOwnershipRelease"
BEGIN SELECT RAISE(ABORT,'LEGACY_IDENTITY_WRITER_CLOSED'); END;
CREATE TRIGGER "LegacyAdmission_writer_closed" BEFORE INSERT ON "ClubAdmissionEvent"
WHEN NEW."action" IN ('APPROVE_RECOVERY','EXECUTE_AUTHORIZED_CORRECTION','EXECUTE_AUTHORIZED_ACCESS_RESTORE')
BEGIN SELECT RAISE(ABORT,'LEGACY_IDENTITY_WRITER_CLOSED'); END;
CREATE TRIGGER "LegacyRecovery_insert_closed" BEFORE INSERT ON "ClubJoinRequest"
WHEN NEW."originInvitationId" IS NOT NULL OR NEW."kind"='OWNED_PLAYER'
BEGIN SELECT RAISE(ABORT,'LEGACY_IDENTITY_WRITER_CLOSED'); END;
CREATE TRIGGER "LegacyRecovery_approval_closed" BEFORE UPDATE OF "status" ON "ClubJoinRequest"
WHEN NEW."status"='APPROVED' AND (NEW."originInvitationId" IS NOT NULL OR NEW."kind"='OWNED_PLAYER')
BEGIN SELECT RAISE(ABORT,'LEGACY_IDENTITY_WRITER_CLOSED'); END;
CREATE TRIGGER "LegacyRetirement_writer_closed" BEFORE UPDATE OF "retiredByAdmissionEventId" ON "CommunityMember"
WHEN NEW."retiredByAdmissionEventId" IS NOT OLD."retiredByAdmissionEventId"
BEGIN SELECT RAISE(ABORT,'LEGACY_IDENTITY_WRITER_CLOSED'); END;

-- Existing membership owners become authoritative; Player ownership is frozen
-- provenance, including NULL. No trigger may project it to newly created rows.
DROP TRIGGER "Player_owner_sync_rosters";
DROP TRIGGER "ClubMember_owner_insert";
DROP TRIGGER "ClubMember_owner_insert_sync";
DROP TRIGGER "ClubMember_owner_update";
DROP TRIGGER "Player_owner_claim_identity_guard";
DROP TRIGGER "PlayerInvitation_claim_identity_guard";
DROP TRIGGER "Player_owner_immutable";
CREATE TRIGGER "Player_owner_immutable" BEFORE UPDATE OF "ownerUserId" ON "User"
WHEN NEW."ownerUserId" IS NOT OLD."ownerUserId"
BEGIN SELECT RAISE(ABORT,'PLAYER_OWNER_PROVENANCE_IMMUTABLE'); END;
CREATE TRIGGER "Player_owner_provenance_replace" BEFORE INSERT ON "User"
WHEN EXISTS (SELECT 1 FROM "User" p WHERE p."id"=NEW."id" AND p."ownerUserId" IS NOT NEW."ownerUserId")
BEGIN SELECT RAISE(ABORT,'PLAYER_OWNER_PROVENANCE_IMMUTABLE'); END;
CREATE TRIGGER "ClubMember_local_owner_insert" BEFORE INSERT ON "CommunityMember"
WHEN NEW."ownershipRevision"!=0 OR (NEW."ownerUserId" IS NOT NULL AND NOT EXISTS (
 SELECT 1 FROM "Community" c JOIN "Account" a ON a."id"=NEW."ownerUserId"
 JOIN "ClubAccess" x ON x."clubId"=c."id" AND x."userId"=a."id"
 WHERE c."id"=NEW."communityId" AND c."isTutorial"=1 AND c."tutorialOwnerId"=a."id" AND c."createdById"=a."id"
  AND a."isActive"=1 AND x."status"='ACTIVE' AND x."role"='OWNER'
  AND NOT EXISTS (SELECT 1 FROM "CommunityMember" m WHERE m."userId"=NEW."userId" AND m."ownerUserId" IS NOT NULL)))
BEGIN SELECT RAISE(ABORT,'LOCAL_OWNERSHIP_EVENT_REQUIRED'); END;

-- Legacy contexts are inferred only from exact representing club or a single
-- accepted club with the physical profile. Ambiguous joint seats fail closed.
CREATE VIEW "SessionPlayerLocalContext" AS
SELECT sp.*,s."status" AS sessionStatus,
 CASE WHEN coalesce(sp."profileClubId",sp."representingClubId") IS NOT NULL THEN (
  SELECT m."communityId" FROM "CommunityMember" m WHERE m."userId"=sp."userId" AND m."retiredByAdmissionEventId" IS NULL
   AND m."communityId"=coalesce(sp."profileClubId",sp."representingClubId")
   AND (m."communityId"=s."communityId"
    OR (sp."profileClubId" IS NOT NULL AND s."ratingPolicyVersion"=1 AND s."communityId" IS NULL
     AND NOT EXISTS (SELECT 1 FROM "SessionCommunity" sc WHERE sc."sessionId"=s."id"))
    OR EXISTS (SELECT 1 FROM "SessionCommunity" sc
    WHERE sc."sessionId"=s."id" AND sc."communityId"=m."communityId" AND (sc."status"='ACCEPTED'
     OR (sp."profileClubId" IS NOT NULL AND s."status"='WAITING' AND sc."status"='PENDING'))))
 ) ELSE (
  SELECT CASE WHEN count(DISTINCT m."communityId")=1 THEN min(m."communityId") ELSE NULL END
  FROM "CommunityMember" m WHERE m."userId"=sp."userId" AND m."retiredByAdmissionEventId" IS NULL
   AND (m."communityId"=s."communityId" OR EXISTS (SELECT 1 FROM "SessionCommunity" sc WHERE sc."sessionId"=s."id" AND sc."communityId"=m."communityId" AND sc."status"='ACCEPTED'))
 ) END AS resolvedClubId
FROM "SessionPlayer" sp JOIN "Session" s ON s."id"=sp."sessionId";
-- Populate only new context columns on unfinished, unambiguous seats. Existing
-- seat fields and completed histories are untouched. A competing or ambiguous
-- possible seat for the same account prevents either account binding.
WITH safe_seats AS (
 SELECT seat."id",seat.resolvedClubId AS clubId,m."ownerUserId" AS accountId
 FROM "SessionPlayerLocalContext" seat JOIN "CommunityMember" m
  ON m."communityId"=seat.resolvedClubId AND m."userId"=seat."userId" AND m."retiredByAdmissionEventId" IS NULL
 WHERE seat.sessionStatus IN ('WAITING','ACTIVE') AND seat."isGuest"=0 AND seat.resolvedClubId IS NOT NULL
  AND (m."ownerUserId" IS NULL OR NOT EXISTS (
   SELECT 1 FROM "SessionPlayerLocalContext" other JOIN "Session" s ON s."id"=other."sessionId"
   LEFT JOIN "CommunityMember" candidate ON candidate."userId"=other."userId" AND candidate."retiredByAdmissionEventId" IS NULL
    AND (candidate."communityId"=other.resolvedClubId OR (other.resolvedClubId IS NULL
     AND (candidate."communityId"=s."communityId" OR EXISTS (SELECT 1 FROM "SessionCommunity" sc
      WHERE sc."sessionId"=s."id" AND sc."communityId"=candidate."communityId" AND sc."status"='ACCEPTED'))))
   WHERE other."sessionId"=seat."sessionId" AND other."id"!=seat."id" AND other."isGuest"=0
    AND (other."participantAccountId"=m."ownerUserId" OR candidate."ownerUserId"=m."ownerUserId")
  ))
)
UPDATE "SessionPlayer" SET "profileClubId"=(SELECT clubId FROM safe_seats WHERE "id"="SessionPlayer"."id"),
 "participantAccountId"=(SELECT accountId FROM safe_seats WHERE "id"="SessionPlayer"."id")
 WHERE "id" IN (SELECT "id" FROM safe_seats);
CREATE TRIGGER "ClubPlayerOwnershipEvent_session_guard" BEFORE INSERT ON "ClubPlayerOwnershipEvent"
WHEN EXISTS (SELECT 1 FROM "SessionPlayerLocalContext" seat WHERE seat."userId"=NEW."playerId" AND seat."isGuest"=0 AND seat.sessionStatus IN ('WAITING','ACTIVE') AND (
 (seat.resolvedClubId=NEW."clubId" AND (NEW."action"!='CLAIM' OR (seat."participantAccountId" IS NOT NULL AND seat."participantAccountId" IS NOT NEW."newOwnerUserId")))
 OR (seat.resolvedClubId IS NULL AND EXISTS (SELECT 1 FROM "Session" s WHERE s."id"=seat."sessionId"
  AND (s."communityId"=NEW."clubId" OR EXISTS (SELECT 1 FROM "SessionCommunity" sc WHERE sc."sessionId"=s."id" AND sc."communityId"=NEW."clubId" AND sc."status"='ACCEPTED'))))
 OR (NEW."action"='CLAIM' AND seat.resolvedClubId=NEW."clubId" AND EXISTS (
  SELECT 1 FROM "SessionPlayerLocalContext" other JOIN "Session" s ON s."id"=other."sessionId"
  LEFT JOIN "CommunityMember" m ON m."userId"=other."userId" AND m."retiredByAdmissionEventId" IS NULL
   AND (m."communityId"=other.resolvedClubId OR (other.resolvedClubId IS NULL AND (m."communityId"=s."communityId"
    OR EXISTS (SELECT 1 FROM "SessionCommunity" sc WHERE sc."sessionId"=s."id" AND sc."communityId"=m."communityId" AND sc."status"='ACCEPTED'))))
  WHERE other."sessionId"=seat."sessionId" AND other."id"!=seat."id" AND other."isGuest"=0
   AND (other."participantAccountId"=NEW."newOwnerUserId" OR (other."participantAccountId" IS NULL AND m."ownerUserId"=NEW."newOwnerUserId"))))
)) BEGIN SELECT RAISE(ABORT,'LOCAL_SESSION_PARTICIPATION_CONFLICT'); END;
CREATE TRIGGER "ClubMember_local_owner_update" BEFORE UPDATE OF "ownerUserId","ownershipRevision" ON "CommunityMember"
WHEN (NEW."ownerUserId" IS NOT OLD."ownerUserId" OR NEW."ownershipRevision" IS NOT OLD."ownershipRevision") AND (
 NEW."ownershipRevision"!=OLD."ownershipRevision"+1 OR NOT EXISTS (
  SELECT 1 FROM "ClubPlayerOwnershipEvent" e WHERE e."clubMemberId"=OLD."id" AND e."clubId"=OLD."communityId" AND e."playerId"=OLD."userId"
   AND e."previousOwnerUserId" IS OLD."ownerUserId" AND e."newOwnerUserId" IS NEW."ownerUserId"
   AND e."previousOwnershipRevision"=OLD."ownershipRevision" AND e."newOwnershipRevision"=NEW."ownershipRevision"))
BEGIN SELECT RAISE(ABORT,'LOCAL_OWNERSHIP_EVENT_REQUIRED'); END;
CREATE TRIGGER "ClubMember_local_owner_replace" BEFORE INSERT ON "CommunityMember"
WHEN EXISTS (SELECT 1 FROM "CommunityMember" m WHERE m."id"=NEW."id" OR (m."communityId"=NEW."communityId" AND m."userId"=NEW."userId"))
BEGIN SELECT RAISE(ABORT,'ROSTER_IDENTITY_IMMUTABLE'); END;
-- Retained ordinary rosters are archived, never deleted/recreated. Guard the
-- parent deletion too: cascading child triggers see the parent already gone.
-- Tutorial classification cannot be acquired by relabeling an ordinary club.
CREATE TRIGGER "Club_local_context_immutable" BEFORE UPDATE OF "isTutorial","tutorialOwnerId","createdById" ON "Community"
WHEN NEW."isTutorial" IS NOT OLD."isTutorial" OR NEW."tutorialOwnerId" IS NOT OLD."tutorialOwnerId" OR NEW."createdById" IS NOT OLD."createdById"
BEGIN SELECT RAISE(ABORT,'CLUB_LOCAL_CONTEXT_IMMUTABLE'); END;
CREATE TRIGGER "Club_local_context_no_replace" BEFORE INSERT ON "Community"
WHEN EXISTS (SELECT 1 FROM "Community" c WHERE c."id"=NEW."id" OR (NEW."tutorialOwnerId" IS NOT NULL AND c."tutorialOwnerId"=NEW."tutorialOwnerId"))
BEGIN SELECT RAISE(ABORT,'CLUB_LOCAL_CONTEXT_IMMUTABLE'); END;
CREATE TRIGGER "Club_local_history_no_delete" BEFORE DELETE ON "Community"
WHEN OLD."isTutorial"!=1 OR OLD."tutorialOwnerId" IS NULL OR OLD."tutorialOwnerId" IS NOT OLD."createdById"
BEGIN SELECT RAISE(ABORT,'LOCAL_ROSTER_HISTORY_PRESERVED'); END;
CREATE TRIGGER "ClubMember_local_history_no_delete" BEFORE DELETE ON "CommunityMember"
WHEN EXISTS (SELECT 1 FROM "Community" c WHERE c."id"=OLD."communityId"
 AND (c."isTutorial"!=1 OR c."tutorialOwnerId" IS NULL OR c."tutorialOwnerId" IS NOT c."createdById"))
BEGIN SELECT RAISE(ABORT,'LOCAL_ROSTER_HISTORY_PRESERVED'); END;
CREATE TRIGGER "ClubMember_shared_owner_guard" BEFORE UPDATE OF "ownerUserId" ON "CommunityMember"
WHEN NEW."ownerUserId" IS NOT NULL AND EXISTS (
 SELECT 1 FROM "CommunityMember" other WHERE other."userId"=NEW."userId" AND other."id"!=NEW."id"
  AND other."retiredByAdmissionEventId" IS NULL AND other."ownerUserId" IS NOT NULL AND other."ownerUserId"!=NEW."ownerUserId")
BEGIN SELECT RAISE(ABORT,'SHARED_PLAYER_OWNERSHIP_CONFLICT'); END;

-- Invalidate reviewed incompatible mutable work. The old terminal events and
-- receipts are never touched. Normal local requests/invitations remain valid.
INSERT INTO "ClubAdmissionEvent"("id","admissionRequestId","actorUserId","action","revision","detailsJson","createdAt")
SELECT 'local-ownership-cutover:'||r."id",r."id",NULL,'LOCAL_OWNERSHIP_MIGRATION_CANCEL',r."revision"+1,
 json_object('reason','CLUB_LOCAL_OWNERSHIP','before',json_object('status',r."status",'kind',r."kind",'requestedPlayerId',r."requestedPlayerId",'originInvitationId',r."originInvitationId",'revision',r."revision")),CURRENT_TIMESTAMP
FROM "ClubJoinRequest" r WHERE r."status"='PENDING' AND (r."originInvitationId" IS NOT NULL OR r."kind"='OWNED_PLAYER'
 OR (r."requestedPlayerId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "CommunityMember" m WHERE m."communityId"=r."clubId" AND m."userId"=r."requestedPlayerId" AND m."retiredByAdmissionEventId" IS NULL)));
UPDATE "ClubJoinRequest" SET "status"='CANCELLED',"decision"='CLUB_LOCAL_OWNERSHIP',"revision"="revision"+1,"reviewedAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP
 WHERE "status"='PENDING' AND EXISTS (SELECT 1 FROM "ClubAdmissionEvent" e WHERE e."id"='local-ownership-cutover:'||"ClubJoinRequest"."id");
UPDATE "PlayerInvitation" SET "status"='REVOKED',"revocationReason"='CLUB_LOCAL_OWNERSHIP',"revokedAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP
 WHERE "status"='ACTIVE' AND "purpose"!='CLAIM';

DROP TRIGGER "PlayerInvitation_target_guard";
CREATE TRIGGER "PlayerInvitation_target_guard" BEFORE INSERT ON "PlayerInvitation"
WHEN NEW."status"!='ACTIVE' OR NEW."purpose"!='CLAIM' OR NEW."targetAccountUserId" IS NOT NULL
 OR NEW."sourcePlayerId" IS NOT NULL OR NEW."sourceMemberId" IS NOT NULL OR NEW."retireSourcePlayerId" IS NOT NULL
 OR NEW."authorizedAccessAction" IS NOT NULL OR NEW."authorizationReason" IS NOT NULL OR NEW."authorizerAccessId" IS NOT NULL
 OR NEW."authorizerAccessRevision" IS NOT NULL OR NEW."recipientAccessId" IS NOT NULL OR NEW."recipientAccessStatus" IS NOT NULL
 OR NEW."recipientAccessRole" IS NOT NULL OR NEW."recipientAccessRevision" IS NOT NULL OR NEW."restoreArchivedRoster"!=0
 OR NOT EXISTS (SELECT 1 FROM "CommunityMember" m JOIN "User" p ON p."id"=m."userId" JOIN "Community" c ON c."id"=m."communityId"
 JOIN "Account" issuer ON issuer."id"=NEW."createdByUserId" JOIN "ClubAccess" authority ON authority."clubId"=c."id" AND authority."userId"=issuer."id"
 WHERE m."id"=NEW."clubMemberId" AND m."communityId"=NEW."clubId" AND m."userId"=NEW."playerId"
  AND m."ownerUserId" IS NULL AND m."ownershipRevision"=NEW."targetOwnershipRevision" AND m."archivedAt" IS NULL
  AND m."retiredByAdmissionEventId" IS NULL AND p."isActive"=1 AND c."isTutorial"=0
  AND issuer."isActive"=1 AND authority."status"='ACTIVE' AND authority."role" IN ('ADMIN','OWNER'))
BEGIN SELECT RAISE(ABORT,'INVITATION_TARGET_INVALID'); END;
CREATE TRIGGER "PlayerInvitation_local_revision_immutable" BEFORE UPDATE OF "targetOwnershipRevision" ON "PlayerInvitation"
WHEN NEW."targetOwnershipRevision" IS NOT OLD."targetOwnershipRevision"
BEGIN SELECT RAISE(ABORT,'INVITATION_BINDING_IMMUTABLE'); END;
DROP VIEW "ClaimReleaseAuthorization";
-- Old global receipts cannot authorize local regrant. Only a new local receipt
-- at the exact post-revocation revision can be consumed once.
CREATE VIEW "ClaimReleaseAuthorization" AS
SELECT r."id" AS "releaseId",i."id" AS "invitationId",r."previousOwnerUserId" AS "recipientUserId"
FROM "ClubPlayerOwnershipEvent" r JOIN "ClubAccess" a ON a."id"=r."accessId"
JOIN "PlayerInvitation" i ON i."clubId"=r."clubId"
WHERE r."action" IN ('REMOVE','DISCONNECT','LEAVE') AND r."previousOwnerUserId" IS NOT NULL
 AND r."newOwnerUserId" IS NULL AND r."newAccessStatus"='REVOKED'
 AND a."clubId"=r."clubId" AND a."userId"=r."previousOwnerUserId" AND a."status"='REVOKED' AND a."revision"=r."newAccessRevision"
 AND i."purpose"='CLAIM' AND i."status"='ACTIVE'
 AND (CASE WHEN typeof(i."createdAt") IN ('integer','real') THEN i."createdAt" ELSE round((julianday(i."createdAt")-2440587.5)*86400000) END)
  > (CASE WHEN typeof(r."createdAt") IN ('integer','real') THEN r."createdAt" ELSE round((julianday(r."createdAt")-2440587.5)*86400000) END)
 AND NOT EXISTS (SELECT 1 FROM "ClubPlayerOwnershipEvent" used WHERE used."releaseEventId"=r."id");
DROP TRIGGER "PlayerInvitation_state_guard";
CREATE TRIGGER "PlayerInvitation_state_guard" BEFORE UPDATE ON "PlayerInvitation"
WHEN NEW."status" NOT IN ('ACTIVE','EXPIRED','REVOKED','REDEEMED') OR (NEW."status"='REDEEMED' AND (
 NEW."purpose"!='CLAIM' OR NEW."redeemedByUserId" IS NULL OR NEW."redeemedAt" IS NULL OR NEW."createdByUserId"=NEW."redeemedByUserId"
 OR coalesce((CASE WHEN typeof(NEW."expiresAt") IN ('integer','real') THEN NEW."expiresAt"
   ELSE round((julianday(NEW."expiresAt")-2440587.5)*86400000) END),-1)<=round((julianday('now')-2440587.5)*86400000)
 OR NOT EXISTS (SELECT 1 FROM "Account" a WHERE a."id"=NEW."redeemedByUserId" AND a."isActive"=1)
 OR NOT EXISTS (SELECT 1 FROM "Account" a JOIN "ClubAccess" x ON x."userId"=a."id" AND x."clubId"=NEW."clubId"
  WHERE a."id"=NEW."createdByUserId" AND a."isActive"=1 AND x."status"='ACTIVE' AND x."role" IN ('ADMIN','OWNER'))
 OR NOT EXISTS (SELECT 1 FROM "CommunityMember" m JOIN "User" p ON p."id"=m."userId"
  WHERE m."id"=NEW."clubMemberId" AND m."communityId"=NEW."clubId" AND m."userId"=NEW."playerId"
   AND m."ownerUserId" IS NULL AND m."ownershipRevision"=NEW."targetOwnershipRevision" AND m."archivedAt" IS NULL AND m."retiredByAdmissionEventId" IS NULL AND p."isActive"=1)
 OR EXISTS (SELECT 1 FROM "CommunityMember" m WHERE m."communityId"=NEW."clubId" AND m."retiredByAdmissionEventId" IS NULL AND m."ownerUserId"=NEW."redeemedByUserId")
 OR EXISTS (SELECT 1 FROM "CommunityMember" m WHERE m."userId"=NEW."playerId" AND m."retiredByAdmissionEventId" IS NULL AND m."ownerUserId" IS NOT NULL AND m."ownerUserId"!=NEW."redeemedByUserId")
 OR (EXISTS (SELECT 1 FROM "ClubAccess" x WHERE x."clubId"=NEW."clubId" AND x."userId"=NEW."redeemedByUserId" AND x."status"!='ACTIVE')
 AND NOT EXISTS (SELECT 1 FROM "ClaimReleaseAuthorization" r WHERE r."invitationId"=NEW."id" AND r."recipientUserId"=NEW."redeemedByUserId"))
)) BEGIN SELECT RAISE(ABORT,'INVITATION_STATE_INVALID'); END;
CREATE TRIGGER "ClubMember_local_invitation_invalidate" AFTER UPDATE OF "ownerUserId","ownershipRevision" ON "CommunityMember"
WHEN NEW."ownerUserId" IS NOT NULL OR NEW."ownershipRevision" IS NOT OLD."ownershipRevision"
BEGIN UPDATE "PlayerInvitation" SET "status"='REVOKED',"revocationReason"='LOCAL_OWNERSHIP_CHANGED',"revokedAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP
 WHERE "clubMemberId"=NEW."id" AND "status"='ACTIVE'; END;

-- New session rows bind a club/profile and an account snapshot; NULL snapshots
-- remain legitimate for unclaimed placeholders and all unchanged legacy rows.
CREATE TRIGGER "SessionPlayer_profile_insert_guard" BEFORE INSERT ON "SessionPlayer"
WHEN (NEW."isGuest"=1 AND (NEW."profileClubId" IS NOT NULL OR NEW."participantAccountId" IS NOT NULL))
 OR (NEW."profileClubId" IS NOT NULL AND NEW."representingClubId" IS NOT NULL AND NEW."profileClubId" IS NOT NEW."representingClubId")
 OR (NEW."isGuest"=0 AND NOT EXISTS (
  -- Exact copied result snapshots preserve source history, even after local
  -- ownership/access subsequently changed. A source pointer alone is not proof.
  SELECT 1 FROM "Session" destination JOIN "Session" source ON source."id"=destination."sourceSessionId"
  JOIN "SessionPlayer" original ON original."sessionId"=source."id" AND original."userId"=NEW."userId"
  WHERE destination."id"=NEW."sessionId" AND destination."ratingPolicyVersion"=source."ratingPolicyVersion"
   AND destination."communityId" IS source."communityId"
   AND NOT EXISTS (SELECT 1 FROM "SessionCommunity" originalClub WHERE originalClub."sessionId"=source."id" AND NOT EXISTS (
    SELECT 1 FROM "SessionCommunity" copiedClub WHERE copiedClub."sessionId"=destination."id" AND copiedClub."communityId"=originalClub."communityId"
     AND copiedClub."role"=originalClub."role" AND copiedClub."status"=originalClub."status"))
   AND NOT EXISTS (SELECT 1 FROM "SessionCommunity" copiedClub WHERE copiedClub."sessionId"=destination."id" AND NOT EXISTS (
    SELECT 1 FROM "SessionCommunity" originalClub WHERE originalClub."sessionId"=source."id" AND originalClub."communityId"=copiedClub."communityId"
     AND originalClub."role"=copiedClub."role" AND originalClub."status"=copiedClub."status"))
   AND original."isGuest"=0 AND original."profileClubId" IS NEW."profileClubId" AND original."participantAccountId" IS NEW."participantAccountId"
   AND EXISTS (SELECT 1 FROM "Match" played WHERE played."sessionId"=source."id" AND played."status"='COMPLETED'
    AND played."team1Score" IS NOT NULL AND played."team2Score" IS NOT NULL)
 ) AND (
  (NEW."profileClubId" IS NOT NULL AND NOT EXISTS (
   SELECT 1 FROM "CommunityMember" m JOIN "Session" s ON s."id"=NEW."sessionId"
   WHERE m."communityId"=NEW."profileClubId" AND m."userId"=NEW."userId" AND m."retiredByAdmissionEventId" IS NULL AND m."archivedAt" IS NULL
    AND (s."communityId"=m."communityId" OR (s."ratingPolicyVersion"=1 AND s."communityId" IS NULL
      AND NOT EXISTS (SELECT 1 FROM "SessionCommunity" sc WHERE sc."sessionId"=s."id")
      AND EXISTS (SELECT 1 FROM "CommunityMember" localMember JOIN "User" localPlayer ON localPlayer."id"=localMember."userId"
       WHERE localMember."communityId"=NEW."profileClubId" AND localMember."userId"=NEW."userId"
        AND localMember."retiredByAdmissionEventId" IS NULL AND localMember."archivedAt" IS NULL AND localPlayer."isActive"=1
        AND localMember."ownerUserId" IS NEW."participantAccountId"
        AND (localMember."ownerUserId" IS NULL OR EXISTS (SELECT 1 FROM "ClubAccess" localAccess JOIN "Account" localAccount ON localAccount."id"=localAccess."userId"
         WHERE localAccess."clubId"=localMember."communityId" AND localAccess."userId"=localMember."ownerUserId" AND localAccess."status"='ACTIVE' AND localAccount."isActive"=1)))) OR EXISTS (SELECT 1 FROM "SessionCommunity" sc
      WHERE sc."sessionId"=s."id" AND sc."communityId"=m."communityId" AND (sc."status"='ACCEPTED' OR (sc."status"='PENDING' AND s."status"='WAITING'))))))
  OR (EXISTS (SELECT 1 FROM "Session" s WHERE s."id"=NEW."sessionId" AND s."ratingPolicyVersion"=2) AND NOT EXISTS (
   SELECT 1 FROM "CommunityMember" m JOIN "User" p ON p."id"=m."userId"
   WHERE m."communityId"=NEW."profileClubId" AND m."userId"=NEW."userId" AND m."retiredByAdmissionEventId" IS NULL AND m."archivedAt" IS NULL
    AND p."isActive"=1 AND m."ownerUserId" IS NEW."participantAccountId"
    AND (m."ownerUserId" IS NULL OR EXISTS (SELECT 1 FROM "ClubAccess" x JOIN "Account" a ON a."id"=x."userId"
     WHERE x."clubId"=m."communityId" AND x."userId"=m."ownerUserId" AND x."status"='ACTIVE' AND a."isActive"=1))))
  OR (NEW."participantAccountId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "CommunityMember" m JOIN "ClubAccess" x ON x."clubId"=m."communityId" AND x."userId"=m."ownerUserId"
   JOIN "Account" a ON a."id"=x."userId" WHERE m."communityId"=NEW."profileClubId" AND m."userId"=NEW."userId" AND m."ownerUserId"=NEW."participantAccountId"
    AND m."archivedAt" IS NULL AND m."retiredByAdmissionEventId" IS NULL AND x."status"='ACTIVE' AND a."isActive"=1))
 ))
BEGIN SELECT RAISE(ABORT,'SESSION_PROFILE_INVALID'); END;
-- The snapshot unique index protects new explicit seats. Also check retained
-- legacy NULL seats/current owners so a raw add cannot bypass it on a v1 session.
CREATE TRIGGER "SessionPlayer_account_participation_guard" BEFORE INSERT ON "SessionPlayer"
WHEN NEW."isGuest"=0 AND EXISTS (
 SELECT 1 FROM "Session" s JOIN "CommunityMember" incoming ON incoming."userId"=NEW."userId"
  AND incoming."retiredByAdmissionEventId" IS NULL AND incoming."ownerUserId" IS NOT NULL
 WHERE s."id"=NEW."sessionId" AND s."status" IN ('WAITING','ACTIVE')
  AND ((coalesce(NEW."profileClubId",NEW."representingClubId") IS NOT NULL AND incoming."communityId"=coalesce(NEW."profileClubId",NEW."representingClubId"))
   OR (coalesce(NEW."profileClubId",NEW."representingClubId") IS NULL AND (incoming."communityId"=s."communityId"
    OR EXISTS (SELECT 1 FROM "SessionCommunity" sc WHERE sc."sessionId"=s."id" AND sc."communityId"=incoming."communityId" AND sc."status"='ACCEPTED'))))
  AND EXISTS (SELECT 1 FROM "SessionPlayerLocalContext" existing
   LEFT JOIN "CommunityMember" candidate ON candidate."userId"=existing."userId" AND candidate."retiredByAdmissionEventId" IS NULL
    AND (candidate."communityId"=existing.resolvedClubId OR (existing.resolvedClubId IS NULL
     AND (candidate."communityId"=s."communityId" OR EXISTS (SELECT 1 FROM "SessionCommunity" sc WHERE sc."sessionId"=s."id" AND sc."communityId"=candidate."communityId" AND sc."status"='ACCEPTED'))))
   WHERE existing."sessionId"=s."id" AND existing."isGuest"=0 AND existing."id" IS NOT NEW."id"
    AND (existing."participantAccountId"=incoming."ownerUserId" OR (existing."participantAccountId" IS NULL AND candidate."ownerUserId"=incoming."ownerUserId")))
) BEGIN SELECT RAISE(ABORT,'LOCAL_SESSION_PARTICIPATION_CONFLICT'); END;
-- A seat cannot move sessions or change its represented context/guest identity.
-- Remove and rejoin to select another context; claim binding may fill only the
-- exact existing local context and its current owner.
CREATE TRIGGER "SessionPlayer_profile_update_guard" BEFORE UPDATE OF "sessionId","representingClubId","isGuest","profileClubId","participantAccountId","userId" ON "SessionPlayer"
WHEN NEW."sessionId" IS NOT OLD."sessionId" OR NEW."representingClubId" IS NOT OLD."representingClubId" OR NEW."isGuest" IS NOT OLD."isGuest"
 OR ((NEW."profileClubId" IS NOT OLD."profileClubId" OR NEW."participantAccountId" IS NOT OLD."participantAccountId" OR NEW."userId" IS NOT OLD."userId") AND (
 EXISTS (SELECT 1 FROM "Session" s WHERE s."id"=OLD."sessionId" AND s."status"='COMPLETED')
 OR OLD."participantAccountId" IS NOT NULL
 OR (OLD."profileClubId" IS NOT NULL AND NEW."profileClubId" IS NOT OLD."profileClubId")
 OR (OLD."profileClubId" IS NULL AND NEW."profileClubId" IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM "SessionPlayerLocalContext" context WHERE context."id"=OLD."id" AND context.resolvedClubId=NEW."profileClubId"))
 OR (NEW."userId" IS NOT OLD."userId" AND EXISTS (SELECT 1 FROM "Match" match WHERE match."sessionId"=OLD."sessionId"
  AND (match."team1User1Id"=OLD."userId" OR match."team1User2Id"=OLD."userId" OR match."team2User1Id"=OLD."userId" OR match."team2User2Id"=OLD."userId")))
 OR (NEW."isGuest"=1 AND (NEW."profileClubId" IS NOT NULL OR NEW."participantAccountId" IS NOT NULL))
 OR (NEW."profileClubId" IS NOT NULL AND NEW."representingClubId" IS NOT NULL AND NEW."profileClubId" IS NOT NEW."representingClubId")
 OR (NEW."profileClubId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Session" s WHERE s."id"=NEW."sessionId"
  AND (s."communityId"=NEW."profileClubId" OR (s."ratingPolicyVersion"=1 AND s."communityId" IS NULL
      AND NOT EXISTS (SELECT 1 FROM "SessionCommunity" sc WHERE sc."sessionId"=s."id")
      AND EXISTS (SELECT 1 FROM "CommunityMember" localMember JOIN "User" localPlayer ON localPlayer."id"=localMember."userId"
       WHERE localMember."communityId"=NEW."profileClubId" AND localMember."userId"=NEW."userId"
        AND localMember."retiredByAdmissionEventId" IS NULL AND localMember."archivedAt" IS NULL AND localPlayer."isActive"=1
        AND localMember."ownerUserId" IS NEW."participantAccountId"
        AND (localMember."ownerUserId" IS NULL OR EXISTS (SELECT 1 FROM "ClubAccess" localAccess JOIN "Account" localAccount ON localAccount."id"=localAccess."userId"
         WHERE localAccess."clubId"=localMember."communityId" AND localAccess."userId"=localMember."ownerUserId" AND localAccess."status"='ACTIVE' AND localAccount."isActive"=1)))) OR EXISTS (SELECT 1 FROM "SessionCommunity" sc WHERE sc."sessionId"=s."id" AND sc."communityId"=NEW."profileClubId"
   AND (sc."status"='ACCEPTED' OR (sc."status"='PENDING' AND s."status"='WAITING'))))))
 OR (EXISTS (SELECT 1 FROM "Session" s WHERE s."id"=NEW."sessionId" AND s."ratingPolicyVersion"=2) AND NEW."isGuest"=0
  AND NOT EXISTS (SELECT 1 FROM "CommunityMember" m JOIN "User" p ON p."id"=m."userId"
   WHERE m."communityId"=NEW."profileClubId" AND m."userId"=NEW."userId" AND m."retiredByAdmissionEventId" IS NULL AND m."archivedAt" IS NULL
    AND p."isActive"=1 AND m."ownerUserId" IS NEW."participantAccountId"
    AND (m."ownerUserId" IS NULL OR EXISTS (SELECT 1 FROM "ClubAccess" x JOIN "Account" a ON a."id"=x."userId"
     WHERE x."clubId"=m."communityId" AND x."userId"=m."ownerUserId" AND x."status"='ACTIVE' AND a."isActive"=1))))
 OR (NEW."participantAccountId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "CommunityMember" m JOIN "ClubAccess" x ON x."clubId"=m."communityId" AND x."userId"=m."ownerUserId"
  JOIN "Account" a ON a."id"=x."userId" WHERE m."communityId"=NEW."profileClubId" AND m."userId"=NEW."userId" AND m."ownerUserId"=NEW."participantAccountId"
   AND m."archivedAt" IS NULL AND m."retiredByAdmissionEventId" IS NULL AND x."status"='ACTIVE' AND a."isActive"=1))
 OR (NEW."profileClubId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "CommunityMember" m WHERE m."communityId"=NEW."profileClubId" AND m."userId"=NEW."userId" AND m."retiredByAdmissionEventId" IS NULL AND m."archivedAt" IS NULL))
)) BEGIN SELECT RAISE(ABORT,'SESSION_PROFILE_IMMUTABLE'); END;
-- UPDATE must enforce the same participation invariant as INSERT, including
-- v1 seats with no account snapshot. Exclude the old row while checking NEW.
CREATE TRIGGER "SessionPlayer_account_participation_update_guard" BEFORE UPDATE OF "sessionId","representingClubId","isGuest","profileClubId","participantAccountId","userId" ON "SessionPlayer"
WHEN (NEW."sessionId" IS NOT OLD."sessionId" OR NEW."representingClubId" IS NOT OLD."representingClubId" OR NEW."isGuest" IS NOT OLD."isGuest"
 OR NEW."profileClubId" IS NOT OLD."profileClubId" OR NEW."participantAccountId" IS NOT OLD."participantAccountId" OR NEW."userId" IS NOT OLD."userId")
 AND NEW."isGuest"=0 AND EXISTS (
 SELECT 1 FROM "Session" s JOIN "CommunityMember" incoming ON incoming."userId"=NEW."userId"
  AND incoming."retiredByAdmissionEventId" IS NULL AND incoming."ownerUserId" IS NOT NULL
 WHERE s."id"=NEW."sessionId" AND s."status" IN ('WAITING','ACTIVE')
  AND ((coalesce(NEW."profileClubId",NEW."representingClubId") IS NOT NULL AND incoming."communityId"=coalesce(NEW."profileClubId",NEW."representingClubId"))
   OR (coalesce(NEW."profileClubId",NEW."representingClubId") IS NULL AND (incoming."communityId"=s."communityId"
    OR EXISTS (SELECT 1 FROM "SessionCommunity" sc WHERE sc."sessionId"=s."id" AND sc."communityId"=incoming."communityId" AND sc."status"='ACCEPTED'))))
  AND EXISTS (SELECT 1 FROM "SessionPlayerLocalContext" existing
   LEFT JOIN "CommunityMember" candidate ON candidate."userId"=existing."userId" AND candidate."retiredByAdmissionEventId" IS NULL
    AND (candidate."communityId"=existing.resolvedClubId OR (existing.resolvedClubId IS NULL
     AND (candidate."communityId"=s."communityId" OR EXISTS (SELECT 1 FROM "SessionCommunity" sc WHERE sc."sessionId"=s."id" AND sc."communityId"=candidate."communityId" AND sc."status"='ACCEPTED'))))
   WHERE existing."sessionId"=s."id" AND existing."isGuest"=0 AND existing."id"!=OLD."id"
    AND (existing."participantAccountId"=incoming."ownerUserId" OR (existing."participantAccountId" IS NULL AND candidate."ownerUserId"=incoming."ownerUserId")))
) BEGIN SELECT RAISE(ABORT,'LOCAL_SESSION_PARTICIPATION_CONFLICT'); END;

CREATE TRIGGER "ClubPlayerOwnershipEvent_snapshot_guard" BEFORE INSERT ON "ClubPlayerOwnershipEvent"
WHEN length(trim(NEW."reason"))=0 OR NEW."newOwnershipRevision"!=NEW."previousOwnershipRevision"+1
 OR (NEW."previousAccessStatus" IS NOT NULL AND NEW."previousAccessStatus" NOT IN ('ACTIVE','REVOKED'))
 OR (NEW."newAccessStatus" IS NOT NULL AND NEW."newAccessStatus" NOT IN ('ACTIVE','REVOKED'))
 OR (NEW."previousAccessRole" IS NOT NULL AND NEW."previousAccessRole" NOT IN ('OWNER','ADMIN','STAFF','MEMBER'))
 OR (NEW."newAccessRole" IS NOT NULL AND NEW."newAccessRole" NOT IN ('OWNER','ADMIN','STAFF','MEMBER'))
 OR NOT EXISTS (SELECT 1 FROM "Account" a WHERE a."id"=NEW."actorUserId" AND a."isActive"=1)
 OR NOT EXISTS (SELECT 1 FROM "CommunityMember" m JOIN "User" p ON p."id"=m."userId"
  WHERE m."id"=NEW."clubMemberId" AND m."communityId"=NEW."clubId" AND m."userId"=NEW."playerId"
   AND m."retiredByAdmissionEventId" IS NULL AND m."ownerUserId" IS NEW."previousOwnerUserId" AND m."ownershipRevision"=NEW."previousOwnershipRevision"
   AND json_type(NEW."metadataBeforeJson",'$.name')='text' AND json_extract(NEW."metadataBeforeJson",'$.name') IS p."name"
   AND json_type(NEW."metadataBeforeJson",'$.avatarKey') IN ('text','null') AND json_extract(NEW."metadataBeforeJson",'$.avatarKey') IS p."avatarKey"
   AND json_type(NEW."detailsJson",'$.previousArchivedAt') IN ('text','integer','real','null')
   AND json_extract(NEW."detailsJson",'$.previousArchivedAt') IS m."archivedAt")
 OR (NEW."accessId" IS NULL AND (NEW."previousAccessRevision" IS NOT NULL OR NEW."newAccessRevision" IS NOT NULL
  OR NEW."previousAccessStatus" IS NOT NULL OR NEW."newAccessStatus" IS NOT NULL OR NEW."previousAccessRole" IS NOT NULL OR NEW."newAccessRole" IS NOT NULL))
 OR (NEW."accessId" IS NOT NULL AND (NEW."newAccessRevision" IS NULL OR NEW."newAccessStatus" IS NULL OR NEW."newAccessRole" IS NULL OR NOT coalesce((
  (NEW."previousAccessRevision" IS NULL AND NEW."previousAccessStatus" IS NULL AND NEW."previousAccessRole" IS NULL
   AND NEW."newAccessRevision"=0 AND NEW."newAccessRole"='MEMBER' AND NEW."newAccessStatus" IN ('ACTIVE','REVOKED')
   AND NOT EXISTS (SELECT 1 FROM "ClubAccess" x WHERE x."id"=NEW."accessId" OR (x."clubId"=NEW."clubId" AND x."userId"=coalesce(NEW."newOwnerUserId",NEW."previousOwnerUserId"))))
  OR EXISTS (SELECT 1 FROM "ClubAccess" x WHERE x."id"=NEW."accessId" AND x."clubId"=NEW."clubId"
   AND x."userId"=coalesce(NEW."newOwnerUserId",NEW."previousOwnerUserId") AND x."revision"=NEW."previousAccessRevision"
   AND x."status" IS NEW."previousAccessStatus" AND x."role" IS NEW."previousAccessRole"
   AND NEW."newAccessRevision"=x."revision"+CASE WHEN NEW."newAccessStatus" IS NOT x."status" OR NEW."newAccessRole" IS NOT x."role" THEN 1 ELSE 0 END)),0)))
BEGIN SELECT RAISE(ABORT,'LOCAL_OWNERSHIP_SNAPSHOT_INVALID'); END;

CREATE TRIGGER "ClubPlayerOwnershipEvent_claim_guard" BEFORE INSERT ON "ClubPlayerOwnershipEvent"
WHEN NEW."action"='CLAIM' AND (
 NEW."previousOwnerUserId" IS NOT NULL OR NEW."newOwnerUserId" IS NULL OR NEW."newAccessStatus"!='ACTIVE' OR NEW."accessId" IS NULL
 OR EXISTS (SELECT 1 FROM "Community" c WHERE c."id"=NEW."clubId" AND c."isTutorial"=1)
 OR NOT EXISTS (SELECT 1 FROM "Account" a JOIN "User" p ON p."id"=NEW."playerId"
  WHERE a."id"=NEW."newOwnerUserId" AND a."isActive"=1 AND p."isActive"=1
   AND json_type(NEW."metadataAfterJson",'$.name')='text' AND json_extract(NEW."metadataAfterJson",'$.name') IS a."name"
   AND json_type(NEW."metadataAfterJson",'$.avatarKey') IN ('text','null') AND json_extract(NEW."metadataAfterJson",'$.avatarKey') IS a."avatarKey")
 OR json_type(NEW."detailsJson",'$.newArchivedAt') IS NOT 'null'
 OR EXISTS (SELECT 1 FROM "CommunityMember" m WHERE m."communityId"=NEW."clubId" AND m."ownerUserId"=NEW."newOwnerUserId" AND m."retiredByAdmissionEventId" IS NULL)
 OR EXISTS (SELECT 1 FROM "CommunityMember" m WHERE m."userId"=NEW."playerId" AND m."ownerUserId" IS NOT NULL
  AND m."ownerUserId"!=NEW."newOwnerUserId" AND m."retiredByAdmissionEventId" IS NULL)
 OR NOT (
  (NEW."actorUserId"!=NEW."newOwnerUserId" AND EXISTS (SELECT 1 FROM "ClubAccess" x WHERE x."clubId"=NEW."clubId" AND x."userId"=NEW."actorUserId" AND x."status"='ACTIVE' AND x."role" IN ('ADMIN','OWNER')))
  OR (NEW."actorUserId"=NEW."newOwnerUserId" AND NEW."invitationId" IS NOT NULL AND EXISTS (
   SELECT 1 FROM "PlayerInvitation" i JOIN "Account" issuer ON issuer."id"=i."createdByUserId"
   JOIN "ClubAccess" x ON x."clubId"=i."clubId" AND x."userId"=issuer."id"
   WHERE i."id"=NEW."invitationId" AND i."purpose"='CLAIM' AND i."status"='REDEEMED' AND i."redeemedByUserId"=NEW."newOwnerUserId"
    AND i."clubId"=NEW."clubId" AND i."clubMemberId"=NEW."clubMemberId" AND i."playerId"=NEW."playerId"
    AND i."targetOwnershipRevision"=NEW."previousOwnershipRevision" AND i."createdByUserId"!=NEW."newOwnerUserId"
    AND issuer."isActive"=1 AND x."status"='ACTIVE' AND x."role" IN ('ADMIN','OWNER')))
  OR (NEW."actorUserId"=NEW."newOwnerUserId" AND NEW."invitationId" IS NULL AND NEW."admissionRequestId" IS NULL
   AND EXISTS (SELECT 1 FROM "Community" c JOIN "ClubAccess" x ON x."clubId"=c."id" AND x."userId"=c."createdById"
    WHERE c."id"=NEW."clubId" AND c."createdById"=NEW."newOwnerUserId" AND x."status"='ACTIVE' AND x."role" IN ('ADMIN','OWNER'))
   AND NOT EXISTS (SELECT 1 FROM "ClubPlayerOwnershipEvent" e WHERE e."clubId"=NEW."clubId" AND e."action"='CLAIM')
   AND NOT EXISTS (SELECT 1 FROM "CommunityMember" m WHERE m."userId"=NEW."playerId" AND m."communityId"!=NEW."clubId"))
 )
 OR (NEW."invitationId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "PlayerInvitation" i WHERE i."id"=NEW."invitationId" AND i."purpose"='CLAIM'
  AND i."status"='REDEEMED' AND i."redeemedByUserId"=NEW."newOwnerUserId" AND i."clubMemberId"=NEW."clubMemberId"))
 OR (NEW."admissionRequestId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "ClubJoinRequest" r
  WHERE r."id"=NEW."admissionRequestId" AND r."clubId"=NEW."clubId" AND r."userId"=NEW."newOwnerUserId" AND r."status"='PENDING'
   AND r."originInvitationId" IS NULL AND r."kind" IN ('EXISTING_PLAYER','NEW_PLAYER')))
 OR (NEW."previousAccessStatus"='ACTIVE' AND (NEW."newAccessRole" IS NOT NEW."previousAccessRole" OR NEW."newAccessRevision" IS NOT NEW."previousAccessRevision"))
 OR (NEW."previousAccessStatus" IS NULL AND NEW."releaseEventId" IS NOT NULL)
 OR (NEW."previousAccessStatus"='REVOKED' AND (NEW."releaseEventId" IS NULL OR NEW."invitationId" IS NULL OR NEW."newAccessRole"!='MEMBER'
  OR NOT EXISTS (SELECT 1 FROM "ClubPlayerOwnershipEvent" r JOIN "PlayerInvitation" i ON i."id"=NEW."invitationId"
   WHERE r."id"=NEW."releaseEventId" AND r."clubId"=NEW."clubId" AND r."previousOwnerUserId"=NEW."newOwnerUserId"
    AND r."action" IN ('REMOVE','DISCONNECT','LEAVE') AND r."newOwnerUserId" IS NULL AND r."accessId"=NEW."accessId"
    AND r."newAccessStatus"='REVOKED' AND r."newAccessRevision"=NEW."previousAccessRevision"
    AND (CASE WHEN typeof(i."createdAt") IN ('integer','real') THEN i."createdAt" ELSE round((julianday(i."createdAt")-2440587.5)*86400000) END)
      > (CASE WHEN typeof(r."createdAt") IN ('integer','real') THEN r."createdAt" ELSE round((julianday(r."createdAt")-2440587.5)*86400000) END))))
 OR (NEW."releaseEventId" IS NOT NULL AND NEW."previousAccessStatus"!='REVOKED')
)
BEGIN SELECT RAISE(ABORT,'LOCAL_CLAIM_INVALID'); END;

CREATE TRIGGER "ClubPlayerOwnershipEvent_release_guard" BEFORE INSERT ON "ClubPlayerOwnershipEvent"
WHEN NEW."action"!='CLAIM' AND (
 NEW."newOwnerUserId" IS NOT NULL OR NEW."invitationId" IS NOT NULL OR NEW."admissionRequestId" IS NOT NULL OR NEW."releaseEventId" IS NOT NULL
 OR NEW."metadataAfterJson" IS NOT NEW."metadataBeforeJson"
 OR coalesce(json_type(NEW."detailsJson",'$.newArchivedAt'),'') NOT IN ('text','integer','real')
 OR (NEW."action"='DISCONNECT' AND json_type(NEW."detailsJson",'$.previousArchivedAt')='null')
 OR (NEW."previousOwnerUserId" IS NULL AND (NEW."action"!='ARCHIVE' OR NEW."accessId" IS NOT NULL))
 OR (NEW."previousOwnerUserId" IS NOT NULL AND (NEW."action"='ARCHIVE' OR NEW."accessId" IS NULL OR NEW."newAccessStatus"!='REVOKED'
  OR (NEW."previousAccessRole" IS NOT NULL AND NEW."newAccessRole" IS NOT NEW."previousAccessRole")))
 OR EXISTS (SELECT 1 FROM "Community" c WHERE c."id"=NEW."clubId" AND (c."isTutorial"=1 OR c."createdById"=NEW."previousOwnerUserId"))
 OR NOT ((NEW."action"='LEAVE' AND NEW."actorUserId"=NEW."previousOwnerUserId") OR
  (NEW."action"!='LEAVE' AND EXISTS (SELECT 1 FROM "ClubAccess" x WHERE x."clubId"=NEW."clubId" AND x."userId"=NEW."actorUserId" AND x."status"='ACTIVE' AND x."role" IN ('ADMIN','OWNER'))))
 OR (NEW."previousOwnerUserId" IS NOT NULL AND NEW."previousAccessStatus"='ACTIVE' AND NEW."previousAccessRole" IN ('ADMIN','OWNER')
  AND NOT EXISTS (SELECT 1 FROM "ClubAccess" x JOIN "Account" a ON a."id"=x."userId"
   WHERE x."clubId"=NEW."clubId" AND x."userId"!=NEW."previousOwnerUserId" AND x."status"='ACTIVE' AND x."role" IN ('ADMIN','OWNER') AND a."isActive"=1))
)
BEGIN SELECT RAISE(ABORT,'LOCAL_RELEASE_INVALID'); END;

-- The service cancels these rows with immutable audits before inserting its
-- receipt. Raw event writers must also close affected work first; no release
-- can leave a live capability/request bound to the disconnected local link.
CREATE TRIGGER "ClubPlayerOwnershipEvent_pending_work_guard" BEFORE INSERT ON "ClubPlayerOwnershipEvent"
WHEN NEW."action"!='CLAIM' AND (
 EXISTS (SELECT 1 FROM "ClubJoinRequest" r WHERE r."clubId"=NEW."clubId" AND r."status"='PENDING'
  AND (r."requestedPlayerId"=NEW."playerId" OR r."approvedPlayerId"=NEW."playerId" OR r."userId"=NEW."previousOwnerUserId"))
 OR EXISTS (SELECT 1 FROM "ClaimRequest" r WHERE r."communityId"=NEW."clubId" AND r."status"='PENDING'
  AND (r."targetUserId"=NEW."playerId" OR r."requesterUserId"=NEW."previousOwnerUserId"))
 OR EXISTS (SELECT 1 FROM "PlayerInvitation" i WHERE i."clubId"=NEW."clubId" AND i."status"='ACTIVE'
  AND (i."playerId"=NEW."playerId" OR i."sourcePlayerId"=NEW."playerId" OR i."targetAccountUserId"=NEW."previousOwnerUserId"))
 OR EXISTS (SELECT 1 FROM "OfflineIdentityLinkRequest" r WHERE r."status"='PENDING'
  AND ((r."sourceCommunityId"=NEW."clubId" AND r."sourceUserId"=NEW."playerId") OR (r."targetCommunityId"=NEW."clubId" AND r."targetUserId"=NEW."playerId")))
) BEGIN SELECT RAISE(ABORT,'LOCAL_PENDING_WORK_OPEN'); END;

-- Guarded event insertion applies the CAS atomically. Claims update only name
-- and avatar metadata; frozen provenance, timestamps and sport data stay intact.
CREATE TRIGGER "ClubPlayerOwnershipEvent_apply" AFTER INSERT ON "ClubPlayerOwnershipEvent"
BEGIN
 INSERT INTO "ClubAccess"("id","clubId","userId","role","status","revision","createdAt","updatedAt")
 SELECT NEW."accessId",NEW."clubId",coalesce(NEW."newOwnerUserId",NEW."previousOwnerUserId"),NEW."newAccessRole",NEW."newAccessStatus",0,NEW."createdAt",NEW."createdAt"
 WHERE NEW."accessId" IS NOT NULL AND NEW."previousAccessRevision" IS NULL;
 UPDATE "ClubAccess" SET "status"=NEW."newAccessStatus","role"=NEW."newAccessRole","updatedAt"=NEW."createdAt"
 WHERE "id"=NEW."accessId" AND "revision"=NEW."previousAccessRevision"
  AND ("status" IS NOT NEW."newAccessStatus" OR "role" IS NOT NEW."newAccessRole");
 UPDATE "CommunityMember" SET "ownerUserId"=NEW."newOwnerUserId","ownershipRevision"=NEW."newOwnershipRevision","archivedAt"=json_extract(NEW."detailsJson",'$.newArchivedAt')
 WHERE "id"=NEW."clubMemberId" AND "ownershipRevision"=NEW."previousOwnershipRevision" AND "ownerUserId" IS NEW."previousOwnerUserId";
 UPDATE "User" SET "name"=json_extract(NEW."metadataAfterJson",'$.name'),"avatarKey"=json_extract(NEW."metadataAfterJson",'$.avatarKey')
 WHERE "id"=NEW."playerId" AND NEW."action"='CLAIM';
 UPDATE "SessionPlayer" SET "profileClubId"=NEW."clubId","participantAccountId"=NEW."newOwnerUserId"
 WHERE NEW."action"='CLAIM' AND "id" IN (SELECT seat."id" FROM "SessionPlayerLocalContext" seat WHERE seat."userId"=NEW."playerId"
  AND seat.resolvedClubId=NEW."clubId" AND seat."isGuest"=0 AND seat.sessionStatus IN ('WAITING','ACTIVE') AND seat."participantAccountId" IS NULL);
END;

CREATE TRIGGER "ClubMember_archive_event_required" BEFORE UPDATE OF "archivedAt" ON "CommunityMember"
WHEN NEW."archivedAt" IS NOT OLD."archivedAt" AND NOT EXISTS (
 SELECT 1 FROM "ClubPlayerOwnershipEvent" e WHERE e."clubMemberId"=OLD."id" AND e."previousOwnershipRevision"=OLD."ownershipRevision"
  AND e."newOwnershipRevision"=NEW."ownershipRevision" AND json_extract(e."detailsJson",'$.previousArchivedAt') IS OLD."archivedAt"
  AND json_extract(e."detailsJson",'$.newArchivedAt') IS NEW."archivedAt")
BEGIN SELECT RAISE(ABORT,'LOCAL_OWNERSHIP_EVENT_REQUIRED'); END;
