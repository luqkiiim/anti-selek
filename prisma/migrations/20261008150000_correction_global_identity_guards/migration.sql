-- Keep direct SQL writes subject to the same global owned-Player policy as the
-- correction service. The source is the sole allowed non-retired identity
-- before retirement; after retirement, the original target is the sole allowed
-- non-retired identity. RetiredPlayer is membership-independent and includes
-- only explicitly marked duplicates. These guards supplement 0814 without
-- rewriting its migration checksum or changing ordinary CLAIM behavior.

CREATE TRIGGER "Correction_invitation_global_identity_guard"
BEFORE INSERT ON "PlayerInvitation"
WHEN NEW."purpose"='CORRECTION' AND (
 NEW."targetAccountUserId" IS NULL
 OR NEW."sourcePlayerId" IS NULL
 OR NEW."playerId" IS NEW."sourcePlayerId"
 OR NOT EXISTS (
   SELECT 1 FROM "User" source
   JOIN "CommunityMember" sourceMember ON sourceMember."userId"=source."id"
   WHERE source."id"=NEW."sourcePlayerId"
    AND source."ownerUserId"=NEW."targetAccountUserId"
    AND sourceMember."id"=NEW."sourceMemberId"
    AND sourceMember."communityId"=NEW."clubId"
    AND sourceMember."retiredByAdmissionEventId" IS NULL
    AND NOT EXISTS (SELECT 1 FROM "RetiredPlayer" retired WHERE retired."playerId"=source."id")
 )
 OR EXISTS (
   SELECT 1 FROM "User" other
   WHERE other."ownerUserId"=NEW."targetAccountUserId"
    AND other."id" IS NOT NEW."sourcePlayerId"
    AND NOT EXISTS (SELECT 1 FROM "RetiredPlayer" retired WHERE retired."playerId"=other."id")
 )
)
BEGIN SELECT RAISE(ABORT,'IDENTITY_CONFLICT'); END;

CREATE TRIGGER "Correction_execution_global_identity_guard"
BEFORE INSERT ON "ClubAdmissionEvent"
WHEN NEW."action"='EXECUTE_AUTHORIZED_CORRECTION' AND NOT EXISTS (
 SELECT 1
 FROM "ClubJoinRequest" r
 JOIN "PlayerInvitation" i ON i."id"=r."originInvitationId"
 JOIN "User" source ON source."id"=i."sourcePlayerId"
 JOIN "CommunityMember" sourceMember ON sourceMember."id"=i."sourceMemberId"
   AND sourceMember."userId"=source."id"
 WHERE r."id"=NEW."admissionRequestId"
  AND r."status"='PENDING' AND r."revision"=NEW."revision"
  AND r."kind"='EXISTING_PLAYER'
  AND r."clubId"=i."clubId" AND r."requestedPlayerId"=i."playerId"
  AND r."userId"=i."targetAccountUserId"
  AND i."purpose"='CORRECTION' AND i."status"='ACTIVE'
  AND i."sourcePlayerId" IS NOT NULL AND i."sourceMemberId" IS NOT NULL
  AND i."retireSourcePlayerId" IS i."sourcePlayerId"
  AND i."playerId" IS NOT i."sourcePlayerId"
  AND source."ownerUserId"=r."userId"
  AND sourceMember."communityId"=r."clubId"
  AND sourceMember."retiredByAdmissionEventId" IS NULL
  AND NOT EXISTS (SELECT 1 FROM "RetiredPlayer" retired WHERE retired."playerId"=source."id")
  AND NEW."actorUserId" IS r."userId"
  AND NEW."authorizedByUserId" IS i."createdByUserId"
  AND NOT EXISTS (
    SELECT 1 FROM "User" other
    WHERE other."ownerUserId"=r."userId"
     AND other."id" IS NOT i."sourcePlayerId"
     AND NOT EXISTS (SELECT 1 FROM "RetiredPlayer" retired WHERE retired."playerId"=other."id")
  )
)
BEGIN SELECT RAISE(ABORT,'IDENTITY_CONFLICT'); END;

