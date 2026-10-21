-- Forward correction: unused local placeholders are setup, not sporting history.
-- Installation adds one nullable audit field and changes no existing values.
ALTER TABLE "ClubDeletionReceipt" ADD COLUMN "cleanupJson" TEXT
 CHECK ("cleanupJson" IS NULL OR (json_valid("cleanupJson") AND json_type("cleanupJson")='object'));

CREATE VIEW "UnusedClubDeletionEventSnapshot" AS
SELECT e."id",e."clubId",e."clubMemberId",json_object(
  'id',e."id",'clubId',e."clubId",'clubMemberId',e."clubMemberId",'playerId',e."playerId",
  'actorUserId',e."actorUserId",'action',e."action",'previousOwnerUserId',e."previousOwnerUserId",'newOwnerUserId',e."newOwnerUserId",
  'previousOwnershipRevision',e."previousOwnershipRevision",'newOwnershipRevision',e."newOwnershipRevision",
  'accessId',e."accessId",'previousAccessRevision',e."previousAccessRevision",'newAccessRevision',e."newAccessRevision",
  'previousAccessStatus',e."previousAccessStatus",'newAccessStatus',e."newAccessStatus",'previousAccessRole',e."previousAccessRole",'newAccessRole',e."newAccessRole",
  'invitationId',e."invitationId",'admissionRequestId',e."admissionRequestId",'releaseEventId',e."releaseEventId",
  'metadataBeforeJson',e."metadataBeforeJson",'metadataAfterJson',e."metadataAfterJson",'detailsJson',e."detailsJson",'reason',e."reason",'createdAt',e."createdAt"
 ) AS "eventJson"
FROM "ClubPlayerOwnershipEvent" e;

CREATE VIEW "UnusedClubDeletionCleanup" AS
SELECT c."id" AS "clubId",json_object(
 'memberIds',json((SELECT json_group_array("id") FROM (SELECT m."id" FROM "CommunityMember" m WHERE m."communityId"=c."id" ORDER BY m."id"))),
 'playerIds',json((SELECT json_group_array("userId") FROM (SELECT m."userId" FROM "CommunityMember" m WHERE m."communityId"=c."id" ORDER BY m."userId"))),
 'ownershipEvents',json((SELECT json_group_array(json("eventJson")) FROM (SELECT e."eventJson" FROM "UnusedClubDeletionEventSnapshot" e WHERE e."clubId"=c."id" ORDER BY e."id"))),
 'ratingAdjustments',json((SELECT json_group_array(json("payload")) FROM (
  SELECT json_object('id',a."id",'memberId',a."memberId",'actorId',a."actorId",'actorName',a."actorName",'beforeElo',a."beforeElo",'afterElo',a."afterElo",'reason',a."reason",'createdAt',a."createdAt") AS "payload"
  FROM "ClubRatingAdjustment" a JOIN "CommunityMember" m ON m."id"=a."memberId" WHERE m."communityId"=c."id" ORDER BY a."id")))
) AS "cleanupJson" FROM "Community" c;

DROP VIEW "UnusedClubDeletionSetup";
CREATE VIEW "UnusedClubDeletionSetup" AS
SELECT c."id" AS "clubId",c."name" AS "clubName",c."createdById" AS "creatorUserId",
 m."id" AS "clubMemberId",m."userId" AS "playerId",e."id" AS "setupEventId",e."eventJson" AS "setupEventJson",cleanup."cleanupJson"
FROM "Community" c JOIN "UnusedClubDeletionCleanup" cleanup ON cleanup."clubId"=c."id"
LEFT JOIN "CommunityMember" m ON m."id"=(SELECT owner."id" FROM "CommunityMember" owner
 WHERE owner."communityId"=c."id" AND owner."ownerUserId"=c."createdById" ORDER BY owner."id" LIMIT 1)
LEFT JOIN "UnusedClubDeletionEventSnapshot" e ON e."id"=(SELECT initial."id" FROM "ClubPlayerOwnershipEvent" initial
 WHERE initial."clubMemberId"=m."id" AND initial."action"='CLAIM' ORDER BY initial."newOwnershipRevision",initial."id" LIMIT 1);

