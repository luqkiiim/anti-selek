-- Ownership release keeps the Player and every sporting/audit reference.
-- This is an additive, separately approved migration; builds never apply it.
CREATE TABLE "PlayerOwnershipRelease" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "clubId" TEXT NOT NULL REFERENCES "Community"("id") ON DELETE RESTRICT,
 "playerId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
 "previousOwnerUserId" TEXT NOT NULL REFERENCES "Account"("id") ON DELETE RESTRICT,
 "actorUserId" TEXT NOT NULL REFERENCES "Account"("id") ON DELETE RESTRICT,
 "accessId" TEXT NOT NULL REFERENCES "ClubAccess"("id") ON DELETE RESTRICT,
 "accessRevision" INTEGER NOT NULL,
 "membershipsJson" TEXT NOT NULL,
 "reason" TEXT NOT NULL,
 "createdAt" DATETIME NOT NULL,
 "appliedAt" DATETIME
);
CREATE UNIQUE INDEX "PlayerOwnershipRelease_pending_player" ON "PlayerOwnershipRelease"("playerId") WHERE "appliedAt" IS NULL;
CREATE TABLE "PlayerOwnershipReleaseClaim" (
 "releaseId" TEXT NOT NULL PRIMARY KEY REFERENCES "PlayerOwnershipRelease"("id") ON DELETE RESTRICT,
 "invitationId" TEXT NOT NULL UNIQUE REFERENCES "PlayerInvitation"("id") ON DELETE RESTRICT,
 "actorUserId" TEXT NOT NULL REFERENCES "Account"("id") ON DELETE RESTRICT,
 "createdAt" DATETIME NOT NULL
);
CREATE TRIGGER "PlayerOwnershipRelease_insert_guard" BEFORE INSERT ON "PlayerOwnershipRelease"
WHEN NEW."appliedAt" IS NOT NULL OR length(trim(NEW."reason"))=0
 OR EXISTS (SELECT 1 FROM "PlayerOwnershipRelease" old WHERE old."id"=NEW."id")
 OR NOT EXISTS (SELECT 1 FROM "Account" a WHERE a."id"=NEW."actorUserId" AND a."isActive"=1)
 OR NEW."actorUserId"=NEW."previousOwnerUserId"
 OR NOT EXISTS (SELECT 1 FROM "User" p WHERE p."id"=NEW."playerId" AND p."ownerUserId"=NEW."previousOwnerUserId")
 OR NOT EXISTS (SELECT 1 FROM "CommunityMember" m WHERE m."communityId"=NEW."clubId" AND m."userId"=NEW."playerId" AND m."archivedAt" IS NOT NULL AND m."retiredByAdmissionEventId" IS NULL)
 OR NOT EXISTS (SELECT 1 FROM "ClubAccess" a WHERE a."id"=NEW."accessId" AND a."clubId"=NEW."clubId" AND a."userId"=NEW."previousOwnerUserId" AND a."status"='REVOKED' AND a."revision"=NEW."accessRevision")
 OR EXISTS (SELECT 1 FROM "CommunityMember" m JOIN "Community" c ON c."id"=m."communityId" WHERE m."userId"=NEW."playerId" AND (
   m."archivedAt" IS NULL OR m."retiredByAdmissionEventId" IS NOT NULL OR c."isTutorial"=1 OR c."createdById"=NEW."previousOwnerUserId"
   OR NOT EXISTS (SELECT 1 FROM "ClubAccess" a WHERE a."clubId"=m."communityId" AND a."userId"=NEW."actorUserId" AND a."status"='ACTIVE' AND a."role" IN ('ADMIN','OWNER'))
   OR EXISTS (SELECT 1 FROM "ClubAccess" a WHERE a."clubId"=m."communityId" AND a."userId"=NEW."previousOwnerUserId" AND a."status"='ACTIVE')))
 OR EXISTS (SELECT 1 FROM "SessionPlayer" sp JOIN "Session" s ON s."id"=sp."sessionId" WHERE sp."userId"=NEW."playerId" AND s."status" IN ('WAITING','ACTIVE'))
 OR EXISTS (SELECT 1 FROM "ClubJoinRequest" r WHERE r."userId"=NEW."previousOwnerUserId" AND r."status"='PENDING')
 OR EXISTS (SELECT 1 FROM "ClaimRequest" r WHERE r."targetUserId"=NEW."playerId" AND r."status"='PENDING')
 OR EXISTS (SELECT 1 FROM "PlayerInvitation" i WHERE i."status"='ACTIVE' AND (i."playerId"=NEW."playerId" OR i."sourcePlayerId"=NEW."playerId" OR i."targetAccountUserId"=NEW."previousOwnerUserId"))
 OR CASE WHEN json_valid(NEW."membershipsJson") THEN json_type(NEW."membershipsJson")!='array'
   OR json_array_length(NEW."membershipsJson")!=(SELECT count(*) FROM "CommunityMember" m WHERE m."userId"=NEW."playerId")
   OR EXISTS (SELECT 1 FROM "CommunityMember" m WHERE m."userId"=NEW."playerId" AND NOT EXISTS (
     SELECT 1 FROM json_each(NEW."membershipsJson") j WHERE json_extract(j.value,'$.memberId')=m."id"
      AND json_extract(j.value,'$.clubId')=m."communityId" AND json_extract(j.value,'$.archivedAt') IS m."archivedAt"))
   ELSE 1 END
