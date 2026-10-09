-- Permanent ownership remains unchanged. Only audited, empty retired rosters
-- are exempt from the account/club uniqueness constraint.
ALTER TABLE "ClubJoinRequest" ADD COLUMN "originInvitationId" TEXT REFERENCES "PlayerInvitation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CommunityMember" ADD COLUMN "retiredByAdmissionEventId" TEXT REFERENCES "ClubAdmissionEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "ClubJoinRequest_originInvitationId_userId_idx" ON "ClubJoinRequest"("originInvitationId","userId");
CREATE UNIQUE INDEX "CommunityMember_retiredByAdmissionEventId_key" ON "CommunityMember"("retiredByAdmissionEventId");
DROP INDEX "CommunityMember_communityId_ownerUserId_key";
CREATE UNIQUE INDEX "CommunityMember_nonretired_owner_key" ON "CommunityMember"("communityId","ownerUserId") WHERE "retiredByAdmissionEventId" IS NULL;

-- The service and retirement trigger use this same read-only eligibility inventory.
-- Terminal admission/invitation audits are intentionally retained and do not block.
CREATE VIEW "PlayerRetirementBlocker" AS
SELECT p."id" AS "playerId", 'CLUB_RELATIONSHIPS' AS "reason" FROM "User" p WHERE (SELECT count(*) FROM "CommunityMember" m WHERE m."userId"=p."id") != 1
UNION ALL
SELECT p."id" AS "playerId", 'ROSTER_NOT_ARCHIVED' AS "reason" FROM "User" p WHERE EXISTS (SELECT 1 FROM "CommunityMember" m WHERE m."userId"=p."id" AND (m."archivedAt" IS NULL OR m."retiredByAdmissionEventId" IS NOT NULL))
UNION ALL
SELECT p."id" AS "playerId", 'RATING_DATA' AS "reason" FROM "User" p WHERE p."elo" != 1000 OR EXISTS (SELECT 1 FROM "CommunityMember" m WHERE m."userId"=p."id" AND m."elo" != 1000) OR EXISTS (SELECT 1 FROM "MatchEloAdjustment" a WHERE a."userId"=p."id") OR EXISTS (SELECT 1 FROM "ClubRatingAdjustment" a JOIN "CommunityMember" m ON m."id"=a."memberId" WHERE m."userId"=p."id")
UNION ALL
SELECT p."id" AS "playerId", 'ACHIEVEMENT_PREFERENCES' AS "reason" FROM "User" p WHERE EXISTS (SELECT 1 FROM "CommunityMember" m WHERE m."userId"=p."id" AND CASE WHEN json_valid(m."achievementPreferencesJson") THEN json_type(m."achievementPreferencesJson") != 'object' OR EXISTS (SELECT 1 FROM json_each(m."achievementPreferencesJson")) ELSE 1 END)
UNION ALL
SELECT p."id" AS "playerId", 'SESSION_PARTICIPATION' AS "reason" FROM "User" p WHERE EXISTS (SELECT 1 FROM "SessionPlayer" s WHERE s."userId"=p."id" OR s."lastPartnerId"=p."id")
UNION ALL
SELECT p."id" AS "playerId", 'MATCH_HISTORY' AS "reason" FROM "User" p WHERE EXISTS (SELECT 1 FROM "Match" m WHERE m."team1User1Id"=p."id" OR m."team1User2Id"=p."id" OR m."team2User1Id"=p."id" OR m."team2User2Id"=p."id" OR m."scoreSubmittedByPlayerId"=p."id")
UNION ALL
SELECT p."id" AS "playerId", 'QUEUED_MATCH' AS "reason" FROM "User" p WHERE EXISTS (SELECT 1 FROM "QueuedMatch" m WHERE m."team1User1Id"=p."id" OR m."team1User2Id"=p."id" OR m."team2User1Id"=p."id" OR m."team2User2Id"=p."id")
UNION ALL
SELECT p."id" AS "playerId", 'HOSTING_CREDIT' AS "reason" FROM "User" p WHERE EXISTS (SELECT 1 FROM "SessionCommunity" s WHERE s."creditedHostPlayerId"=p."id")
UNION ALL
SELECT p."id" AS "playerId", 'OFFLINE_IDENTITY' AS "reason" FROM "User" p WHERE EXISTS (SELECT 1 FROM "OfflineIdentityMember" m WHERE m."userId"=p."id") OR EXISTS (SELECT 1 FROM "OfflineIdentityLinkRequest" r WHERE r."sourceUserId"=p."id" OR r."targetUserId"=p."id")
UNION ALL
SELECT p."id" AS "playerId", 'NOTIFICATIONS' AS "reason" FROM "User" p WHERE EXISTS (SELECT 1 FROM "ClubNotification" n WHERE n."recipientUserId"=p."id")
UNION ALL
SELECT p."id" AS "playerId", 'UNRESOLVED_REQUEST' AS "reason" FROM "User" p WHERE EXISTS (SELECT 1 FROM "ClaimRequest" r WHERE r."targetUserId"=p."id" AND r."status"='PENDING') OR EXISTS (SELECT 1 FROM "ClubJoinRequest" r WHERE (r."requestedPlayerId"=p."id" OR r."approvedPlayerId"=p."id") AND r."status"='PENDING') OR EXISTS (SELECT 1 FROM "PlayerInvitation" i WHERE i."playerId"=p."id" AND i."status"='ACTIVE')
UNION ALL
SELECT p."id" AS "playerId", 'MATCH_METADATA' AS "reason" FROM "User" p WHERE EXISTS (SELECT 1 FROM "Match" s WHERE s."matchmakingReasonJson" IS NOT NULL AND CASE WHEN json_valid(s."matchmakingReasonJson") THEN EXISTS (
 WITH RECURSIVE docs(doc) AS (SELECT s."matchmakingReasonJson" UNION SELECT child.value FROM docs d, json_tree(d.doc) child WHERE child.type='text' AND json_valid(child.value))
 SELECT 1 FROM docs d, json_tree(d.doc) j WHERE j."value"=p."id" OR j."key"=p."id") ELSE 1 END)
