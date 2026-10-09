-- Purpose-bound, admin-preauthorized identity transitions. The prior recovery
-- migration remains immutable; these columns and guards are forward-only.
ALTER TABLE "ClubAccess" ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ClubAdmissionEvent" ADD COLUMN "authorizedByUserId" TEXT REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PlayerInvitation" ADD COLUMN "purpose" TEXT NOT NULL DEFAULT 'CLAIM' CHECK ("purpose" IN ('CLAIM','CORRECTION','ACCESS_RESTORE'));
ALTER TABLE "PlayerInvitation" ADD COLUMN "targetAccountUserId" TEXT REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PlayerInvitation" ADD COLUMN "sourcePlayerId" TEXT REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PlayerInvitation" ADD COLUMN "sourceMemberId" TEXT REFERENCES "CommunityMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PlayerInvitation" ADD COLUMN "retireSourcePlayerId" TEXT;
ALTER TABLE "PlayerInvitation" ADD COLUMN "authorizedAccessAction" TEXT CHECK ("authorizedAccessAction" IS NULL OR "authorizedAccessAction" IN ('PRESERVE_ACTIVE','GRANT_MEMBER','RESTORE_MEMBER'));
ALTER TABLE "PlayerInvitation" ADD COLUMN "restoreArchivedRoster" INTEGER NOT NULL DEFAULT 0 CHECK ("restoreArchivedRoster" IN (0,1));
ALTER TABLE "PlayerInvitation" ADD COLUMN "authorizationReason" TEXT;
ALTER TABLE "PlayerInvitation" ADD COLUMN "authorizerAccessId" TEXT REFERENCES "ClubAccess"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PlayerInvitation" ADD COLUMN "authorizerAccessRevision" INTEGER;
ALTER TABLE "PlayerInvitation" ADD COLUMN "recipientAccessId" TEXT REFERENCES "ClubAccess"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PlayerInvitation" ADD COLUMN "recipientAccessStatus" TEXT;
ALTER TABLE "PlayerInvitation" ADD COLUMN "recipientAccessRole" TEXT;
ALTER TABLE "PlayerInvitation" ADD COLUMN "recipientAccessRevision" INTEGER;
ALTER TABLE "PlayerInvitationEvent" ADD COLUMN "detailsJson" TEXT NOT NULL DEFAULT '{}';

CREATE INDEX "PlayerInvitation_purpose_status_idx" ON "PlayerInvitation"("purpose","status");
CREATE INDEX "PlayerInvitation_source_status_idx" ON "PlayerInvitation"("sourcePlayerId","status");
CREATE INDEX "PlayerInvitation_targetAccount_status_idx" ON "PlayerInvitation"("targetAccountUserId","status");
CREATE UNIQUE INDEX "PlayerInvitation_active_correction_source"
 ON "PlayerInvitation"("sourcePlayerId") WHERE "purpose"='CORRECTION' AND "status"='ACTIVE' AND "sourcePlayerId" IS NOT NULL;

-- Authorization revisions are monotonic. Application code re-reads after
-- writes because SQLite AFTER-trigger updates may not be reflected by RETURNING.
CREATE TRIGGER "ClubAccess_revision_monotonic" BEFORE UPDATE OF "revision" ON "ClubAccess"
WHEN NEW."revision" < OLD."revision" OR NEW."revision" > OLD."revision" + 1
BEGIN SELECT RAISE(ABORT,'ACCESS_REVISION_INVALID'); END;
CREATE TRIGGER "ClubAccess_revision_advance" AFTER UPDATE OF "role","status" ON "ClubAccess"
WHEN NEW."role" IS NOT OLD."role" OR NEW."status" IS NOT OLD."status"
BEGIN UPDATE "ClubAccess" SET "revision"=OLD."revision"+1 WHERE "id"=NEW."id"; END;
CREATE TRIGGER "ClubAccess_insert_collision_guard" BEFORE INSERT ON "ClubAccess"
WHEN EXISTS (SELECT 1 FROM "ClubAccess" old WHERE old."id"=NEW."id" OR (old."clubId"=NEW."clubId" AND old."userId"=NEW."userId"))
BEGIN SELECT RAISE(ABORT,'ACCESS_IDENTITY_IMMUTABLE'); END;
CREATE TRIGGER "ClubAccess_identity_immutable" BEFORE UPDATE OF "id","clubId","userId" ON "ClubAccess"
WHEN NEW."id" IS NOT OLD."id" OR NEW."clubId" IS NOT OLD."clubId" OR NEW."userId" IS NOT OLD."userId"
BEGIN SELECT RAISE(ABORT,'ACCESS_IDENTITY_IMMUTABLE'); END;

-- Existing rows retain the CLAIM defaults. New-purpose invitations bind exact
-- account, target/source rows, and issuer/recipient access snapshots at issuance.
DROP TRIGGER "PlayerInvitation_target_guard";
CREATE TRIGGER "PlayerInvitation_target_guard" BEFORE INSERT ON "PlayerInvitation"
WHEN NEW."status"!='ACTIVE' OR NOT (
 (NEW."purpose"='CLAIM' AND NEW."targetAccountUserId" IS NULL AND NEW."sourcePlayerId" IS NULL AND NEW."sourceMemberId" IS NULL AND NEW."retireSourcePlayerId" IS NULL
  AND NEW."authorizedAccessAction" IS NULL AND NEW."authorizationReason" IS NULL
  AND NEW."authorizerAccessId" IS NULL AND NEW."authorizerAccessRevision" IS NULL
  AND NEW."recipientAccessId" IS NULL AND NEW."recipientAccessStatus" IS NULL AND NEW."recipientAccessRole" IS NULL AND NEW."recipientAccessRevision" IS NULL
  AND NEW."restoreArchivedRoster"=0
  AND EXISTS (SELECT 1 FROM "CommunityMember" m JOIN "User" p ON p."id"=m."userId" JOIN "Community" c ON c."id"=m."communityId"
   WHERE m."id"=NEW."clubMemberId" AND m."communityId"=NEW."clubId" AND m."userId"=NEW."playerId" AND m."archivedAt" IS NULL
    AND m."retiredByAdmissionEventId" IS NULL AND p."isActive"=1 AND p."ownerUserId" IS NULL AND c."isTutorial"=0))
 OR (NEW."purpose" IN ('CORRECTION','ACCESS_RESTORE')
  AND NEW."targetAccountUserId" IS NOT NULL AND NEW."targetAccountUserId"!=NEW."createdByUserId"
  AND length(trim(coalesce(NEW."authorizationReason",''))) BETWEEN 1 AND 1000
  AND NEW."authorizedAccessAction" IN ('PRESERVE_ACTIVE','GRANT_MEMBER','RESTORE_MEMBER')
  AND NEW."authorizerAccessId" IS NOT NULL AND NEW."authorizerAccessRevision" IS NOT NULL
  AND EXISTS (SELECT 1 FROM "Account" a JOIN "ClubAccess" x ON x."clubId"=NEW."clubId" AND x."userId"=a."id"
   JOIN "Community" c ON c."id"=NEW."clubId"
   WHERE a."id"=NEW."createdByUserId" AND a."isActive"=1 AND x."id"=NEW."authorizerAccessId"
    AND x."revision"=NEW."authorizerAccessRevision" AND x."status"='ACTIVE' AND x."role" IN ('ADMIN','OWNER') AND c."isTutorial"=0)
  AND EXISTS (SELECT 1 FROM "Account" recipient WHERE recipient."id"=NEW."targetAccountUserId" AND recipient."isActive"=1)
  AND ((NEW."recipientAccessStatus"='NONE' AND NEW."recipientAccessId" IS NULL AND NEW."recipientAccessRole" IS NULL AND NEW."recipientAccessRevision" IS NULL
    AND NEW."authorizedAccessAction"='GRANT_MEMBER'
    AND NOT EXISTS (SELECT 1 FROM "ClubAccess" access WHERE access."clubId"=NEW."clubId" AND access."userId"=NEW."targetAccountUserId"))
   OR (NEW."recipientAccessStatus" IN ('ACTIVE','REVOKED') AND NEW."recipientAccessId" IS NOT NULL AND NEW."recipientAccessRole" IS NOT NULL AND NEW."recipientAccessRevision" IS NOT NULL
    AND EXISTS (SELECT 1 FROM "ClubAccess" access WHERE access."clubId"=NEW."clubId" AND access."userId"=NEW."targetAccountUserId"
     AND access."id"=NEW."recipientAccessId" AND access."status"=NEW."recipientAccessStatus" AND access."role"=NEW."recipientAccessRole"
     AND access."revision"=NEW."recipientAccessRevision")
    AND ((NEW."recipientAccessStatus"='REVOKED' AND NEW."authorizedAccessAction"='RESTORE_MEMBER')
     OR (NEW."recipientAccessStatus"='ACTIVE' AND NEW."authorizedAccessAction"='PRESERVE_ACTIVE'))))
  AND EXISTS (SELECT 1 FROM "CommunityMember" target JOIN "User" p ON p."id"=target."userId"
   WHERE target."id"=NEW."clubMemberId" AND target."communityId"=NEW."clubId" AND target."userId"=NEW."playerId"
    AND target."retiredByAdmissionEventId" IS NULL AND p."isActive"=1
    AND (NEW."purpose"!='CORRECTION' OR target."archivedAt" IS NULL)
    AND (NEW."purpose"!='CORRECTION' OR p."ownerUserId" IS NULL))
  AND ((NEW."purpose"='CORRECTION' AND NEW."sourcePlayerId" IS NOT NULL AND NEW."sourceMemberId" IS NOT NULL
    AND NEW."retireSourcePlayerId"=NEW."sourcePlayerId"
    AND NEW."restoreArchivedRoster"=0
    AND NEW."playerId"!=NEW."sourcePlayerId"
    AND EXISTS (SELECT 1 FROM "CommunityMember" source JOIN "User" sp ON sp."id"=source."userId"
     WHERE source."id"=NEW."sourceMemberId" AND source."communityId"=NEW."clubId" AND source."userId"=NEW."sourcePlayerId"
      AND source."retiredByAdmissionEventId" IS NULL AND sp."ownerUserId"=NEW."targetAccountUserId"))
   OR (NEW."purpose"='ACCESS_RESTORE' AND NEW."sourcePlayerId" IS NULL AND NEW."sourceMemberId" IS NULL AND NEW."retireSourcePlayerId" IS NULL
    AND EXISTS (SELECT 1 FROM "User" target WHERE target."id"=NEW."playerId" AND target."ownerUserId"=NEW."targetAccountUserId")
    AND ((NEW."restoreArchivedRoster"=1 AND EXISTS (SELECT 1 FROM "CommunityMember" target WHERE target."id"=NEW."clubMemberId" AND target."archivedAt" IS NOT NULL))
     OR (NEW."restoreArchivedRoster"=0 AND EXISTS (SELECT 1 FROM "CommunityMember" target WHERE target."id"=NEW."clubMemberId" AND target."archivedAt" IS NULL)))))
 )
)
BEGIN SELECT RAISE(ABORT,'INVITATION_TARGET_INVALID'); END;