BEGIN SELECT RAISE(ABORT,'PLAYER_RELEASE_INVALID'); END;
CREATE TRIGGER "PlayerOwnershipRelease_no_delete" BEFORE DELETE ON "PlayerOwnershipRelease"
BEGIN SELECT RAISE(ABORT,'PLAYER_RELEASE_AUDIT_IMMUTABLE'); END;
CREATE TRIGGER "PlayerOwnershipRelease_update_guard" BEFORE UPDATE ON "PlayerOwnershipRelease"
WHEN OLD."appliedAt" IS NOT NULL OR NEW."appliedAt" IS NULL
 OR NEW."id" IS NOT OLD."id" OR NEW."clubId" IS NOT OLD."clubId" OR NEW."playerId" IS NOT OLD."playerId"
 OR NEW."previousOwnerUserId" IS NOT OLD."previousOwnerUserId" OR NEW."actorUserId" IS NOT OLD."actorUserId"
 OR NEW."accessId" IS NOT OLD."accessId" OR NEW."accessRevision" IS NOT OLD."accessRevision"
 OR NEW."membershipsJson" IS NOT OLD."membershipsJson" OR NEW."reason" IS NOT OLD."reason" OR NEW."createdAt" IS NOT OLD."createdAt"
 OR NOT EXISTS (SELECT 1 FROM "User" p WHERE p."id"=OLD."playerId" AND p."ownerUserId" IS NULL)
BEGIN SELECT RAISE(ABORT,'PLAYER_RELEASE_AUDIT_IMMUTABLE'); END;
DROP TRIGGER "Player_owner_immutable";
CREATE TRIGGER "Player_owner_immutable" BEFORE UPDATE OF "ownerUserId" ON "User"
WHEN OLD."ownerUserId" IS NOT NULL AND NEW."ownerUserId" IS NOT OLD."ownerUserId" AND (
 NEW."ownerUserId" IS NOT NULL
 OR NOT EXISTS (SELECT 1 FROM "PlayerOwnershipRelease" r WHERE r."playerId"=OLD."id" AND r."previousOwnerUserId"=OLD."ownerUserId" AND r."appliedAt" IS NULL)
 OR NEW."id" IS NOT OLD."id" OR NEW."email" IS NOT OLD."email" OR NEW."passwordHash" IS NOT OLD."passwordHash"
 OR NEW."name" IS NOT OLD."name" OR NEW."avatarKey" IS NOT OLD."avatarKey"
 OR NEW."selfNameChangedAt" IS NOT OLD."selfNameChangedAt" OR NEW."selfGenderChangedAt" IS NOT OLD."selfGenderChangedAt"
 OR NEW."isClaimed" IS NOT OLD."isClaimed" OR NEW."gender" IS NOT OLD."gender"
 OR NEW."partnerPreference" IS NOT OLD."partnerPreference" OR NEW."mixedSideOverride" IS NOT OLD."mixedSideOverride"
 OR NEW."elo" IS NOT OLD."elo" OR NEW."isActive" IS NOT OLD."isActive"
 OR NEW."createdAt" IS NOT OLD."createdAt" OR NEW."updatedAt" IS NOT OLD."updatedAt")
BEGIN SELECT RAISE(ABORT,'PLAYER_OWNER_IMMUTABLE'); END;
CREATE TRIGGER "PlayerOwnershipRelease_apply" AFTER INSERT ON "PlayerOwnershipRelease"
BEGIN
 UPDATE "User" SET "ownerUserId"=NULL WHERE "id"=NEW."playerId" AND "ownerUserId"=NEW."previousOwnerUserId";
 UPDATE "PlayerOwnershipRelease" SET "appliedAt"=NEW."createdAt" WHERE "id"=NEW."id";
