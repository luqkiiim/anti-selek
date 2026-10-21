-- An unused club may be permanently deleted, including its creator's fresh
-- local sporting profile. The only removable ownership event is the initial
-- creator claim; its exact payload is retained in the deletion receipt.
-- No existing data is changed by installing this migration.
CREATE TABLE "ClubDeletionReceipt" (
 "clubId" TEXT NOT NULL PRIMARY KEY,
 "clubName" TEXT NOT NULL,
 "creatorUserId" TEXT NOT NULL,
 "actorUserId" TEXT NOT NULL REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "clubMemberId" TEXT,
 "playerId" TEXT,
 "setupEventId" TEXT,
 "setupEventJson" TEXT CHECK ("setupEventJson" IS NULL OR json_valid("setupEventJson")),
 "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK (("clubMemberId" IS NULL) = ("playerId" IS NULL)),
 CHECK (("setupEventId" IS NULL) = ("setupEventJson" IS NULL))
);
CREATE UNIQUE INDEX "ClubDeletionReceipt_clubMemberId_key" ON "ClubDeletionReceipt"("clubMemberId");
CREATE UNIQUE INDEX "ClubDeletionReceipt_playerId_key" ON "ClubDeletionReceipt"("playerId");
CREATE UNIQUE INDEX "ClubDeletionReceipt_setupEventId_key" ON "ClubDeletionReceipt"("setupEventId");

-- Read by both the service and the receipt guard. A nonempty club must have
-- exactly the initial creator profile, access grant and automatic claim.
CREATE VIEW "UnusedClubDeletionSetup" AS
SELECT c."id" AS "clubId",c."name" AS "clubName",c."createdById" AS "creatorUserId",
 m."id" AS "clubMemberId",m."userId" AS "playerId",e."id" AS "setupEventId",
 CASE WHEN e."id" IS NULL THEN NULL ELSE json_object(
  'id',e."id",'clubId',e."clubId",'clubMemberId',e."clubMemberId",'playerId',e."playerId",
  'actorUserId',e."actorUserId",'action',e."action",'previousOwnerUserId',e."previousOwnerUserId",'newOwnerUserId',e."newOwnerUserId",
  'previousOwnershipRevision',e."previousOwnershipRevision",'newOwnershipRevision',e."newOwnershipRevision",
  'accessId',e."accessId",'previousAccessRevision',e."previousAccessRevision",'newAccessRevision',e."newAccessRevision",
  'previousAccessStatus',e."previousAccessStatus",'newAccessStatus',e."newAccessStatus",'previousAccessRole',e."previousAccessRole",'newAccessRole',e."newAccessRole",
  'invitationId',e."invitationId",'admissionRequestId',e."admissionRequestId",'releaseEventId',e."releaseEventId",
  'metadataBeforeJson',e."metadataBeforeJson",'metadataAfterJson',e."metadataAfterJson",'detailsJson',e."detailsJson",'reason',e."reason",'createdAt',e."createdAt"
 ) END AS "setupEventJson"
FROM "Community" c LEFT JOIN "CommunityMember" m ON m."communityId"=c."id"
LEFT JOIN "ClubPlayerOwnershipEvent" e ON e."clubId"=c."id";

CREATE VIEW "UnusedClubDeletionBlocker" AS
SELECT c."id" AS "clubId",'TUTORIAL' AS "reason" FROM "Community" c WHERE c."isTutorial"!=0 OR c."tutorialOwnerId" IS NOT NULL
UNION ALL
SELECT c."id",'SESSION_HISTORY' FROM "Community" c WHERE
 EXISTS (SELECT 1 FROM "Session" s WHERE s."communityId"=c."id")
 OR EXISTS (SELECT 1 FROM "SessionCommunity" s WHERE s."communityId"=c."id")
 OR EXISTS (SELECT 1 FROM "SessionPlayer" s WHERE s."profileClubId"=c."id" OR s."representingClubId"=c."id")
 OR EXISTS (SELECT 1 FROM "Match" m WHERE m."team1ClubId"=c."id" OR m."team2ClubId"=c."id")