DROP TRIGGER "PlayerInvitation_binding_immutable";
CREATE TRIGGER "PlayerInvitation_binding_immutable" BEFORE UPDATE ON "PlayerInvitation"
WHEN NEW."id" IS NOT OLD."id" OR NEW."clubId" IS NOT OLD."clubId" OR NEW."playerId" IS NOT OLD."playerId"
 OR NEW."clubMemberId" IS NOT OLD."clubMemberId" OR NEW."createdByUserId" IS NOT OLD."createdByUserId"
 OR NEW."purpose" IS NOT OLD."purpose" OR NEW."targetAccountUserId" IS NOT OLD."targetAccountUserId"
 OR NEW."sourcePlayerId" IS NOT OLD."sourcePlayerId" OR NEW."sourceMemberId" IS NOT OLD."sourceMemberId"
 OR NEW."retireSourcePlayerId" IS NOT OLD."retireSourcePlayerId"
 OR NEW."authorizedAccessAction" IS NOT OLD."authorizedAccessAction" OR NEW."restoreArchivedRoster" IS NOT OLD."restoreArchivedRoster"
 OR NEW."authorizationReason" IS NOT OLD."authorizationReason" OR NEW."authorizerAccessId" IS NOT OLD."authorizerAccessId"
 OR NEW."authorizerAccessRevision" IS NOT OLD."authorizerAccessRevision" OR NEW."recipientAccessId" IS NOT OLD."recipientAccessId"
 OR NEW."recipientAccessStatus" IS NOT OLD."recipientAccessStatus" OR NEW."recipientAccessRole" IS NOT OLD."recipientAccessRole"
 OR NEW."recipientAccessRevision" IS NOT OLD."recipientAccessRevision" OR NEW."tokenHash" IS NOT OLD."tokenHash"
 OR NEW."expiresAt" IS NOT OLD."expiresAt" OR NEW."createdAt" IS NOT OLD."createdAt"
BEGIN SELECT RAISE(ABORT,'INVITATION_BINDING_IMMUTABLE'); END;

CREATE TRIGGER "PlayerInvitation_insert_collision_guard" BEFORE INSERT ON "PlayerInvitation"
WHEN EXISTS (SELECT 1 FROM "PlayerInvitation" old WHERE old."id"=NEW."id" OR old."tokenHash"=NEW."tokenHash"
 OR (old."status"='ACTIVE' AND NEW."status"='ACTIVE' AND old."clubId"=NEW."clubId" AND old."playerId"=NEW."playerId"))
BEGIN SELECT RAISE(ABORT,'INVITATION_BINDING_IMMUTABLE'); END;

-- Record the immutable authorization separately from the recipient's later
-- execution event. No bearer secret or continuation material enters the audit.
CREATE TRIGGER "PlayerInvitation_authorization_issue_event" AFTER INSERT ON "PlayerInvitation"
WHEN NEW."purpose" IN ('CORRECTION','ACCESS_RESTORE')
BEGIN INSERT INTO "PlayerInvitationEvent"("id","invitationId","actorUserId","action","reason","detailsJson")
 VALUES(lower(hex(randomblob(16))),NEW."id",NEW."createdByUserId",
  CASE WHEN NEW."purpose"='CORRECTION' THEN 'CORRECTION_RETIRE_AUTHORIZED' ELSE 'ACCESS_RESTORE_AUTHORIZED' END,
  NEW."authorizationReason",json_object('purpose',NEW."purpose",'targetPlayerId',NEW."playerId",
   'targetAccountId',NEW."targetAccountUserId",'sourcePlayerId',NEW."sourcePlayerId",'sourceMemberId',NEW."sourceMemberId",
   'retireSourcePlayerId',NEW."retireSourcePlayerId",'authorizedAccessAction',NEW."authorizedAccessAction",
   'restoreArchivedRoster',NEW."restoreArchivedRoster",'reason',NEW."authorizationReason",
   'authorizerAccessId',NEW."authorizerAccessId",'authorizerAccessRevision',NEW."authorizerAccessRevision",
   'recipientAccessId',NEW."recipientAccessId",'recipientAccessStatus',NEW."recipientAccessStatus",
   'recipientAccessRole',NEW."recipientAccessRole",'recipientAccessRevision',NEW."recipientAccessRevision")); END;

-- The automatic CREATED event and the purpose-specific authorization record
-- are both append-only. REPLACE must not erase either event through a unique
-- key collision.
DROP TRIGGER "PlayerInvitationEvent_insert_collision_guard";
CREATE TRIGGER "PlayerInvitationEvent_insert_collision_guard" BEFORE INSERT ON "PlayerInvitationEvent"
WHEN EXISTS (SELECT 1 FROM "PlayerInvitationEvent" old WHERE old."id"=NEW."id"
 OR (old."invitationId"=NEW."invitationId" AND old."action"=NEW."action"
  AND NEW."action" IN ('CREATED','CORRECTION_RETIRE_AUTHORIZED','ACCESS_RESTORE_AUTHORIZED')))
BEGIN SELECT RAISE(ABORT,'INVITATION_EVENT_IMMUTABLE'); END;