DROP VIEW "UnusedClubDeletionBlocker";
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
SELECT c."id",'OTHER_MEMBERS' FROM "Community" c WHERE EXISTS (
 SELECT 1 FROM "CommunityMember" m WHERE m."communityId"=c."id"
 AND ((m."ownerUserId" IS NOT NULL AND m."ownerUserId"!=c."createdById") OR m."retiredByAdmissionEventId" IS NOT NULL))
UNION ALL
SELECT c."id",'ACCESS_HISTORY' FROM "Community" c WHERE EXISTS (
 SELECT 1 FROM "ClubAccess" x WHERE x."clubId"=c."id" AND x."userId"!=c."createdById")
UNION ALL
SELECT c."id",'OWNERSHIP_HISTORY' FROM "Community" c WHERE
 EXISTS (SELECT 1 FROM "CommunityMember" m JOIN "User" p ON p."id"=m."userId" WHERE m."communityId"=c."id"
  AND (p."ownerUserId" IS NOT NULL OR p."email" IS NOT NULL OR p."passwordHash" IS NOT NULL))
 OR EXISTS (SELECT 1 FROM "ClubPlayerOwnershipEvent" e WHERE e."clubId"=c."id" AND (
  (e."previousOwnerUserId" IS NOT NULL AND e."previousOwnerUserId"!=c."createdById")
  OR (e."newOwnerUserId" IS NOT NULL AND e."newOwnerUserId"!=c."createdById")
  OR e."invitationId" IS NOT NULL OR e."admissionRequestId" IS NOT NULL OR e."releaseEventId" IS NOT NULL))
UNION ALL
SELECT c."id",'SHARED_PROFILE' FROM "Community" c WHERE EXISTS (
 SELECT 1 FROM "CommunityMember" m JOIN "CommunityMember" other ON other."userId"=m."userId" AND other."id"!=m."id" WHERE m."communityId"=c."id")
UNION ALL
SELECT c."id",'RATING_HISTORY' FROM "Community" c WHERE
 EXISTS (SELECT 1 FROM "MatchEloAdjustment" a WHERE a."communityId"=c."id")
 OR EXISTS (SELECT 1 FROM "MatchEloAdjustment" a JOIN "CommunityMember" m ON m."userId"=a."userId" WHERE m."communityId"=c."id")