END;
-- A later normal invite authorizes one MEMBER restoration at the exact revoked
-- access revision recorded by the explicit disconnect. A later ban invalidates it.
CREATE VIEW "ClaimReleaseAuthorization" AS
SELECT r."id" AS "releaseId",i."id" AS "invitationId",r."previousOwnerUserId" AS "recipientUserId"
FROM "PlayerOwnershipRelease" r JOIN "User" source ON source."id"=r."playerId"
JOIN "PlayerInvitation" i ON i."clubId"=r."clubId"
JOIN "ClubAccess" a ON a."id"=r."accessId"
WHERE r."appliedAt" IS NOT NULL AND source."ownerUserId" IS NULL
 AND i."purpose"='CLAIM' AND i."status"='ACTIVE' AND i."playerId"!=r."playerId"
 AND a."clubId"=r."clubId" AND a."userId"=r."previousOwnerUserId" AND a."status"='REVOKED' AND a."revision"=r."accessRevision"
 AND (CASE WHEN typeof(i."createdAt") IN ('integer','real') THEN i."createdAt" ELSE round((julianday(i."createdAt")-2440587.5)*86400000) END)>=r."appliedAt"
 AND NOT EXISTS (SELECT 1 FROM "PlayerOwnershipReleaseClaim" used WHERE used."releaseId"=r."id")
 AND NOT EXISTS (SELECT 1 FROM "CommunityMember" m WHERE m."userId"=source."id" AND (m."archivedAt" IS NULL OR m."retiredByAdmissionEventId" IS NOT NULL));
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
        AND approverAccess."status"='ACTIVE' AND approverAccess."role" IN ('ADMIN','OWNER'))
      OR EXISTS (SELECT 1 FROM "ClaimReleaseAuthorization" release
        WHERE release."invitationId"=NEW."id" AND release."recipientUserId"=recipient."id")))
    OR (NEW."purpose" IN ('CORRECTION','ACCESS_RESTORE') AND NEW."targetAccountUserId"=recipient."id"
     AND EXISTS (SELECT 1 FROM "ClubJoinRequest" request JOIN "ClubAdmissionEvent" event ON event."admissionRequestId"=request."id"
      WHERE request."originInvitationId"=NEW."id" AND request."status"='PENDING' AND request."userId"=recipient."id"
       AND request."revision"=event."revision" AND event."action"=CASE WHEN NEW."purpose"='CORRECTION' THEN 'EXECUTE_AUTHORIZED_CORRECTION' ELSE 'EXECUTE_AUTHORIZED_ACCESS_RESTORE' END
       AND event."actorUserId"=recipient."id" AND event."authorizedByUserId"=NEW."createdByUserId")
     AND EXISTS (SELECT 1 FROM "ClubAccess" access JOIN "Account" issuer ON issuer."id"=NEW."createdByUserId"
      WHERE access."id"=NEW."authorizerAccessId" AND access."clubId"=NEW."clubId" AND access."userId"=issuer."id"
       AND access."revision"=NEW."authorizerAccessRevision" AND access."status"='ACTIVE' AND access."role" IN ('ADMIN','OWNER') AND issuer."isActive"=1))))))
BEGIN SELECT RAISE(ABORT,'INVITATION_STATE_INVALID'); END;
CREATE TRIGGER "PlayerOwnershipReleaseClaim_insert_guard" BEFORE INSERT ON "PlayerOwnershipReleaseClaim"
WHEN EXISTS (SELECT 1 FROM "PlayerOwnershipReleaseClaim" old WHERE old."releaseId"=NEW."releaseId" OR old."invitationId"=NEW."invitationId")
 OR NOT EXISTS (SELECT 1 FROM "PlayerOwnershipRelease" r
 JOIN "PlayerInvitation" i ON i."id"=NEW."invitationId"
 JOIN "User" target ON target."id"=i."playerId" JOIN "User" source ON source."id"=r."playerId"
 JOIN "ClubAccess" a ON a."id"=r."accessId"
 WHERE r."id"=NEW."releaseId" AND r."appliedAt" IS NOT NULL AND source."ownerUserId" IS NULL
 AND i."purpose"='CLAIM' AND i."clubId"=r."clubId" AND i."status"='REDEEMED'
 AND i."redeemedByUserId"=r."previousOwnerUserId" AND NEW."actorUserId"=r."previousOwnerUserId"
 AND target."ownerUserId"=r."previousOwnerUserId" AND target."id"!=source."id"
 AND a."clubId"=r."clubId" AND a."userId"=r."previousOwnerUserId" AND a."status"='ACTIVE' AND a."role"='MEMBER' AND a."revision"=r."accessRevision"+1)
BEGIN SELECT RAISE(ABORT,'PLAYER_RELEASE_CLAIM_INVALID'); END;
CREATE TRIGGER "PlayerOwnershipReleaseClaim_no_update" BEFORE UPDATE ON "PlayerOwnershipReleaseClaim"
BEGIN SELECT RAISE(ABORT,'PLAYER_RELEASE_AUDIT_IMMUTABLE'); END;
CREATE TRIGGER "PlayerOwnershipReleaseClaim_no_delete" BEFORE DELETE ON "PlayerOwnershipReleaseClaim"
BEGIN SELECT RAISE(ABORT,'PLAYER_RELEASE_AUDIT_IMMUTABLE'); END;