UNION ALL
SELECT c."id",'ADMISSION_HISTORY' FROM "Community" c WHERE
 EXISTS (SELECT 1 FROM "ClubJoinRequest" r WHERE r."clubId"=c."id")
 OR EXISTS (SELECT 1 FROM "ClaimRequest" r WHERE r."communityId"=c."id")
UNION ALL
SELECT c."id",'INVITATION_HISTORY' FROM "Community" c WHERE EXISTS (SELECT 1 FROM "PlayerInvitation" i WHERE i."clubId"=c."id")
UNION ALL
SELECT c."id",'OTHER_MEMBERS' FROM "Community" c WHERE
 (SELECT count(*) FROM "CommunityMember" m WHERE m."communityId"=c."id")>1
 OR EXISTS (SELECT 1 FROM "CommunityMember" m WHERE m."communityId"=c."id"
  AND (m."ownerUserId" IS NOT c."createdById" OR m."archivedAt" IS NOT NULL OR m."retiredByAdmissionEventId" IS NOT NULL))
UNION ALL
SELECT c."id",'ACCESS_HISTORY' FROM "Community" c WHERE EXISTS (
 SELECT 1 FROM "ClubAccess" x WHERE x."clubId"=c."id"
 AND (x."userId"!=c."createdById" OR x."role"!='OWNER' OR x."status"!='ACTIVE' OR x."revision"!=0))
UNION ALL
SELECT c."id",'OWNERSHIP_HISTORY' FROM "Community" c WHERE
 (SELECT count(*) FROM "ClubPlayerOwnershipEvent" e WHERE e."clubId"=c."id") !=
 (SELECT count(*) FROM "CommunityMember" m WHERE m."communityId"=c."id")
 OR EXISTS (SELECT 1 FROM "CommunityMember" m JOIN "User" p ON p."id"=m."userId" WHERE m."communityId"=c."id" AND (
  m."ownershipRevision"!=1 OR p."ownerUserId" IS NOT NULL OR p."email" IS NOT NULL OR p."passwordHash" IS NOT NULL
  OR NOT EXISTS (SELECT 1 FROM "ClubPlayerOwnershipEvent" e JOIN "ClubAccess" x ON x."id"=e."accessId"
   WHERE e."clubId"=c."id" AND e."clubMemberId"=m."id" AND e."playerId"=p."id"
    AND e."action"='CLAIM' AND e."actorUserId"=c."createdById" AND e."previousOwnerUserId" IS NULL AND e."newOwnerUserId"=c."createdById"
    AND e."previousOwnershipRevision"=0 AND e."newOwnershipRevision"=1
    AND e."previousAccessRevision"=0 AND e."newAccessRevision"=0
    AND e."previousAccessStatus"='ACTIVE' AND e."newAccessStatus"='ACTIVE' AND e."previousAccessRole"='OWNER' AND e."newAccessRole"='OWNER'
    AND x."clubId"=c."id" AND x."userId"=c."createdById"
    AND e."invitationId" IS NULL AND e."admissionRequestId" IS NULL AND e."releaseEventId" IS NULL
    AND e."reason"='Club creator claimed their new local player profile.')))
UNION ALL
SELECT c."id",'SHARED_PROFILE' FROM "Community" c WHERE EXISTS (
 SELECT 1 FROM "CommunityMember" m JOIN "CommunityMember" other ON other."userId"=m."userId" AND other."id"!=m."id" WHERE m."communityId"=c."id")
UNION ALL
SELECT c."id",'RATING_HISTORY' FROM "Community" c WHERE
 EXISTS (SELECT 1 FROM "MatchEloAdjustment" a WHERE a."communityId"=c."id")
 OR EXISTS (SELECT 1 FROM "CommunityMember" m JOIN "User" p ON p."id"=m."userId" WHERE m."communityId"=c."id" AND (m."elo"!=1000 OR p."elo"!=1000))
 OR EXISTS (SELECT 1 FROM "ClubRatingAdjustment" a JOIN "CommunityMember" m ON m."id"=a."memberId" WHERE m."communityId"=c."id")