UNION ALL
SELECT c."id",'PROFILE_HISTORY' FROM "Community" c WHERE EXISTS (
 SELECT 1 FROM "CommunityMember" m WHERE m."communityId"=c."id" AND (
  EXISTS (SELECT 1 FROM "PlayerRetirementBlocker" b WHERE b."playerId"=m."userId" AND b."reason" NOT IN ('ROSTER_NOT_ARCHIVED','CLUB_RELATIONSHIPS','RATING_DATA','ACHIEVEMENT_PREFERENCES'))
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


DROP TRIGGER "ClubDeletionReceipt_validate";
CREATE TRIGGER "ClubDeletionReceipt_validate" BEFORE INSERT ON "ClubDeletionReceipt"
WHEN EXISTS (SELECT 1 FROM "ClubDeletionReceipt" r WHERE r."clubId"=NEW."clubId")
 OR NOT EXISTS (SELECT 1 FROM "Account" a WHERE a."id"=NEW."actorUserId" AND a."isActive"=1)
 OR EXISTS (SELECT 1 FROM "UnusedClubDeletionBlocker" b WHERE b."clubId"=NEW."clubId")
 OR NOT EXISTS (SELECT 1 FROM "UnusedClubDeletionSetup" s WHERE s."clubId"=NEW."clubId"
  AND s."clubName"=NEW."clubName" AND s."creatorUserId"=NEW."creatorUserId"
  AND s."clubMemberId" IS NEW."clubMemberId" AND s."playerId" IS NEW."playerId"
  AND s."setupEventId" IS NEW."setupEventId" AND s."setupEventJson" IS NEW."setupEventJson"
  AND (s."cleanupJson" IS NEW."cleanupJson" OR (
   -- Preserve old-app deletion of a fresh creator-only/empty club during deploy.
   -- Extra profiles/events require the new application's complete snapshot.
   NEW."cleanupJson" IS NULL AND json_array_length(s."cleanupJson",'$.ratingAdjustments')=0 AND (
    (json_array_length(s."cleanupJson",'$.memberIds')=0 AND json_array_length(s."cleanupJson",'$.ownershipEvents')=0)
    OR (json_array_length(s."cleanupJson",'$.memberIds')=1 AND s."clubMemberId" IS NOT NULL
     AND json_array_length(s."cleanupJson",'$.ownershipEvents')=1
     AND json_extract(s."cleanupJson",'$.ownershipEvents[0].id') IS s."setupEventId")))))
BEGIN SELECT RAISE(ABORT,'UNUSED_CLUB_DELETION_INVALID'); END;

DROP TRIGGER "ClubPlayerOwnershipEvent_no_delete";
CREATE TRIGGER "ClubPlayerOwnershipEvent_no_delete" BEFORE DELETE ON "ClubPlayerOwnershipEvent"
WHEN NOT EXISTS (SELECT 1 FROM "ClubDeletionReceipt" r WHERE r."clubId"=OLD."clubId" AND (
 r."setupEventId"=OLD."id" OR EXISTS (SELECT 1 FROM json_each(r."cleanupJson",'$.ownershipEvents') j WHERE json_extract(j."value",'$.id')=OLD."id")))
BEGIN SELECT RAISE(ABORT,'LOCAL_OWNERSHIP_AUDIT_IMMUTABLE'); END;

DROP TRIGGER "ClubMember_local_history_no_delete";
CREATE TRIGGER "ClubMember_local_history_no_delete" BEFORE DELETE ON "CommunityMember"
WHEN EXISTS (SELECT 1 FROM "Community" c WHERE c."id"=OLD."communityId"
 AND (c."isTutorial"!=1 OR c."tutorialOwnerId" IS NULL OR c."tutorialOwnerId" IS NOT c."createdById"))
 AND NOT EXISTS (SELECT 1 FROM "ClubDeletionReceipt" r WHERE r."clubId"=OLD."communityId" AND (
  (r."clubMemberId"=OLD."id" AND r."playerId"=OLD."userId")
  OR EXISTS (SELECT 1 FROM json_each(r."cleanupJson",'$.memberIds') j WHERE j."value"=OLD."id")))
BEGIN SELECT RAISE(ABORT,'LOCAL_ROSTER_HISTORY_PRESERVED'); END;

DROP TRIGGER "ClubDeletionReceipt_no_member_reuse";
CREATE TRIGGER "ClubDeletionReceipt_no_member_reuse" BEFORE INSERT ON "CommunityMember"
WHEN EXISTS (SELECT 1 FROM "ClubDeletionReceipt" r WHERE r."clubMemberId"=NEW."id"
 OR EXISTS (SELECT 1 FROM json_each(r."cleanupJson",'$.memberIds') j WHERE j."value"=NEW."id"))
BEGIN SELECT RAISE(ABORT,'DELETED_CLUB_MEMBER_ID_REUSED'); END;

DROP TRIGGER "ClubDeletionReceipt_no_player_reuse";
CREATE TRIGGER "ClubDeletionReceipt_no_player_reuse" BEFORE INSERT ON "User"
WHEN EXISTS (SELECT 1 FROM "ClubDeletionReceipt" r WHERE r."playerId"=NEW."id"
 OR EXISTS (SELECT 1 FROM json_each(r."cleanupJson",'$.playerIds') j WHERE j."value"=NEW."id"))
BEGIN SELECT RAISE(ABORT,'DELETED_CLUB_PLAYER_ID_REUSED'); END;

DROP TRIGGER "ClubDeletionReceipt_apply";
CREATE TRIGGER "ClubDeletionReceipt_apply" AFTER INSERT ON "ClubDeletionReceipt"
BEGIN
 DELETE FROM "ClubPlayerOwnershipEvent" WHERE "clubId"=NEW."clubId";
 DELETE FROM "CommunityMember" WHERE "communityId"=NEW."clubId";
 DELETE FROM "ClubAccess" WHERE "clubId"=NEW."clubId";
 DELETE FROM "Community" WHERE "id"=NEW."clubId";
 DELETE FROM "User" WHERE "id"=NEW."playerId" OR "id" IN (SELECT "value" FROM json_each(NEW."cleanupJson",'$.playerIds'));
END;