-- A pending authorized invitation is a retirement reference to the source.
-- The service consumes it before marking the source, inside the same transaction.
CREATE TRIGGER "PlayerInvitation_no_retired_source_insert" BEFORE INSERT ON "PlayerInvitation"
WHEN NEW."sourcePlayerId" IS NOT NULL AND EXISTS (SELECT 1 FROM "RetiredPlayer" p WHERE p."playerId"=NEW."sourcePlayerId")
BEGIN SELECT RAISE(ABORT,'PLAYER_RETIRED'); END;
CREATE TRIGGER "PlayerInvitation_no_retired_source_update" BEFORE UPDATE OF "sourcePlayerId" ON "PlayerInvitation"
WHEN NEW."sourcePlayerId" IS NOT OLD."sourcePlayerId" AND EXISTS (SELECT 1 FROM "RetiredPlayer" p WHERE p."playerId"=NEW."sourcePlayerId")
BEGIN SELECT RAISE(ABORT,'PLAYER_RETIRED'); END;

-- Fail closed for active source bindings in the same inventory used by the
-- service. Keep all predecessor blocker rows unchanged.
DROP VIEW "PlayerRetirementBlocker";
CREATE VIEW "PlayerRetirementBlocker" AS
SELECT p."id" AS "playerId", 'CLUB_RELATIONSHIPS' AS "reason" FROM "User" p WHERE (SELECT count(*) FROM "CommunityMember" m WHERE m."userId"=p."id") != 1
UNION ALL SELECT p."id", 'ROSTER_NOT_ARCHIVED' FROM "User" p WHERE EXISTS (SELECT 1 FROM "CommunityMember" m WHERE m."userId"=p."id" AND (m."archivedAt" IS NULL OR m."retiredByAdmissionEventId" IS NOT NULL))
UNION ALL SELECT p."id", 'RATING_DATA' FROM "User" p WHERE p."elo" != 1000 OR EXISTS (SELECT 1 FROM "CommunityMember" m WHERE m."userId"=p."id" AND m."elo" != 1000) OR EXISTS (SELECT 1 FROM "MatchEloAdjustment" a WHERE a."userId"=p."id") OR EXISTS (SELECT 1 FROM "ClubRatingAdjustment" a JOIN "CommunityMember" m ON m."id"=a."memberId" WHERE m."userId"=p."id")
UNION ALL SELECT p."id", 'ACHIEVEMENT_PREFERENCES' FROM "User" p WHERE EXISTS (SELECT 1 FROM "CommunityMember" m WHERE m."userId"=p."id" AND CASE WHEN json_valid(m."achievementPreferencesJson") THEN json_type(m."achievementPreferencesJson") != 'object' OR EXISTS (SELECT 1 FROM json_each(m."achievementPreferencesJson")) ELSE 1 END)
UNION ALL SELECT p."id", 'SESSION_PARTICIPATION' FROM "User" p WHERE EXISTS (SELECT 1 FROM "SessionPlayer" s WHERE s."userId"=p."id" OR s."lastPartnerId"=p."id")
UNION ALL SELECT p."id", 'MATCH_HISTORY' FROM "User" p WHERE EXISTS (SELECT 1 FROM "Match" m WHERE m."team1User1Id"=p."id" OR m."team1User2Id"=p."id" OR m."team2User1Id"=p."id" OR m."team2User2Id"=p."id" OR m."scoreSubmittedByPlayerId"=p."id")
UNION ALL SELECT p."id", 'QUEUED_MATCH' FROM "User" p WHERE EXISTS (SELECT 1 FROM "QueuedMatch" m WHERE m."team1User1Id"=p."id" OR m."team1User2Id"=p."id" OR m."team2User1Id"=p."id" OR m."team2User2Id"=p."id")
UNION ALL SELECT p."id", 'HOSTING_CREDIT' FROM "User" p WHERE EXISTS (SELECT 1 FROM "SessionCommunity" s WHERE s."creditedHostPlayerId"=p."id")
UNION ALL SELECT p."id", 'OFFLINE_IDENTITY' FROM "User" p WHERE EXISTS (SELECT 1 FROM "OfflineIdentityMember" m WHERE m."userId"=p."id") OR EXISTS (SELECT 1 FROM "OfflineIdentityLinkRequest" r WHERE r."sourceUserId"=p."id" OR r."targetUserId"=p."id")
UNION ALL SELECT p."id", 'NOTIFICATIONS' FROM "User" p WHERE EXISTS (SELECT 1 FROM "ClubNotification" n WHERE n."recipientUserId"=p."id")
UNION ALL SELECT p."id", 'UNRESOLVED_REQUEST' FROM "User" p WHERE EXISTS (SELECT 1 FROM "ClaimRequest" r WHERE r."targetUserId"=p."id" AND r."status"='PENDING') OR EXISTS (SELECT 1 FROM "ClubJoinRequest" r WHERE (r."requestedPlayerId"=p."id" OR r."approvedPlayerId"=p."id") AND r."status"='PENDING') OR EXISTS (SELECT 1 FROM "PlayerInvitation" i WHERE i."playerId"=p."id" AND i."status"='ACTIVE'
 AND CASE WHEN typeof(i."expiresAt") IN ('integer','real') THEN CAST(i."expiresAt" AS REAL) > round((julianday('now')-2440587.5)*86400000)
  WHEN julianday(i."expiresAt") IS NOT NULL THEN round((julianday(i."expiresAt")-2440587.5)*86400000) > round((julianday('now')-2440587.5)*86400000) ELSE 1 END)
UNION ALL SELECT p."id", 'MATCH_METADATA' FROM "User" p WHERE EXISTS (SELECT 1 FROM "Match" s WHERE s."matchmakingReasonJson" IS NOT NULL AND CASE WHEN json_valid(s."matchmakingReasonJson") THEN EXISTS (WITH RECURSIVE docs(doc) AS (SELECT s."matchmakingReasonJson" UNION SELECT child.value FROM docs d,json_tree(d.doc) child WHERE child.type='text' AND json_valid(child.value)) SELECT 1 FROM docs d,json_tree(d.doc) j WHERE j."value"=p."id" OR j."key"=p."id") ELSE 1 END)
UNION ALL SELECT p."id", 'QUEUE_METADATA' FROM "User" p WHERE EXISTS (SELECT 1 FROM "QueuedMatch" s WHERE s."matchmakingReasonJson" IS NOT NULL AND CASE WHEN json_valid(s."matchmakingReasonJson") THEN EXISTS (WITH RECURSIVE docs(doc) AS (SELECT s."matchmakingReasonJson" UNION SELECT child.value FROM docs d,json_tree(d.doc) child WHERE child.type='text' AND json_valid(child.value)) SELECT 1 FROM docs d,json_tree(d.doc) j WHERE j."value"=p."id" OR j."key"=p."id") ELSE 1 END)
UNION ALL SELECT p."id", 'UNSNAPSHOTTED_ACHIEVEMENTS' FROM "User" p WHERE EXISTS (SELECT 1 FROM "CommunityMember" m JOIN "Session" s ON s."communityId"=m."communityId" OR EXISTS (SELECT 1 FROM "SessionCommunity" sc WHERE sc."sessionId"=s."id" AND sc."communityId"=m."communityId" AND sc."status"='ACCEPTED') WHERE m."userId"=p."id" AND s."status"='COMPLETED' AND s."isTest"=0 AND ((typeof(m."createdAt") NOT IN ('integer','real') AND julianday(m."createdAt") IS NULL) OR (typeof(coalesce(s."endedAt",s."createdAt")) NOT IN ('integer','real') AND julianday(coalesce(s."endedAt",s."createdAt")) IS NULL) OR ((CASE WHEN typeof(m."createdAt") IN ('integer','real') THEN m."createdAt" ELSE round((julianday(m."createdAt")-2440587.5)*86400000) END) <= (CASE WHEN typeof(coalesce(s."endedAt",s."createdAt")) IN ('integer','real') THEN coalesce(s."endedAt",s."createdAt") ELSE round((julianday(coalesce(s."endedAt",s."createdAt"))-2440587.5)*86400000) END) AND NOT EXISTS (SELECT 1 FROM json_each(CASE WHEN json_valid(s."achievementEligibilityJson") THEN s."achievementEligibilityJson" ELSE '{}' END) j WHERE j."key"=m."communityId" AND j."type"='array'))))
UNION ALL SELECT p."id", 'ACHIEVEMENT_ELIGIBILITY' FROM "User" p WHERE EXISTS (SELECT 1 FROM "Session" s WHERE s."achievementEligibilityJson" IS NOT NULL AND CASE WHEN json_valid(s."achievementEligibilityJson") THEN EXISTS (WITH RECURSIVE docs(doc) AS (SELECT s."achievementEligibilityJson" UNION SELECT child.value FROM docs d,json_tree(d.doc) child WHERE child.type='text' AND json_valid(child.value)) SELECT 1 FROM docs d,json_tree(d.doc) j WHERE j."value"=p."id" OR j."key"=p."id") ELSE 1 END);
CREATE VIEW "PlayerRetirementSourceInvitation" AS SELECT "id" AS "invitationId","sourcePlayerId" AS "playerId" FROM "PlayerInvitation" WHERE "purpose"='CORRECTION' AND "status"='ACTIVE' AND "sourcePlayerId" IS NOT NULL
 AND CASE WHEN typeof("expiresAt") IN ('integer','real') THEN CAST("expiresAt" AS REAL) > round((julianday('now')-2440587.5)*86400000)
  WHEN julianday("expiresAt") IS NOT NULL THEN round((julianday("expiresAt")-2440587.5)*86400000) > round((julianday('now')-2440587.5)*86400000) ELSE 1 END;