UNION ALL
SELECT c."id",'PROFILE_HISTORY' FROM "Community" c WHERE EXISTS (
 SELECT 1 FROM "CommunityMember" m WHERE m."communityId"=c."id" AND (
  EXISTS (SELECT 1 FROM "PlayerRetirementBlocker" b WHERE b."playerId"=m."userId" AND b."reason" NOT IN ('ROSTER_NOT_ARCHIVED','CLUB_RELATIONSHIPS','RATING_DATA'))
  OR EXISTS (SELECT 1 FROM "ClubJoinRequest" r WHERE r."requestedPlayerId"=m."userId" OR r."approvedPlayerId"=m."userId")
  OR EXISTS (SELECT 1 FROM "ClaimRequest" r WHERE r."targetUserId"=m."userId")
  OR EXISTS (SELECT 1 FROM "PlayerInvitation" i WHERE i."playerId"=m."userId" OR i."sourcePlayerId"=m."userId" OR i."retireSourcePlayerId"=m."userId")
  OR EXISTS (SELECT 1 FROM "ClubPlayerOwnershipEvent" e WHERE e."playerId"=m."userId" AND e."clubId"!=c."id")
  OR EXISTS (SELECT 1 FROM "PlayerOwnershipRelease" r WHERE r."playerId"=m."userId")
  OR EXISTS (SELECT 1 FROM "SessionLineupRow" l WHERE l."team1Player1Id"=m."userId" OR l."team1Player2Id"=m."userId" OR l."team2Player1Id"=m."userId" OR l."team2Player2Id"=m."userId")))
UNION ALL
SELECT c."id",'LINKED_HISTORY' FROM "Community" c WHERE
 EXISTS (SELECT 1 FROM "OfflineIdentityMember" m WHERE m."communityId"=c."id")
 OR EXISTS (SELECT 1 FROM "OfflineIdentityLinkRequest" r WHERE r."sourceCommunityId"=c."id" OR r."targetCommunityId"=c."id")
 OR EXISTS (SELECT 1 FROM "PlayerOwnershipRelease" r WHERE r."clubId"=c."id")
 OR EXISTS (SELECT 1 FROM "ClubNewsLike" n WHERE n."communityId"=c."id")
 OR EXISTS (SELECT 1 FROM "ClubNotification" n WHERE n."communityId"=c."id");

-- Authority is checked against the authenticated account inside the service's
-- reserved write transaction (including its existing global-admin capability).
-- The database independently checks eligibility and the exact live setup.
CREATE TRIGGER "ClubDeletionReceipt_validate" BEFORE INSERT ON "ClubDeletionReceipt"
WHEN EXISTS (SELECT 1 FROM "ClubDeletionReceipt" r WHERE r."clubId"=NEW."clubId")
 OR NOT EXISTS (SELECT 1 FROM "Account" a WHERE a."id"=NEW."actorUserId" AND a."isActive"=1)
 OR EXISTS (SELECT 1 FROM "UnusedClubDeletionBlocker" b WHERE b."clubId"=NEW."clubId")
 OR NOT EXISTS (SELECT 1 FROM "UnusedClubDeletionSetup" s WHERE s."clubId"=NEW."clubId"
  AND s."clubName"=NEW."clubName" AND s."creatorUserId"=NEW."creatorUserId"
  AND s."clubMemberId" IS NEW."clubMemberId" AND s."playerId" IS NEW."playerId"
  AND s."setupEventId" IS NEW."setupEventId" AND s."setupEventJson" IS NEW."setupEventJson")
BEGIN SELECT RAISE(ABORT,'UNUSED_CLUB_DELETION_INVALID'); END;

CREATE TRIGGER "ClubDeletionReceipt_no_update" BEFORE UPDATE ON "ClubDeletionReceipt"
BEGIN SELECT RAISE(ABORT,'CLUB_DELETION_RECEIPT_IMMUTABLE'); END;
CREATE TRIGGER "ClubDeletionReceipt_no_delete" BEFORE DELETE ON "ClubDeletionReceipt"
BEGIN SELECT RAISE(ABORT,'CLUB_DELETION_RECEIPT_IMMUTABLE'); END;