UNION ALL
SELECT p."id" AS "playerId", 'QUEUE_METADATA' AS "reason" FROM "User" p WHERE EXISTS (SELECT 1 FROM "QueuedMatch" s WHERE s."matchmakingReasonJson" IS NOT NULL AND CASE WHEN json_valid(s."matchmakingReasonJson") THEN EXISTS (
 WITH RECURSIVE docs(doc) AS (SELECT s."matchmakingReasonJson" UNION SELECT child.value FROM docs d, json_tree(d.doc) child WHERE child.type='text' AND json_valid(child.value))
 SELECT 1 FROM docs d, json_tree(d.doc) j WHERE j."value"=p."id" OR j."key"=p."id") ELSE 1 END)
UNION ALL
SELECT p."id" AS "playerId", 'UNSNAPSHOTTED_ACHIEVEMENTS' AS "reason" FROM "User" p WHERE EXISTS (
 SELECT 1 FROM "CommunityMember" m JOIN "Session" s ON s."communityId"=m."communityId" OR EXISTS (SELECT 1 FROM "SessionCommunity" sc WHERE sc."sessionId"=s."id" AND sc."communityId"=m."communityId" AND sc."status"='ACCEPTED')
 WHERE m."userId"=p."id" AND s."status"='COMPLETED' AND s."isTest"=0 AND (
  (typeof(m."createdAt") NOT IN ('integer','real') AND julianday(m."createdAt") IS NULL)
  OR (typeof(coalesce(s."endedAt",s."createdAt")) NOT IN ('integer','real') AND julianday(coalesce(s."endedAt",s."createdAt")) IS NULL)
  OR ((CASE WHEN typeof(m."createdAt") IN ('integer','real') THEN m."createdAt" ELSE round((julianday(m."createdAt")-2440587.5)*86400000) END) <= (CASE WHEN typeof(coalesce(s."endedAt",s."createdAt")) IN ('integer','real') THEN coalesce(s."endedAt",s."createdAt") ELSE round((julianday(coalesce(s."endedAt",s."createdAt"))-2440587.5)*86400000) END)
   AND NOT EXISTS (SELECT 1 FROM json_each(CASE WHEN json_valid(s."achievementEligibilityJson") THEN s."achievementEligibilityJson" ELSE '{}' END) j WHERE j."key"=m."communityId" AND j."type"='array'))))
UNION ALL
SELECT p."id" AS "playerId", 'ACHIEVEMENT_ELIGIBILITY' AS "reason" FROM "User" p WHERE EXISTS (SELECT 1 FROM "Session" s WHERE s."achievementEligibilityJson" IS NOT NULL AND CASE WHEN json_valid(s."achievementEligibilityJson") THEN EXISTS (
 WITH RECURSIVE docs(doc) AS (SELECT s."achievementEligibilityJson" UNION SELECT child.value FROM docs d, json_tree(d.doc) child WHERE child.type='text' AND json_valid(child.value))
 SELECT 1 FROM docs d, json_tree(d.doc) j WHERE j."value"=p."id" OR j."key"=p."id") ELSE 1 END);