DROP TRIGGER "Recovery_request_insert_guard";
CREATE TRIGGER "Recovery_request_insert_guard" BEFORE INSERT ON "ClubJoinRequest"
WHEN NEW."originInvitationId" IS NOT NULL AND (
 NEW."kind"!='EXISTING_PLAYER' OR NEW."status"!='PENDING' OR NEW."approvedPlayerId" IS NOT NULL
 OR NOT EXISTS (
  SELECT 1 FROM "PlayerInvitation" i
  WHERE i."id"=NEW."originInvitationId" AND i."status"='ACTIVE'
   AND i."clubId"=NEW."clubId" AND i."playerId"=NEW."requestedPlayerId"
   AND (CASE WHEN typeof(i."expiresAt") IN ('integer','real') THEN i."expiresAt" ELSE round((julianday(i."expiresAt")-2440587.5)*86400000) END) > round((julianday('now')-2440587.5)*86400000)
   AND (
    (i."purpose"='CLAIM' AND EXISTS (SELECT 1 FROM "RecoverablePlayerInvitation" valid JOIN "Account" recipient ON recipient."id"=NEW."userId"
     WHERE valid."id"=i."id" AND valid."clubId"=NEW."clubId" AND valid."playerId"=NEW."requestedPlayerId"
      AND valid."createdByUserId"!=NEW."userId" AND recipient."isActive"=1))
    OR
    (i."purpose" IN ('CORRECTION','ACCESS_RESTORE') AND i."targetAccountUserId"=NEW."userId" AND i."createdByUserId"!=NEW."userId"
     AND EXISTS (SELECT 1 FROM "Account" recipient WHERE recipient."id"=NEW."userId" AND recipient."isActive"=1)
     AND EXISTS (SELECT 1 FROM "Account" issuer JOIN "ClubAccess" access ON access."id"=i."authorizerAccessId"
      WHERE issuer."id"=i."createdByUserId" AND issuer."isActive"=1 AND access."clubId"=i."clubId"
       AND access."userId"=issuer."id" AND access."status"='ACTIVE' AND access."role" IN ('ADMIN','OWNER')
       AND access."revision"=i."authorizerAccessRevision")
     AND ((i."recipientAccessStatus"='NONE' AND NOT EXISTS (SELECT 1 FROM "ClubAccess" access WHERE access."clubId"=i."clubId" AND access."userId"=NEW."userId"))
      OR (i."recipientAccessStatus" IN ('ACTIVE','REVOKED') AND EXISTS (SELECT 1 FROM "ClubAccess" access
       WHERE access."id"=i."recipientAccessId" AND access."clubId"=i."clubId" AND access."userId"=NEW."userId"
        AND access."status"=i."recipientAccessStatus" AND access."role"=i."recipientAccessRole" AND access."revision"=i."recipientAccessRevision")))
     AND ((i."purpose"='CORRECTION' AND EXISTS (SELECT 1 FROM "CommunityMember" target JOIN "User" tp ON tp."id"=target."userId"
       JOIN "CommunityMember" source ON source."id"=i."sourceMemberId" JOIN "User" sp ON sp."id"=source."userId"
       WHERE target."id"=i."clubMemberId" AND target."communityId"=i."clubId" AND target."userId"=i."playerId"
        AND target."archivedAt" IS NULL AND target."retiredByAdmissionEventId" IS NULL AND tp."isActive"=1 AND tp."ownerUserId" IS NULL
        AND source."communityId"=i."clubId" AND source."userId"=i."sourcePlayerId" AND source."retiredByAdmissionEventId" IS NULL AND sp."ownerUserId"=NEW."userId"))
      OR (i."purpose"='ACCESS_RESTORE' AND EXISTS (SELECT 1 FROM "CommunityMember" target JOIN "User" tp ON tp."id"=target."userId"
       WHERE target."id"=i."clubMemberId" AND target."communityId"=i."clubId" AND target."userId"=i."playerId"
        AND target."retiredByAdmissionEventId" IS NULL AND tp."isActive"=1 AND tp."ownerUserId"=NEW."userId"
        AND ((i."restoreArchivedRoster"=1 AND target."archivedAt" IS NOT NULL) OR (i."restoreArchivedRoster"=0 AND target."archivedAt" IS NULL)))))
   )
 )
)
)
BEGIN SELECT RAISE(ABORT,'RECOVERY_BINDING_INVALID'); END;

CREATE TRIGGER "Authorized_request_insert_collision_guard" BEFORE INSERT ON "ClubJoinRequest"
WHEN NEW."originInvitationId" IS NOT NULL AND EXISTS (
 SELECT 1 FROM "PlayerInvitation" i JOIN "ClubJoinRequest" old ON old."originInvitationId"=i."id"
 WHERE i."id"=NEW."originInvitationId" AND i."purpose" IN ('CORRECTION','ACCESS_RESTORE'))
BEGIN SELECT RAISE(ABORT,'AUTHORIZED_INVITATION_ALREADY_EXECUTED'); END;