-- A receipt is inserted and consumed in one statement. It cannot grant a
-- reusable deletion bypass because its original IDs can never be recreated.
CREATE TRIGGER "ClubDeletionReceipt_no_club_reuse" BEFORE INSERT ON "Community"
WHEN EXISTS (SELECT 1 FROM "ClubDeletionReceipt" r WHERE r."clubId"=NEW."id")
BEGIN SELECT RAISE(ABORT,'DELETED_CLUB_ID_REUSED'); END;
CREATE TRIGGER "ClubDeletionReceipt_no_member_reuse" BEFORE INSERT ON "CommunityMember"
WHEN EXISTS (SELECT 1 FROM "ClubDeletionReceipt" r WHERE r."clubMemberId"=NEW."id")
BEGIN SELECT RAISE(ABORT,'DELETED_CLUB_MEMBER_ID_REUSED'); END;
CREATE TRIGGER "ClubDeletionReceipt_no_player_reuse" BEFORE INSERT ON "User"
WHEN EXISTS (SELECT 1 FROM "ClubDeletionReceipt" r WHERE r."playerId"=NEW."id")
BEGIN SELECT RAISE(ABORT,'DELETED_CLUB_PLAYER_ID_REUSED'); END;

DROP TRIGGER "ClubPlayerOwnershipEvent_no_delete";
CREATE TRIGGER "ClubPlayerOwnershipEvent_no_delete" BEFORE DELETE ON "ClubPlayerOwnershipEvent"
WHEN NOT EXISTS (SELECT 1 FROM "ClubDeletionReceipt" r WHERE r."clubId"=OLD."clubId" AND r."setupEventId"=OLD."id")
BEGIN SELECT RAISE(ABORT,'LOCAL_OWNERSHIP_AUDIT_IMMUTABLE'); END;

DROP TRIGGER "ClubMember_local_history_no_delete";
CREATE TRIGGER "ClubMember_local_history_no_delete" BEFORE DELETE ON "CommunityMember"
WHEN EXISTS (SELECT 1 FROM "Community" c WHERE c."id"=OLD."communityId"
 AND (c."isTutorial"!=1 OR c."tutorialOwnerId" IS NULL OR c."tutorialOwnerId" IS NOT c."createdById"))
 AND NOT EXISTS (SELECT 1 FROM "ClubDeletionReceipt" r WHERE r."clubId"=OLD."communityId" AND r."clubMemberId"=OLD."id" AND r."playerId"=OLD."userId")
BEGIN SELECT RAISE(ABORT,'LOCAL_ROSTER_HISTORY_PRESERVED'); END;

DROP TRIGGER "Club_local_history_no_delete";
CREATE TRIGGER "Club_local_history_no_delete" BEFORE DELETE ON "Community"
WHEN (OLD."isTutorial"!=1 OR OLD."tutorialOwnerId" IS NULL OR OLD."tutorialOwnerId" IS NOT OLD."createdById")
 AND NOT EXISTS (SELECT 1 FROM "ClubDeletionReceipt" r WHERE r."clubId"=OLD."id")
BEGIN SELECT RAISE(ABORT,'LOCAL_ROSTER_HISTORY_PRESERVED'); END;

CREATE TRIGGER "ClubDeletionReceipt_apply" AFTER INSERT ON "ClubDeletionReceipt"
BEGIN
 DELETE FROM "ClubPlayerOwnershipEvent" WHERE "id"=NEW."setupEventId";
 DELETE FROM "CommunityMember" WHERE "id"=NEW."clubMemberId";
 DELETE FROM "ClubAccess" WHERE "clubId"=NEW."clubId";
 DELETE FROM "Community" WHERE "id"=NEW."clubId";
 DELETE FROM "User" WHERE "id"=NEW."playerId";
END;