CREATE VIEW "RetiredPlayer" AS SELECT "userId" AS "playerId" FROM "CommunityMember" WHERE "retiredByAdmissionEventId" IS NOT NULL;
CREATE VIEW "RecoverablePlayerInvitation" AS
SELECT i.* FROM "PlayerInvitation" i JOIN "CommunityMember" m ON m."id"=i."clubMemberId"
JOIN "User" p ON p."id"=i."playerId" JOIN "Community" c ON c."id"=i."clubId"
WHERE i."status"='ACTIVE' AND m."communityId"=i."clubId" AND m."userId"=i."playerId"
 AND m."archivedAt" IS NULL AND m."retiredByAdmissionEventId" IS NULL
 AND p."isActive"=1 AND p."ownerUserId" IS NULL AND c."isTutorial"=0
 AND (CASE WHEN typeof(i."expiresAt") IN ('integer','real') THEN i."expiresAt" ELSE round((julianday(i."expiresAt")-2440587.5)*86400000) END) > round((julianday('now')-2440587.5)*86400000);

CREATE TRIGGER "Recovery_request_insert_guard" BEFORE INSERT ON "ClubJoinRequest"
WHEN NEW."originInvitationId" IS NOT NULL AND (
 NEW."kind"!='EXISTING_PLAYER' OR NEW."status"!='PENDING' OR NEW."approvedPlayerId" IS NOT NULL
 OR NOT EXISTS (SELECT 1 FROM "RecoverablePlayerInvitation" i JOIN "Account" a ON a."id"=NEW."userId"
 WHERE i."id"=NEW."originInvitationId" AND i."clubId"=NEW."clubId" AND i."playerId"=NEW."requestedPlayerId"
 AND i."createdByUserId"!=NEW."userId" AND a."isActive"=1))
BEGIN SELECT RAISE(ABORT,'RECOVERY_BINDING_INVALID'); END;
CREATE TRIGGER "Recovery_binding_insert_collision_guard" BEFORE INSERT ON "ClubJoinRequest"
WHEN EXISTS (SELECT 1 FROM "ClubJoinRequest" old WHERE (old."originInvitationId" IS NOT NULL OR NEW."originInvitationId" IS NOT NULL) AND (
 old."id"=NEW."id"
 OR (NEW."idempotencyKey" IS NOT NULL AND old."userId"=NEW."userId" AND old."idempotencyKey"=NEW."idempotencyKey")
 OR (NEW."legacyClaimRequestId" IS NOT NULL AND old."legacyClaimRequestId"=NEW."legacyClaimRequestId")
 OR (NEW."status"='PENDING' AND old."status"='PENDING' AND old."clubId"=NEW."clubId" AND old."userId"=NEW."userId")))
BEGIN SELECT RAISE(ABORT,'RECOVERY_BINDING_COLLISION'); END;
CREATE TRIGGER "Recovery_binding_immutable" BEFORE UPDATE ON "ClubJoinRequest"
WHEN (OLD."originInvitationId" IS NOT NULL OR NEW."originInvitationId" IS NOT NULL) AND (
 NEW."id" IS NOT OLD."id" OR NEW."originInvitationId" IS NOT OLD."originInvitationId"
 OR NEW."clubId" IS NOT OLD."clubId" OR NEW."userId" IS NOT OLD."userId"
 OR NEW."requestedPlayerId" IS NOT OLD."requestedPlayerId" OR NEW."kind" IS NOT OLD."kind"
 OR NEW."idempotencyKey" IS NOT OLD."idempotencyKey" OR NEW."createdAt" IS NOT OLD."createdAt")
BEGIN SELECT RAISE(ABORT,'RECOVERY_BINDING_IMMUTABLE'); END;