CREATE TRIGGER "Authorized_execution_event_guard" BEFORE INSERT ON "ClubAdmissionEvent"
WHEN NEW."action" IN ('EXECUTE_AUTHORIZED_CORRECTION','EXECUTE_AUTHORIZED_ACCESS_RESTORE') AND NOT EXISTS (
 SELECT 1 FROM "ClubJoinRequest" r JOIN "PlayerInvitation" i ON i."id"=r."originInvitationId"
 JOIN "Account" recipient ON recipient."id"=r."userId" JOIN "Account" issuer ON issuer."id"=i."createdByUserId"
 JOIN "ClubAccess" issuerAccess ON issuerAccess."id"=i."authorizerAccessId"
 WHERE r."id"=NEW."admissionRequestId" AND r."status"='PENDING' AND r."revision"=NEW."revision"
  AND r."kind"='EXISTING_PLAYER' AND r."clubId"=i."clubId" AND r."requestedPlayerId"=i."playerId"
  AND NOT EXISTS (SELECT 1 FROM "ClubJoinRequest" other WHERE other."id"!=r."id" AND other."clubId"=r."clubId" AND other."userId"=r."userId" AND other."status"='PENDING')
  AND i."status"='ACTIVE' AND i."targetAccountUserId"=r."userId" AND i."createdByUserId"!=r."userId"
  AND (CASE WHEN typeof(i."expiresAt") IN ('integer','real') THEN i."expiresAt" ELSE round((julianday(i."expiresAt")-2440587.5)*86400000) END) > round((julianday('now')-2440587.5)*86400000)
  AND recipient."isActive"=1 AND issuer."isActive"=1
  AND issuerAccess."clubId"=i."clubId" AND issuerAccess."userId"=i."createdByUserId"
  AND issuerAccess."status"='ACTIVE' AND issuerAccess."role" IN ('ADMIN','OWNER') AND issuerAccess."revision"=i."authorizerAccessRevision"
  AND NEW."actorUserId"=r."userId" AND NEW."authorizedByUserId"=i."createdByUserId"
  AND EXISTS (SELECT 1 FROM "PlayerInvitationEvent" issued WHERE issued."invitationId"=i."id"
   AND issued."actorUserId"=i."createdByUserId"
   AND issued."action"=CASE WHEN i."purpose"='CORRECTION' THEN 'CORRECTION_RETIRE_AUTHORIZED' ELSE 'ACCESS_RESTORE_AUTHORIZED' END
   AND issued."reason"=i."authorizationReason" AND json_valid(issued."detailsJson")
   AND json_extract(issued."detailsJson",'$.purpose')=i."purpose"
   AND json_extract(issued."detailsJson",'$.targetPlayerId')=i."playerId"
   AND json_extract(issued."detailsJson",'$.targetAccountId')=i."targetAccountUserId"
   AND json_extract(issued."detailsJson",'$.sourcePlayerId') IS i."sourcePlayerId"
   AND json_extract(issued."detailsJson",'$.sourceMemberId') IS i."sourceMemberId"
   AND json_extract(issued."detailsJson",'$.retireSourcePlayerId') IS i."retireSourcePlayerId"
   AND json_extract(issued."detailsJson",'$.authorizedAccessAction')=i."authorizedAccessAction"
   AND json_extract(issued."detailsJson",'$.restoreArchivedRoster')=i."restoreArchivedRoster"
   AND json_extract(issued."detailsJson",'$.reason')=i."authorizationReason"
   AND json_extract(issued."detailsJson",'$.authorizerAccessId')=i."authorizerAccessId"
   AND json_extract(issued."detailsJson",'$.authorizerAccessRevision')=i."authorizerAccessRevision"
   AND json_extract(issued."detailsJson",'$.recipientAccessId') IS i."recipientAccessId"
   AND json_extract(issued."detailsJson",'$.recipientAccessStatus') IS i."recipientAccessStatus"
   AND json_extract(issued."detailsJson",'$.recipientAccessRole') IS i."recipientAccessRole"
   AND json_extract(issued."detailsJson",'$.recipientAccessRevision') IS i."recipientAccessRevision")
  AND (json_type(NEW."detailsJson",'$.supersededRecoveryRequest') IS NULL
   OR json_type(NEW."detailsJson",'$.supersededRecoveryRequest')='null'
   OR EXISTS (SELECT 1 FROM "ClubJoinRequest" oldRequest
     JOIN "PlayerInvitation" oldInvite ON oldInvite."id"=oldRequest."originInvitationId"
     JOIN "ClubAdmissionEvent" cancelEvent ON cancelEvent."admissionRequestId"=oldRequest."id"
     WHERE oldRequest."id"=json_extract(NEW."detailsJson",'$.supersededRecoveryRequest.requestId')
      AND oldRequest."clubId"=i."clubId" AND oldRequest."userId"=r."userId"
      AND oldRequest."kind"='EXISTING_PLAYER' AND oldRequest."requestedPlayerId"=i."playerId"
      AND oldRequest."status"='CANCELLED'
      AND oldRequest."revision"=json_extract(NEW."detailsJson",'$.supersededRecoveryRequest.cancelledRevision')
      AND oldRequest."revision"=json_extract(NEW."detailsJson",'$.supersededRecoveryRequest.previousRevision')+1
      AND oldInvite."id"=json_extract(NEW."detailsJson",'$.supersededRecoveryRequest.originInvitationId')
      AND oldInvite."purpose"='CLAIM' AND oldInvite."status" IN ('REVOKED','EXPIRED')
      AND cancelEvent."id"=json_extract(NEW."detailsJson",'$.supersededRecoveryRequest.cancellationEventId')
      AND cancelEvent."revision"=oldRequest."revision" AND cancelEvent."action"='CANCEL' AND cancelEvent."actorUserId"=r."userId"
      AND json_valid(cancelEvent."detailsJson")
      AND json_extract(cancelEvent."detailsJson",'$.supersededByInvitationId')=i."id"))
  AND json_valid(NEW."detailsJson") AND json_extract(NEW."detailsJson",'$.originInvitationId')=i."id"
  AND json_extract(NEW."detailsJson",'$.targetPlayerId')=i."playerId"
  AND json_extract(NEW."detailsJson",'$.sourcePlayerId') IS i."sourcePlayerId"
  AND json_extract(NEW."detailsJson",'$.sourceMemberId') IS i."sourceMemberId"
  AND (i."purpose"!='CORRECTION' OR (i."retireSourcePlayerId"=i."sourcePlayerId" AND json_extract(NEW."detailsJson",'$.retireSourcePlayerId')=i."retireSourcePlayerId"))
  AND json_extract(NEW."detailsJson",'$.reason')=i."authorizationReason"
  AND json_extract(NEW."detailsJson",'$.authorizedAccessAction')=i."authorizedAccessAction"
  AND json_extract(NEW."detailsJson",'$.restoreArchivedRoster')=i."restoreArchivedRoster"
  AND ((i."recipientAccessStatus"='NONE' AND NOT EXISTS (SELECT 1 FROM "ClubAccess" a WHERE a."clubId"=i."clubId" AND a."userId"=r."userId"))
   OR (i."recipientAccessStatus" IN ('ACTIVE','REVOKED') AND EXISTS (SELECT 1 FROM "ClubAccess" a WHERE a."id"=i."recipientAccessId"
    AND a."clubId"=i."clubId" AND a."userId"=r."userId" AND a."status"=i."recipientAccessStatus"
    AND a."role"=i."recipientAccessRole" AND a."revision"=i."recipientAccessRevision")))
  AND ((i."purpose"='CORRECTION' AND NEW."action"='EXECUTE_AUTHORIZED_CORRECTION' AND EXISTS (
    SELECT 1 FROM "CommunityMember" tm JOIN "User" tp ON tp."id"=tm."userId"
    JOIN "CommunityMember" sm ON sm."id"=i."sourceMemberId" JOIN "User" sp ON sp."id"=sm."userId"
    WHERE tm."id"=i."clubMemberId" AND tm."communityId"=i."clubId" AND tm."userId"=i."playerId"
     AND tm."archivedAt" IS NULL AND tm."retiredByAdmissionEventId" IS NULL AND tp."isActive"=1 AND tp."ownerUserId" IS NULL
     AND sm."communityId"=i."clubId" AND sm."userId"=i."sourcePlayerId" AND sm."retiredByAdmissionEventId" IS NULL
     AND sp."ownerUserId"=r."userId" AND (SELECT count(*) FROM "CommunityMember" allSource WHERE allSource."userId"=sp."id")=1)
    AND NOT EXISTS (SELECT 1 FROM "PlayerRetirementBlocker" b WHERE b."playerId"=i."sourcePlayerId" AND b."reason"!='ROSTER_NOT_ARCHIVED')
    AND NOT EXISTS (SELECT 1 FROM "PlayerRetirementSourceInvitation" si WHERE si."playerId"=i."sourcePlayerId" AND si."invitationId"!=i."id"))
   OR (i."purpose"='ACCESS_RESTORE' AND NEW."action"='EXECUTE_AUTHORIZED_ACCESS_RESTORE' AND EXISTS (
    SELECT 1 FROM "CommunityMember" tm JOIN "User" tp ON tp."id"=tm."userId"
    WHERE tm."id"=i."clubMemberId" AND tm."communityId"=i."clubId" AND tm."userId"=i."playerId"
     AND tm."retiredByAdmissionEventId" IS NULL AND tp."isActive"=1 AND tp."ownerUserId"=r."userId"
     AND ((i."restoreArchivedRoster"=1 AND tm."archivedAt" IS NOT NULL) OR (i."restoreArchivedRoster"=0 AND tm."archivedAt" IS NULL)))))
 )
BEGIN SELECT RAISE(ABORT,'AUTHORIZED_EXECUTION_INVALID'); END;