CREATE TRIGGER "Correction_retirement_global_identity_guard"
BEFORE UPDATE OF "retiredByAdmissionEventId" ON "CommunityMember"
WHEN NEW."retiredByAdmissionEventId" IS NOT OLD."retiredByAdmissionEventId"
 AND NEW."retiredByAdmissionEventId" IS NOT NULL
 AND EXISTS (SELECT 1 FROM "ClubAdmissionEvent" e
   WHERE e."id"=NEW."retiredByAdmissionEventId" AND e."action"='EXECUTE_AUTHORIZED_CORRECTION')
 AND NOT EXISTS (
   SELECT 1
   FROM "ClubAdmissionEvent" e
   JOIN "ClubJoinRequest" r ON r."id"=e."admissionRequestId"
   JOIN "PlayerInvitation" i ON i."id"=r."originInvitationId"
   JOIN "User" source ON source."id"=OLD."userId"
   JOIN "CommunityMember" sourceMember ON sourceMember."id"=i."sourceMemberId"
     AND sourceMember."userId"=source."id"
   WHERE e."id"=NEW."retiredByAdmissionEventId"
    AND e."action"='EXECUTE_AUTHORIZED_CORRECTION'
    AND e."revision"=r."revision" AND r."status"='PENDING'
    AND r."kind"='EXISTING_PLAYER'
    AND r."clubId"=i."clubId" AND r."requestedPlayerId"=i."playerId"
    AND r."userId"=i."targetAccountUserId"
    AND i."purpose"='CORRECTION' AND i."status"='REDEEMED'
    AND i."redeemedByUserId"=r."userId"
    AND i."sourcePlayerId" IS NOT NULL AND i."sourceMemberId" IS NOT NULL
    AND i."retireSourcePlayerId" IS i."sourcePlayerId"
    AND i."sourcePlayerId"=OLD."userId" AND i."sourceMemberId"=OLD."id"
    AND i."playerId" IS NOT i."sourcePlayerId"
    AND source."ownerUserId"=r."userId" AND source."isActive"=0
    AND sourceMember."communityId"=r."clubId"
    AND sourceMember."retiredByAdmissionEventId" IS NULL
    AND NEW."retiredByAdmissionEventId"=e."id"
    AND e."actorUserId" IS r."userId"
    AND e."authorizedByUserId" IS i."createdByUserId"
    AND NOT EXISTS (
      SELECT 1 FROM "User" other
      WHERE other."ownerUserId"=r."userId"
       AND other."id" IS NOT i."sourcePlayerId"
       AND NOT EXISTS (SELECT 1 FROM "RetiredPlayer" retired WHERE retired."playerId"=other."id")
    )
 )
BEGIN SELECT RAISE(ABORT,'IDENTITY_CONFLICT'); END;

CREATE TRIGGER "Correction_approval_global_identity_guard"
BEFORE UPDATE OF "status" ON "ClubJoinRequest"
WHEN NEW."originInvitationId" IS NOT NULL AND NEW."status"='APPROVED'
 AND OLD."status" IS NOT 'APPROVED'
 AND EXISTS (SELECT 1 FROM "PlayerInvitation" i
   WHERE i."id"=NEW."originInvitationId" AND i."purpose"='CORRECTION')
 AND NOT EXISTS (
   SELECT 1
   FROM "ClubJoinRequest" r
   JOIN "PlayerInvitation" i ON i."id"=r."originInvitationId"
   JOIN "User" target ON target."id"=i."playerId"
   JOIN "ClubAdmissionEvent" e ON e."admissionRequestId"=r."id"
   JOIN "CommunityMember" sourceMember ON sourceMember."id"=i."sourceMemberId"
   WHERE r."id"=NEW."id" AND r."status"='PENDING'
    AND r."originInvitationId"=NEW."originInvitationId"
    AND NEW."userId"=r."userId" AND NEW."clubId"=r."clubId"
    AND NEW."revision"=r."revision"
    AND r."kind"='EXISTING_PLAYER'
    AND r."clubId"=i."clubId" AND r."requestedPlayerId"=i."playerId"
    AND r."userId"=i."targetAccountUserId"
    AND i."purpose"='CORRECTION' AND i."status"='REDEEMED'
    AND i."redeemedByUserId"=r."userId"
    AND i."sourcePlayerId" IS NOT NULL AND i."sourceMemberId" IS NOT NULL
    AND i."retireSourcePlayerId" IS i."sourcePlayerId"
    AND i."playerId" IS NOT i."sourcePlayerId"
    AND NEW."approvedPlayerId" IS i."playerId"
    AND NEW."decision"='EXECUTE_AUTHORIZED_CORRECTION'
    AND NEW."reviewedById"=i."createdByUserId" AND NEW."reviewedAt" IS NOT NULL
    AND target."ownerUserId"=r."userId" AND target."isActive"=1
    AND e."revision"=r."revision" AND e."action"='EXECUTE_AUTHORIZED_CORRECTION'
    AND e."actorUserId" IS r."userId"
    AND e."authorizedByUserId" IS i."createdByUserId"
    AND sourceMember."userId"=i."sourcePlayerId"
    AND sourceMember."communityId"=r."clubId"
    AND sourceMember."retiredByAdmissionEventId"=e."id"
    AND NOT EXISTS (
      SELECT 1 FROM "User" other
      WHERE other."ownerUserId"=r."userId"
       AND other."id" IS NOT i."playerId"
       AND NOT EXISTS (SELECT 1 FROM "RetiredPlayer" retired WHERE retired."playerId"=other."id")
    )
 )
BEGIN SELECT RAISE(ABORT,'IDENTITY_CONFLICT'); END;