CREATE TRIGGER "Recovery_approval_event_guard" BEFORE INSERT ON "ClubAdmissionEvent"
WHEN EXISTS (SELECT 1 FROM "ClubAdmissionEvent" old WHERE old."id"=NEW."id" OR (old."admissionRequestId"=NEW."admissionRequestId" AND old."revision"=NEW."revision"))
 OR (NEW."action"='APPROVE_RECOVERY' AND NOT EXISTS (
 SELECT 1 FROM "ClubJoinRequest" r JOIN "RecoverablePlayerInvitation" i ON i."id"=r."originInvitationId"
 JOIN "Account" a ON a."id"=NEW."actorUserId" JOIN "Account" requester ON requester."id"=r."userId"
 JOIN "ClubAccess" access ON access."clubId"=r."clubId" AND access."userId"=a."id"
 WHERE r."id"=NEW."admissionRequestId" AND r."status"='PENDING' AND r."revision"=NEW."revision"
 AND access."status"='ACTIVE' AND access."role" IN ('ADMIN','OWNER') AND a."isActive"=1 AND requester."isActive"=1
 AND a."id"!=r."userId" AND i."createdByUserId"!=r."userId"
 AND json_valid(NEW."detailsJson") AND json_extract(NEW."detailsJson",'$.targetPlayerId')=r."requestedPlayerId"
 AND json_extract(NEW."detailsJson",'$.originInvitationId')=r."originInvitationId"
 AND json_extract(NEW."detailsJson",'$.restoredAccess')=EXISTS (SELECT 1 FROM "ClubAccess" revoked WHERE revoked."clubId"=r."clubId" AND revoked."userId"=r."userId" AND revoked."status"!='ACTIVE')
 AND (NOT EXISTS (SELECT 1 FROM "ClubAccess" revoked WHERE revoked."clubId"=r."clubId" AND revoked."userId"=r."userId" AND revoked."status"!='ACTIVE')
      OR json_extract(NEW."detailsJson",'$.confirmRestoreAccess')=1)))
BEGIN SELECT RAISE(ABORT,'RECOVERY_APPROVAL_INVALID'); END;
CREATE TRIGGER "PlayerInvitationEvent_insert_collision_guard" BEFORE INSERT ON "PlayerInvitationEvent"
WHEN EXISTS (SELECT 1 FROM "PlayerInvitationEvent" old WHERE old."id"=NEW."id")
BEGIN SELECT RAISE(ABORT,'INVITATION_EVENT_IMMUTABLE'); END;

CREATE TRIGGER "ClubMember_retirement_guard" BEFORE UPDATE OF "retiredByAdmissionEventId" ON "CommunityMember"
WHEN NEW."retiredByAdmissionEventId" IS NOT OLD."retiredByAdmissionEventId" AND (
 OLD."retiredByAdmissionEventId" IS NOT NULL OR NEW."retiredByAdmissionEventId" IS NULL
 OR NEW."archivedAt" IS NULL OR NEW."ownerUserId" IS NULL
 OR EXISTS (SELECT 1 FROM "PlayerRetirementBlocker" b WHERE b."playerId"=OLD."userId")
 OR NOT EXISTS (SELECT 1 FROM "ClubAdmissionEvent" e JOIN "ClubJoinRequest" r ON r."id"=e."admissionRequestId"
 JOIN "RecoverablePlayerInvitation" i ON i."id"=r."originInvitationId" JOIN "User" p ON p."id"=OLD."userId"
 JOIN "ClubAccess" access ON access."clubId"=r."clubId" AND access."userId"=e."actorUserId"
 JOIN "Account" a ON a."id"=e."actorUserId" JOIN "Account" requester ON requester."id"=r."userId"
 WHERE e."id"=NEW."retiredByAdmissionEventId" AND e."action"='APPROVE_RECOVERY' AND e."revision"=r."revision"
 AND r."status"='PENDING' AND r."clubId"=OLD."communityId" AND r."userId"=p."ownerUserId" AND p."isActive"=0
 AND access."status"='ACTIVE' AND access."role" IN ('ADMIN','OWNER') AND a."isActive"=1 AND requester."isActive"=1 AND a."id"!=r."userId"
 AND json_extract(e."detailsJson",'$.sourcePlayerId')=OLD."userId"
 AND json_extract(e."detailsJson",'$.sourceMemberId')=OLD."id"
 AND json_extract(e."detailsJson",'$.targetPlayerId')=r."requestedPlayerId"
 AND length(trim(json_extract(e."detailsJson",'$.reason')))>0))