DROP TRIGGER "PlayerInvitation_state_guard";
CREATE TRIGGER "PlayerInvitation_state_guard" BEFORE UPDATE ON "PlayerInvitation"
WHEN NEW."status" NOT IN ('ACTIVE','EXPIRED','REVOKED','REDEEMED')
 OR (NEW."status"='REDEEMED' AND (NEW."redeemedByUserId" IS NULL OR NEW."redeemedAt" IS NULL OR NOT EXISTS (
  SELECT 1 FROM "Account" recipient
  WHERE recipient."id"=NEW."redeemedByUserId" AND recipient."isActive"=1
   AND ((NEW."purpose"='CLAIM' AND NEW."createdByUserId"!=NEW."redeemedByUserId"
     AND EXISTS (SELECT 1 FROM "Account" issuer JOIN "ClubAccess" access ON access."clubId"=NEW."clubId" AND access."userId"=issuer."id"
      WHERE issuer."id"=NEW."createdByUserId" AND issuer."isActive"=1 AND access."status"='ACTIVE' AND access."role" IN ('ADMIN','OWNER'))
     AND EXISTS (SELECT 1 FROM "CommunityMember" member JOIN "User" target ON target."id"=member."userId"
      WHERE member."id"=NEW."clubMemberId" AND member."communityId"=NEW."clubId" AND member."userId"=NEW."playerId"
       AND member."archivedAt" IS NULL AND member."retiredByAdmissionEventId" IS NULL
       AND target."isActive"=1 AND target."ownerUserId" IS NULL)
     AND (NOT EXISTS (SELECT 1 FROM "ClubAccess" access WHERE access."clubId"=NEW."clubId" AND access."userId"=recipient."id" AND access."status"!='ACTIVE')
      OR EXISTS (SELECT 1 FROM "ClubJoinRequest" request JOIN "ClubAdmissionEvent" approvalEvent ON approvalEvent."admissionRequestId"=request."id"
       JOIN "Account" approver ON approver."id"=approvalEvent."actorUserId"
       JOIN "ClubAccess" approverAccess ON approverAccess."clubId"=request."clubId" AND approverAccess."userId"=approver."id"
       WHERE request."originInvitationId"=NEW."id" AND request."clubId"=NEW."clubId" AND request."userId"=recipient."id"
        AND request."kind"='EXISTING_PLAYER' AND request."requestedPlayerId"=NEW."playerId"
        AND request."status"='PENDING' AND request."revision"=approvalEvent."revision"
        AND approvalEvent."action"='APPROVE_RECOVERY' AND json_valid(approvalEvent."detailsJson")
        AND json_extract(approvalEvent."detailsJson",'$.originInvitationId')=NEW."id"
        AND json_extract(approvalEvent."detailsJson",'$.targetPlayerId')=NEW."playerId"
        AND json_extract(approvalEvent."detailsJson",'$.restoredAccess')=1
        AND json_extract(approvalEvent."detailsJson",'$.confirmRestoreAccess')=1
        AND approvalEvent."actorUserId"!=recipient."id" AND approver."isActive"=1
        AND approverAccess."status"='ACTIVE' AND approverAccess."role" IN ('ADMIN','OWNER'))))
    OR (NEW."purpose" IN ('CORRECTION','ACCESS_RESTORE') AND NEW."targetAccountUserId"=recipient."id"
     AND EXISTS (SELECT 1 FROM "ClubJoinRequest" request JOIN "ClubAdmissionEvent" event ON event."admissionRequestId"=request."id"
      WHERE request."originInvitationId"=NEW."id" AND request."status"='PENDING' AND request."userId"=recipient."id"
       AND request."revision"=event."revision" AND event."action"=CASE WHEN NEW."purpose"='CORRECTION' THEN 'EXECUTE_AUTHORIZED_CORRECTION' ELSE 'EXECUTE_AUTHORIZED_ACCESS_RESTORE' END
       AND event."actorUserId"=recipient."id" AND event."authorizedByUserId"=NEW."createdByUserId")
     AND EXISTS (SELECT 1 FROM "ClubAccess" access JOIN "Account" issuer ON issuer."id"=NEW."createdByUserId"
      WHERE access."id"=NEW."authorizerAccessId" AND access."clubId"=NEW."clubId" AND access."userId"=issuer."id"
       AND access."revision"=NEW."authorizerAccessRevision" AND access."status"='ACTIVE' AND access."role" IN ('ADMIN','OWNER') AND issuer."isActive"=1))))))
BEGIN SELECT RAISE(ABORT,'INVITATION_STATE_INVALID'); END;

DROP TRIGGER "Recovery_final_approval_guard";
CREATE TRIGGER "Recovery_final_approval_guard" BEFORE UPDATE OF "status" ON "ClubJoinRequest"
WHEN NEW."originInvitationId" IS NOT NULL AND NEW."status"='APPROVED' AND NOT EXISTS (
 SELECT 1 FROM "PlayerInvitation" i WHERE i."id"=NEW."originInvitationId" AND NEW."approvedPlayerId"=i."playerId"
  AND i."status"='REDEEMED' AND i."redeemedByUserId"=NEW."userId"
  AND (i."purpose"='CLAIM' OR NOT EXISTS (SELECT 1 FROM "ClubJoinRequest" other WHERE other."id"!=NEW."id" AND other."clubId"=NEW."clubId" AND other."userId"=NEW."userId" AND other."status"='PENDING'))
  AND ((i."purpose"='CLAIM' AND i."targetAccountUserId" IS NULL AND i."sourcePlayerId" IS NULL
    AND EXISTS (SELECT 1 FROM "User" target WHERE target."id"=i."playerId" AND target."ownerUserId"=NEW."userId")
    AND EXISTS (SELECT 1 FROM "ClubAdmissionEvent" event WHERE event."admissionRequestId"=NEW."id" AND event."revision"=NEW."revision"
     AND event."action"='APPROVE_RECOVERY' AND event."actorUserId"=NEW."reviewedById")
    AND NEW."decision"='RECOVER_INVITED_PLAYER'
    AND EXISTS (SELECT 1 FROM "ClubAccess" access WHERE access."clubId"=NEW."clubId" AND access."userId"=NEW."userId" AND access."status"='ACTIVE'
     AND (EXISTS (SELECT 1 FROM "ClubAdmissionEvent" event WHERE event."admissionRequestId"=NEW."id" AND event."revision"=NEW."revision" AND json_extract(event."detailsJson",'$.restoredAccess')=0)
      OR access."role"='MEMBER'))
    AND EXISTS (SELECT 1 FROM "ClubAdmissionEvent" event WHERE event."admissionRequestId"=NEW."id" AND event."revision"=NEW."revision"
     AND (json_extract(event."detailsJson",'$.sourcePlayerId') IS NULL OR EXISTS (SELECT 1 FROM "CommunityMember" source WHERE source."retiredByAdmissionEventId"=event."id" AND source."userId"=json_extract(event."detailsJson",'$.sourcePlayerId')))))
   OR (i."purpose"='CORRECTION' AND NEW."decision"='EXECUTE_AUTHORIZED_CORRECTION'
    AND EXISTS (SELECT 1 FROM "ClubAdmissionEvent" event WHERE event."admissionRequestId"=NEW."id" AND event."revision"=NEW."revision"
     AND event."action"='EXECUTE_AUTHORIZED_CORRECTION' AND event."actorUserId"=NEW."userId" AND event."authorizedByUserId"=i."createdByUserId"
     AND NEW."reviewedById"=i."createdByUserId" AND NEW."reviewedAt" IS NOT NULL
     AND json_valid(event."detailsJson") AND json_extract(event."detailsJson",'$.retireSourcePlayerId')=i."sourcePlayerId"
     AND json_extract(event."detailsJson",'$.originInvitationId')=i."id"
     AND json_extract(event."detailsJson",'$.targetPlayerId')=i."playerId"
     AND json_extract(event."detailsJson",'$.sourcePlayerId')=i."sourcePlayerId"
     AND json_extract(event."detailsJson",'$.sourceMemberId')=i."sourceMemberId"
     AND json_extract(event."detailsJson",'$.authorizedAccessAction')=i."authorizedAccessAction"
     AND json_extract(event."detailsJson",'$.restoreArchivedRoster')=i."restoreArchivedRoster"
     AND json_extract(event."detailsJson",'$.reason')=i."authorizationReason"
     AND EXISTS (SELECT 1 FROM "CommunityMember" source WHERE source."retiredByAdmissionEventId"=event."id" AND source."id"=i."sourceMemberId" AND source."userId"=i."sourcePlayerId"))
    AND EXISTS (SELECT 1 FROM "User" target WHERE target."id"=i."playerId" AND target."ownerUserId"=NEW."userId" AND target."isActive"=1)
    AND EXISTS (SELECT 1 FROM "CommunityMember" member WHERE member."id"=i."clubMemberId" AND member."archivedAt" IS NULL AND member."retiredByAdmissionEventId" IS NULL)
    AND EXISTS (SELECT 1 FROM "ClubAccess" access WHERE access."clubId"=NEW."clubId" AND access."userId"=NEW."userId" AND access."status"='ACTIVE'
     AND ((i."recipientAccessStatus"='ACTIVE' AND access."id"=i."recipientAccessId" AND access."role"=i."recipientAccessRole" AND access."revision"=i."recipientAccessRevision" AND json_extract((SELECT event."detailsJson" FROM "ClubAdmissionEvent" event WHERE event."admissionRequestId"=NEW."id" AND event."revision"=NEW."revision"),'$.accessOutcome')='PRESERVED_ACTIVE')
      OR (i."recipientAccessStatus"='NONE' AND access."role"='MEMBER' AND json_extract((SELECT event."detailsJson" FROM "ClubAdmissionEvent" event WHERE event."admissionRequestId"=NEW."id" AND event."revision"=NEW."revision"),'$.accessOutcome')='GRANTED_MEMBER')
      OR (i."recipientAccessStatus"='REVOKED' AND access."id"=i."recipientAccessId" AND access."role"='MEMBER' AND access."revision"=i."recipientAccessRevision"+1 AND json_extract((SELECT event."detailsJson" FROM "ClubAdmissionEvent" event WHERE event."admissionRequestId"=NEW."id" AND event."revision"=NEW."revision"),'$.accessOutcome')='RESTORED_MEMBER')))
   OR (i."purpose"='ACCESS_RESTORE' AND NEW."decision"='EXECUTE_AUTHORIZED_ACCESS_RESTORE'
    AND EXISTS (SELECT 1 FROM "ClubAdmissionEvent" event WHERE event."admissionRequestId"=NEW."id" AND event."revision"=NEW."revision"
     AND event."action"='EXECUTE_AUTHORIZED_ACCESS_RESTORE' AND event."actorUserId"=NEW."userId" AND event."authorizedByUserId"=i."createdByUserId"
     AND NEW."reviewedById"=i."createdByUserId" AND NEW."reviewedAt" IS NOT NULL
     AND json_valid(event."detailsJson") AND json_extract(event."detailsJson",'$.originInvitationId')=i."id"
     AND json_extract(event."detailsJson",'$.targetPlayerId')=i."playerId"
     AND json_extract(event."detailsJson",'$.authorizedAccessAction')=i."authorizedAccessAction"
     AND json_extract(event."detailsJson",'$.restoreArchivedRoster')=i."restoreArchivedRoster"
     AND json_extract(event."detailsJson",'$.reason')=i."authorizationReason")
    AND EXISTS (SELECT 1 FROM "User" target WHERE target."id"=i."playerId" AND target."ownerUserId"=NEW."userId" AND target."isActive"=1)
    AND EXISTS (SELECT 1 FROM "CommunityMember" member WHERE member."id"=i."clubMemberId" AND member."archivedAt" IS NULL AND member."retiredByAdmissionEventId" IS NULL)
    AND EXISTS (SELECT 1 FROM "ClubAccess" access WHERE access."clubId"=NEW."clubId" AND access."userId"=NEW."userId" AND access."status"='ACTIVE'
     AND ((i."recipientAccessStatus"='ACTIVE' AND access."id"=i."recipientAccessId" AND access."role"=i."recipientAccessRole" AND access."revision"=i."recipientAccessRevision")
      OR (i."recipientAccessStatus"='NONE' AND access."role"='MEMBER')
      OR (i."recipientAccessStatus"='REVOKED' AND access."id"=i."recipientAccessId" AND access."role"='MEMBER' AND access."revision"=i."recipientAccessRevision"+1))))))
)
BEGIN SELECT RAISE(ABORT,'RECOVERY_APPROVAL_INCOMPLETE'); END;