BEGIN SELECT RAISE(ABORT,'PLAYER_RETIREMENT_INVALID'); END;
CREATE TRIGGER "ClubMember_retirement_insert_guard" BEFORE INSERT ON "CommunityMember"
WHEN NEW."retiredByAdmissionEventId" IS NOT NULL
BEGIN SELECT RAISE(ABORT,'PLAYER_RETIREMENT_INVALID'); END;
CREATE TRIGGER "ClubMember_retirement_preserve" BEFORE UPDATE ON "CommunityMember"
WHEN OLD."retiredByAdmissionEventId" IS NOT NULL
BEGIN SELECT RAISE(ABORT,'PLAYER_RETIRED'); END;
CREATE TRIGGER "ClubMember_retirement_no_delete" BEFORE DELETE ON "CommunityMember" WHEN OLD."retiredByAdmissionEventId" IS NOT NULL
BEGIN SELECT RAISE(ABORT,'PLAYER_RETIRED'); END;
CREATE TRIGGER "Player_retirement_preserve" BEFORE UPDATE ON "User"
WHEN EXISTS (SELECT 1 FROM "RetiredPlayer" p WHERE p."playerId"=OLD."id")
BEGIN SELECT RAISE(ABORT,'PLAYER_RETIRED'); END;
CREATE TRIGGER "Player_retirement_no_delete" BEFORE DELETE ON "User" WHEN EXISTS (SELECT 1 FROM "RetiredPlayer" p WHERE p."playerId"=OLD."id")
BEGIN SELECT RAISE(ABORT,'PLAYER_RETIRED'); END;
CREATE TRIGGER "Player_insert_collision_guard" BEFORE INSERT ON "User"
WHEN EXISTS (SELECT 1 FROM "User" old WHERE (old."id"=NEW."id" OR (NEW."email" IS NOT NULL AND old."email"=NEW."email")) AND (
 EXISTS (SELECT 1 FROM "RetiredPlayer" p WHERE p."playerId"=old."id")
 OR (old."ownerUserId" IS NOT NULL AND (old."id" IS NOT NEW."id" OR NEW."ownerUserId" IS NOT old."ownerUserId"))))
BEGIN SELECT RAISE(ABORT,'PLAYER_IDENTITY_IMMUTABLE'); END;

CREATE TRIGGER "Recovery_final_approval_guard" BEFORE UPDATE OF "status" ON "ClubJoinRequest"
WHEN NEW."originInvitationId" IS NOT NULL AND NEW."status"='APPROVED' AND NOT EXISTS (
 SELECT 1 FROM "PlayerInvitation" i JOIN "User" p ON p."id"=i."playerId"
 JOIN "ClubAdmissionEvent" e ON e."admissionRequestId"=NEW."id" AND e."revision"=NEW."revision"
 WHERE i."id"=NEW."originInvitationId" AND i."status"='REDEEMED' AND i."redeemedByUserId"=NEW."userId"
 AND p."ownerUserId"=NEW."userId" AND NEW."approvedPlayerId"=i."playerId"
 AND e."action"='APPROVE_RECOVERY' AND e."actorUserId"=NEW."reviewedById"
 AND NEW."decision"='RECOVER_INVITED_PLAYER'
 AND EXISTS (SELECT 1 FROM "ClubAccess" access WHERE access."clubId"=NEW."clubId" AND access."userId"=NEW."userId" AND access."status"='ACTIVE'
 AND (json_extract(e."detailsJson",'$.restoredAccess')=0 OR access."role"='MEMBER'))
 AND (json_extract(e."detailsJson",'$.sourcePlayerId') IS NULL OR EXISTS (
 SELECT 1 FROM "CommunityMember" m WHERE m."retiredByAdmissionEventId"=e."id" AND m."userId"=json_extract(e."detailsJson",'$.sourcePlayerId'))))
BEGIN SELECT RAISE(ABORT,'RECOVERY_APPROVAL_INCOMPLETE'); END;
CREATE TRIGGER "CommunityMember_no_retired_reference_insert" BEFORE INSERT ON "CommunityMember" WHEN EXISTS (SELECT 1 FROM "RetiredPlayer" p WHERE p."playerId"=NEW."userId") OR EXISTS (SELECT 1 FROM "CommunityMember" old WHERE old."retiredByAdmissionEventId" IS NOT NULL AND (old."id"=NEW."id" OR (old."communityId"=NEW."communityId" AND old."userId"=NEW."userId")))
BEGIN SELECT RAISE(ABORT,'PLAYER_RETIRED'); END;
CREATE TRIGGER "CommunityMember_no_retired_reference_update" BEFORE UPDATE OF "userId" ON "CommunityMember" WHEN EXISTS (SELECT 1 FROM "RetiredPlayer" p WHERE p."playerId"=NEW."userId")
BEGIN SELECT RAISE(ABORT,'PLAYER_RETIRED'); END;
CREATE TRIGGER "SessionPlayer_no_retired_reference_insert" BEFORE INSERT ON "SessionPlayer" WHEN EXISTS (SELECT 1 FROM "RetiredPlayer" p WHERE p."playerId"=NEW."userId" OR p."playerId"=NEW."lastPartnerId")
BEGIN SELECT RAISE(ABORT,'PLAYER_RETIRED'); END;
CREATE TRIGGER "SessionPlayer_no_retired_reference_update" BEFORE UPDATE OF "userId", "lastPartnerId" ON "SessionPlayer" WHEN EXISTS (SELECT 1 FROM "RetiredPlayer" p WHERE p."playerId"=NEW."userId" OR p."playerId"=NEW."lastPartnerId")
BEGIN SELECT RAISE(ABORT,'PLAYER_RETIRED'); END;
CREATE TRIGGER "Match_no_retired_reference_insert" BEFORE INSERT ON "Match"
WHEN EXISTS (SELECT 1 FROM "RetiredPlayer" p WHERE p."playerId"=NEW."team1User1Id" OR p."playerId"=NEW."team1User2Id" OR p."playerId"=NEW."team2User1Id" OR p."playerId"=NEW."team2User2Id" OR p."playerId"=NEW."scoreSubmittedByPlayerId")
 OR (NEW."matchmakingReasonJson" IS NOT NULL AND CASE WHEN json_valid(NEW."matchmakingReasonJson") THEN EXISTS (
  WITH RECURSIVE docs(doc) AS (SELECT NEW."matchmakingReasonJson" UNION SELECT child.value FROM docs d, json_tree(d.doc) child WHERE child.type='text' AND json_valid(child.value))
  SELECT 1 FROM docs d, json_tree(d.doc) j JOIN "RetiredPlayer" p ON p."playerId"=j."value" OR p."playerId"=j."key") ELSE EXISTS (SELECT 1 FROM "RetiredPlayer") END)
BEGIN SELECT RAISE(ABORT,'PLAYER_RETIRED'); END;
CREATE TRIGGER "Match_no_retired_reference_update" BEFORE UPDATE OF "team1User1Id", "team1User2Id", "team2User1Id", "team2User2Id", "scoreSubmittedByPlayerId", "matchmakingReasonJson" ON "Match"
WHEN EXISTS (SELECT 1 FROM "RetiredPlayer" p WHERE p."playerId"=NEW."team1User1Id" OR p."playerId"=NEW."team1User2Id" OR p."playerId"=NEW."team2User1Id" OR p."playerId"=NEW."team2User2Id" OR p."playerId"=NEW."scoreSubmittedByPlayerId")
 OR (NEW."matchmakingReasonJson" IS NOT NULL AND CASE WHEN json_valid(NEW."matchmakingReasonJson") THEN EXISTS (
  WITH RECURSIVE docs(doc) AS (SELECT NEW."matchmakingReasonJson" UNION SELECT child.value FROM docs d, json_tree(d.doc) child WHERE child.type='text' AND json_valid(child.value))
  SELECT 1 FROM docs d, json_tree(d.doc) j JOIN "RetiredPlayer" p ON p."playerId"=j."value" OR p."playerId"=j."key") ELSE EXISTS (SELECT 1 FROM "RetiredPlayer") END)
BEGIN SELECT RAISE(ABORT,'PLAYER_RETIRED'); END;
CREATE TRIGGER "QueuedMatch_no_retired_reference_insert" BEFORE INSERT ON "QueuedMatch"
WHEN EXISTS (SELECT 1 FROM "RetiredPlayer" p WHERE p."playerId"=NEW."team1User1Id" OR p."playerId"=NEW."team1User2Id" OR p."playerId"=NEW."team2User1Id" OR p."playerId"=NEW."team2User2Id")
 OR (NEW."matchmakingReasonJson" IS NOT NULL AND CASE WHEN json_valid(NEW."matchmakingReasonJson") THEN EXISTS (
  WITH RECURSIVE docs(doc) AS (SELECT NEW."matchmakingReasonJson" UNION SELECT child.value FROM docs d, json_tree(d.doc) child WHERE child.type='text' AND json_valid(child.value))
  SELECT 1 FROM docs d, json_tree(d.doc) j JOIN "RetiredPlayer" p ON p."playerId"=j."value" OR p."playerId"=j."key") ELSE EXISTS (SELECT 1 FROM "RetiredPlayer") END)