-- A correction receipt retires only the exact bound source roster after the
-- invitation has been consumed in the same transaction. The original claim
-- recovery path remains supported with its existing checks.
DROP TRIGGER "ClubMember_retirement_guard";
CREATE TRIGGER "ClubMember_retirement_guard" BEFORE UPDATE OF "retiredByAdmissionEventId" ON "CommunityMember"
WHEN NEW."retiredByAdmissionEventId" IS NOT OLD."retiredByAdmissionEventId" AND (
 OLD."retiredByAdmissionEventId" IS NOT NULL OR NEW."retiredByAdmissionEventId" IS NULL
 OR NEW."archivedAt" IS NULL OR NEW."ownerUserId" IS NULL
 OR NEW."id" IS NOT OLD."id" OR NEW."communityId" IS NOT OLD."communityId" OR NEW."userId" IS NOT OLD."userId"
 OR NEW."ownerUserId" IS NOT OLD."ownerUserId" OR NEW."role" IS NOT OLD."role" OR NEW."status" IS NOT OLD."status"
 OR NEW."preferredPool" IS NOT OLD."preferredPool" OR NEW."needsMoreRest" IS NOT OLD."needsMoreRest" OR NEW."elo" IS NOT OLD."elo"
 OR NEW."createdAt" IS NOT OLD."createdAt" OR NEW."archivedAt" IS NOT OLD."archivedAt"
 OR NEW."achievementPreferencesJson" IS NOT OLD."achievementPreferencesJson"
 OR EXISTS (SELECT 1 FROM "PlayerRetirementBlocker" b WHERE b."playerId"=OLD."userId" AND b."reason"!='ROSTER_NOT_ARCHIVED')
 OR NOT (
  EXISTS (SELECT 1 FROM "ClubAdmissionEvent" e JOIN "ClubJoinRequest" r ON r."id"=e."admissionRequestId"
   JOIN "RecoverablePlayerInvitation" i ON i."id"=r."originInvitationId" JOIN "User" p ON p."id"=OLD."userId"
   JOIN "ClubAccess" access ON access."clubId"=r."clubId" AND access."userId"=e."actorUserId"
   JOIN "Account" a ON a."id"=e."actorUserId" JOIN "Account" requester ON requester."id"=r."userId"
   WHERE e."id"=NEW."retiredByAdmissionEventId" AND e."action"='APPROVE_RECOVERY' AND e."revision"=r."revision"
    AND r."status"='PENDING' AND r."clubId"=OLD."communityId" AND r."userId"=p."ownerUserId" AND p."isActive"=0
    AND access."status"='ACTIVE' AND access."role" IN ('ADMIN','OWNER') AND a."isActive"=1 AND requester."isActive"=1 AND a."id"!=r."userId"
    AND json_extract(e."detailsJson",'$.sourcePlayerId')=OLD."userId"
    AND json_extract(e."detailsJson",'$.sourceMemberId')=OLD."id"
    AND json_extract(e."detailsJson",'$.targetPlayerId')=r."requestedPlayerId"
    AND length(trim(json_extract(e."detailsJson",'$.reason')))>0)
  OR EXISTS (SELECT 1 FROM "ClubAdmissionEvent" e JOIN "ClubJoinRequest" r ON r."id"=e."admissionRequestId"
   JOIN "PlayerInvitation" i ON i."id"=r."originInvitationId" JOIN "User" sourcePlayer ON sourcePlayer."id"=OLD."userId"
   JOIN "Account" recipient ON recipient."id"=r."userId" JOIN "Account" issuer ON issuer."id"=i."createdByUserId"
   JOIN "ClubAccess" issuerAccess ON issuerAccess."id"=i."authorizerAccessId"
   WHERE e."id"=NEW."retiredByAdmissionEventId" AND e."action"='EXECUTE_AUTHORIZED_CORRECTION'
    AND e."revision"=r."revision" AND e."actorUserId"=r."userId" AND e."authorizedByUserId"=i."createdByUserId"
    AND r."status"='PENDING' AND r."clubId"=OLD."communityId" AND r."userId"=i."targetAccountUserId"
    AND r."requestedPlayerId"=i."playerId" AND r."approvedPlayerId" IS NULL
    AND i."purpose"='CORRECTION' AND i."retireSourcePlayerId"=i."sourcePlayerId"
    AND i."status"='REDEEMED' AND i."redeemedByUserId"=r."userId"
    AND i."sourcePlayerId"=OLD."userId" AND i."sourceMemberId"=OLD."id"
    AND i."createdByUserId"!=r."userId" AND i."targetAccountUserId"=sourcePlayer."ownerUserId"
    AND sourcePlayer."isActive"=0 AND recipient."isActive"=1 AND issuer."isActive"=1
    AND issuerAccess."clubId"=i."clubId" AND issuerAccess."userId"=issuer."id"
    AND issuerAccess."revision"=i."authorizerAccessRevision" AND issuerAccess."status"='ACTIVE' AND issuerAccess."role" IN ('ADMIN','OWNER')
    AND NOT EXISTS (SELECT 1 FROM "PlayerRetirementBlocker" b WHERE b."playerId"=OLD."userId" AND b."reason"!='ROSTER_NOT_ARCHIVED')
    AND NOT EXISTS (SELECT 1 FROM "PlayerRetirementSourceInvitation" si WHERE si."playerId"=OLD."userId")
    AND EXISTS (SELECT 1 FROM "PlayerInvitationEvent" authorized WHERE authorized."invitationId"=i."id"
     AND authorized."actorUserId"=i."createdByUserId" AND authorized."reason"=i."authorizationReason"
     AND authorized."action"='CORRECTION_RETIRE_AUTHORIZED' AND json_valid(authorized."detailsJson")
     AND json_extract(authorized."detailsJson",'$.purpose')=i."purpose"
     AND json_extract(authorized."detailsJson",'$.targetPlayerId')=i."playerId"
     AND json_extract(authorized."detailsJson",'$.targetAccountId')=i."targetAccountUserId"
     AND json_extract(authorized."detailsJson",'$.sourcePlayerId')=i."sourcePlayerId"
     AND json_extract(authorized."detailsJson",'$.sourceMemberId')=i."sourceMemberId"
     AND json_extract(authorized."detailsJson",'$.retireSourcePlayerId')=i."retireSourcePlayerId"
     AND json_extract(authorized."detailsJson",'$.authorizedAccessAction')=i."authorizedAccessAction"
     AND json_extract(authorized."detailsJson",'$.restoreArchivedRoster')=i."restoreArchivedRoster"
     AND json_extract(authorized."detailsJson",'$.reason')=i."authorizationReason"
     AND json_extract(authorized."detailsJson",'$.authorizerAccessId')=i."authorizerAccessId"
     AND json_extract(authorized."detailsJson",'$.authorizerAccessRevision')=i."authorizerAccessRevision"
     AND json_extract(authorized."detailsJson",'$.recipientAccessId') IS i."recipientAccessId"
     AND json_extract(authorized."detailsJson",'$.recipientAccessStatus') IS i."recipientAccessStatus"
     AND json_extract(authorized."detailsJson",'$.recipientAccessRole') IS i."recipientAccessRole"
     AND json_extract(authorized."detailsJson",'$.recipientAccessRevision') IS i."recipientAccessRevision")
    AND EXISTS (SELECT 1 FROM "ClubAdmissionEvent" issued WHERE issued."admissionRequestId"=r."id" AND issued."revision"=r."revision"
     AND issued."action"='EXECUTE_AUTHORIZED_CORRECTION' AND issued."actorUserId"=r."userId"
     AND issued."authorizedByUserId"=i."createdByUserId" AND json_valid(issued."detailsJson")
     AND json_extract(issued."detailsJson",'$.originInvitationId')=i."id"
     AND json_extract(issued."detailsJson",'$.targetPlayerId')=i."playerId"
     AND json_extract(issued."detailsJson",'$.sourcePlayerId')=i."sourcePlayerId"
     AND json_extract(issued."detailsJson",'$.sourceMemberId')=i."sourceMemberId"
     AND json_extract(issued."detailsJson",'$.retireSourcePlayerId')=i."retireSourcePlayerId"
     AND json_extract(issued."detailsJson",'$.reason')=i."authorizationReason"
     AND json_extract(issued."detailsJson",'$.authorizedAccessAction')=i."authorizedAccessAction"
     AND json_extract(issued."detailsJson",'$.restoreArchivedRoster')=i."restoreArchivedRoster"))
 ))
BEGIN SELECT RAISE(ABORT,'PLAYER_RETIREMENT_INVALID'); END;

-- During the exact authorized correction execution, deactivation may change
-- only the source Player's lifecycle flag. Rating, identity, and provenance
-- fields remain intact; the permanent retirement guard applies after marking.
CREATE TRIGGER "Correction_source_deactivation_guard" BEFORE UPDATE OF "isActive" ON "User"
WHEN NEW."isActive" IS NOT OLD."isActive"
 AND EXISTS (SELECT 1 FROM "PlayerInvitation" i JOIN "ClubJoinRequest" r ON r."originInvitationId"=i."id"
  JOIN "ClubAdmissionEvent" e ON e."admissionRequestId"=r."id"
  WHERE i."purpose"='CORRECTION' AND i."sourcePlayerId"=OLD."id" AND i."status"='REDEEMED'
   AND i."redeemedByUserId"=r."userId" AND i."targetAccountUserId"=r."userId"
   AND r."status"='PENDING' AND r."revision"=e."revision"
   AND e."action"='EXECUTE_AUTHORIZED_CORRECTION' AND e."actorUserId"=r."userId"
   AND e."authorizedByUserId"=i."createdByUserId" AND json_valid(e."detailsJson")
   AND json_extract(e."detailsJson",'$.originInvitationId')=i."id"
   AND json_extract(e."detailsJson",'$.sourcePlayerId')=OLD."id"
   AND json_extract(e."detailsJson",'$.sourceMemberId')=i."sourceMemberId")
 AND (NEW."isActive" IS NOT 0
  OR NEW."id" IS NOT OLD."id" OR NEW."ownerUserId" IS NOT OLD."ownerUserId"
  OR NEW."email" IS NOT OLD."email" OR NEW."passwordHash" IS NOT OLD."passwordHash"
  OR NEW."name" IS NOT OLD."name" OR NEW."avatarKey" IS NOT OLD."avatarKey"
  OR NEW."selfNameChangedAt" IS NOT OLD."selfNameChangedAt" OR NEW."selfGenderChangedAt" IS NOT OLD."selfGenderChangedAt"
  OR NEW."isClaimed" IS NOT OLD."isClaimed" OR NEW."gender" IS NOT OLD."gender"
  OR NEW."partnerPreference" IS NOT OLD."partnerPreference" OR NEW."mixedSideOverride" IS NOT OLD."mixedSideOverride"
  OR NEW."elo" IS NOT OLD."elo" OR NEW."createdAt" IS NOT OLD."createdAt" OR NEW."updatedAt" IS NOT OLD."updatedAt")
BEGIN SELECT RAISE(ABORT,'PLAYER_RETIREMENT_INVALID'); END;

-- Access restoration may re-enable an existing membership only when the
-- recipient has one nonretired Player identity. Repeated memberships for the
-- exact same Player are allowed; retired duplicates are excluded permanently.
CREATE TRIGGER "PlayerInvitation_access_restore_identity_guard" BEFORE INSERT ON "PlayerInvitation"
WHEN NEW."purpose"='ACCESS_RESTORE' AND EXISTS (
 SELECT 1 FROM "User" other
 WHERE other."ownerUserId"=NEW."targetAccountUserId" AND other."id"!=NEW."playerId"
  AND NOT EXISTS (SELECT 1 FROM "RetiredPlayer" retired WHERE retired."playerId"=other."id"))
BEGIN SELECT RAISE(ABORT,'IDENTITY_CONFLICT'); END;

CREATE TRIGGER "Authorized_access_restore_identity_guard" BEFORE INSERT ON "ClubAdmissionEvent"
WHEN NEW."action"='EXECUTE_AUTHORIZED_ACCESS_RESTORE' AND EXISTS (
 SELECT 1 FROM "ClubJoinRequest" request JOIN "PlayerInvitation" invite ON invite."id"=request."originInvitationId"
 WHERE request."id"=NEW."admissionRequestId" AND invite."purpose"='ACCESS_RESTORE'
  AND EXISTS (SELECT 1 FROM "User" other
   WHERE other."ownerUserId"=request."userId" AND other."id"!=invite."playerId"
    AND NOT EXISTS (SELECT 1 FROM "RetiredPlayer" retired WHERE retired."playerId"=other."id")))
BEGIN SELECT RAISE(ABORT,'IDENTITY_CONFLICT'); END;

CREATE TRIGGER "ClubJoinRequest_access_restore_identity_guard" BEFORE UPDATE OF "status" ON "ClubJoinRequest"
WHEN NEW."status"='APPROVED' AND EXISTS (
 SELECT 1 FROM "PlayerInvitation" invite
 WHERE invite."id"=NEW."originInvitationId" AND invite."purpose"='ACCESS_RESTORE'
  AND EXISTS (SELECT 1 FROM "User" other
   WHERE other."ownerUserId"=NEW."userId" AND other."id"!=invite."playerId"
    AND NOT EXISTS (SELECT 1 FROM "RetiredPlayer" retired WHERE retired."playerId"=other."id")))
BEGIN SELECT RAISE(ABORT,'IDENTITY_CONFLICT'); END;