BEGIN SELECT RAISE(ABORT,'PLAYER_RETIRED'); END;
CREATE TRIGGER "QueuedMatch_no_retired_reference_update" BEFORE UPDATE OF "team1User1Id", "team1User2Id", "team2User1Id", "team2User2Id", "matchmakingReasonJson" ON "QueuedMatch"
WHEN EXISTS (SELECT 1 FROM "RetiredPlayer" p WHERE p."playerId"=NEW."team1User1Id" OR p."playerId"=NEW."team1User2Id" OR p."playerId"=NEW."team2User1Id" OR p."playerId"=NEW."team2User2Id")
 OR (NEW."matchmakingReasonJson" IS NOT NULL AND CASE WHEN json_valid(NEW."matchmakingReasonJson") THEN EXISTS (
  WITH RECURSIVE docs(doc) AS (SELECT NEW."matchmakingReasonJson" UNION SELECT child.value FROM docs d, json_tree(d.doc) child WHERE child.type='text' AND json_valid(child.value))
  SELECT 1 FROM docs d, json_tree(d.doc) j JOIN "RetiredPlayer" p ON p."playerId"=j."value" OR p."playerId"=j."key") ELSE EXISTS (SELECT 1 FROM "RetiredPlayer") END)
BEGIN SELECT RAISE(ABORT,'PLAYER_RETIRED'); END;
CREATE TRIGGER "SessionCommunity_no_retired_reference_insert" BEFORE INSERT ON "SessionCommunity" WHEN EXISTS (SELECT 1 FROM "RetiredPlayer" p WHERE p."playerId"=NEW."creditedHostPlayerId")
BEGIN SELECT RAISE(ABORT,'PLAYER_RETIRED'); END;
CREATE TRIGGER "SessionCommunity_no_retired_reference_update" BEFORE UPDATE OF "creditedHostPlayerId" ON "SessionCommunity" WHEN EXISTS (SELECT 1 FROM "RetiredPlayer" p WHERE p."playerId"=NEW."creditedHostPlayerId")
BEGIN SELECT RAISE(ABORT,'PLAYER_RETIRED'); END;
CREATE TRIGGER "MatchEloAdjustment_no_retired_reference_insert" BEFORE INSERT ON "MatchEloAdjustment" WHEN EXISTS (SELECT 1 FROM "RetiredPlayer" p WHERE p."playerId"=NEW."userId")
BEGIN SELECT RAISE(ABORT,'PLAYER_RETIRED'); END;
CREATE TRIGGER "MatchEloAdjustment_no_retired_reference_update" BEFORE UPDATE OF "userId" ON "MatchEloAdjustment" WHEN EXISTS (SELECT 1 FROM "RetiredPlayer" p WHERE p."playerId"=NEW."userId")
BEGIN SELECT RAISE(ABORT,'PLAYER_RETIRED'); END;
CREATE TRIGGER "OfflineIdentityMember_no_retired_reference_insert" BEFORE INSERT ON "OfflineIdentityMember" WHEN EXISTS (SELECT 1 FROM "RetiredPlayer" p WHERE p."playerId"=NEW."userId")
BEGIN SELECT RAISE(ABORT,'PLAYER_RETIRED'); END;
CREATE TRIGGER "OfflineIdentityMember_no_retired_reference_update" BEFORE UPDATE OF "userId" ON "OfflineIdentityMember" WHEN EXISTS (SELECT 1 FROM "RetiredPlayer" p WHERE p."playerId"=NEW."userId")
BEGIN SELECT RAISE(ABORT,'PLAYER_RETIRED'); END;
CREATE TRIGGER "OfflineIdentityLinkRequest_no_retired_reference_insert" BEFORE INSERT ON "OfflineIdentityLinkRequest" WHEN EXISTS (SELECT 1 FROM "RetiredPlayer" p WHERE p."playerId"=NEW."sourceUserId" OR p."playerId"=NEW."targetUserId")
BEGIN SELECT RAISE(ABORT,'PLAYER_RETIRED'); END;
CREATE TRIGGER "OfflineIdentityLinkRequest_no_retired_reference_update" BEFORE UPDATE OF "sourceUserId", "targetUserId" ON "OfflineIdentityLinkRequest" WHEN EXISTS (SELECT 1 FROM "RetiredPlayer" p WHERE p."playerId"=NEW."sourceUserId" OR p."playerId"=NEW."targetUserId")
BEGIN SELECT RAISE(ABORT,'PLAYER_RETIRED'); END;
CREATE TRIGGER "ClubNotification_no_retired_reference_insert" BEFORE INSERT ON "ClubNotification" WHEN EXISTS (SELECT 1 FROM "RetiredPlayer" p WHERE p."playerId"=NEW."recipientUserId")
BEGIN SELECT RAISE(ABORT,'PLAYER_RETIRED'); END;
CREATE TRIGGER "ClubNotification_no_retired_reference_update" BEFORE UPDATE OF "recipientUserId" ON "ClubNotification" WHEN EXISTS (SELECT 1 FROM "RetiredPlayer" p WHERE p."playerId"=NEW."recipientUserId")
BEGIN SELECT RAISE(ABORT,'PLAYER_RETIRED'); END;
CREATE TRIGGER "Session_no_retired_reference_insert" BEFORE INSERT ON "Session"
WHEN NEW."achievementEligibilityJson" IS NOT NULL AND CASE WHEN json_valid(NEW."achievementEligibilityJson") THEN EXISTS (
 WITH RECURSIVE docs(doc) AS (SELECT NEW."achievementEligibilityJson" UNION SELECT child.value FROM docs d, json_tree(d.doc) child WHERE child.type='text' AND json_valid(child.value))
 SELECT 1 FROM docs d, json_tree(d.doc) j JOIN "RetiredPlayer" p ON p."playerId"=j."value" OR p."playerId"=j."key") ELSE EXISTS (SELECT 1 FROM "RetiredPlayer") END
BEGIN SELECT RAISE(ABORT,'PLAYER_RETIRED'); END;
CREATE TRIGGER "Session_no_retired_reference_update" BEFORE UPDATE OF "achievementEligibilityJson" ON "Session"
WHEN NEW."achievementEligibilityJson" IS NOT NULL AND CASE WHEN json_valid(NEW."achievementEligibilityJson") THEN EXISTS (
 WITH RECURSIVE docs(doc) AS (SELECT NEW."achievementEligibilityJson" UNION SELECT child.value FROM docs d, json_tree(d.doc) child WHERE child.type='text' AND json_valid(child.value))
 SELECT 1 FROM docs d, json_tree(d.doc) j JOIN "RetiredPlayer" p ON p."playerId"=j."value" OR p."playerId"=j."key") ELSE EXISTS (SELECT 1 FROM "RetiredPlayer") END
BEGIN SELECT RAISE(ABORT,'PLAYER_RETIRED'); END;
CREATE TRIGGER "ClubRatingAdjustment_no_retired_reference_insert" BEFORE INSERT ON "ClubRatingAdjustment" WHEN EXISTS (SELECT 1 FROM "CommunityMember" m WHERE m."id"=NEW."memberId" AND m."retiredByAdmissionEventId" IS NOT NULL)
BEGIN SELECT RAISE(ABORT,'PLAYER_RETIRED'); END;
CREATE TRIGGER "ClubRatingAdjustment_no_retired_reference_update" BEFORE UPDATE ON "ClubRatingAdjustment" WHEN EXISTS (SELECT 1 FROM "CommunityMember" m WHERE m."id"=NEW."memberId" AND m."retiredByAdmissionEventId" IS NOT NULL)
BEGIN SELECT RAISE(ABORT,'PLAYER_RETIRED'); END;
CREATE TRIGGER "ClaimRequest_no_retired_pending_insert" BEFORE INSERT ON "ClaimRequest" WHEN NEW."status"='PENDING' AND EXISTS (SELECT 1 FROM "RetiredPlayer" p WHERE p."playerId"=NEW."targetUserId")
BEGIN SELECT RAISE(ABORT,'PLAYER_RETIRED'); END;
CREATE TRIGGER "ClaimRequest_no_retired_pending_update" BEFORE UPDATE ON "ClaimRequest" WHEN NEW."status"='PENDING' AND EXISTS (SELECT 1 FROM "RetiredPlayer" p WHERE p."playerId"=NEW."targetUserId")
BEGIN SELECT RAISE(ABORT,'PLAYER_RETIRED'); END;
CREATE TRIGGER "ClubJoinRequest_no_retired_reference_insert" BEFORE INSERT ON "ClubJoinRequest" WHEN EXISTS (SELECT 1 FROM "RetiredPlayer" p WHERE p."playerId"=NEW."requestedPlayerId" OR p."playerId"=NEW."approvedPlayerId")
BEGIN SELECT RAISE(ABORT,'PLAYER_RETIRED'); END;
CREATE TRIGGER "ClubJoinRequest_no_retired_reference_update" BEFORE UPDATE ON "ClubJoinRequest"
WHEN (NEW."requestedPlayerId" IS NOT OLD."requestedPlayerId" OR NEW."approvedPlayerId" IS NOT OLD."approvedPlayerId" OR NEW."status" IS NOT OLD."status")
 AND EXISTS (SELECT 1 FROM "RetiredPlayer" p WHERE p."playerId"=NEW."requestedPlayerId" OR p."playerId"=NEW."approvedPlayerId")
BEGIN SELECT RAISE(ABORT,'PLAYER_RETIRED'); END;
