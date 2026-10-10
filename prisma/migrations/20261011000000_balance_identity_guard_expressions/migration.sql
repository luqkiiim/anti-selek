-- Preserve the existing authorization and retirement predicates while balancing
-- their AND trees for hosted libSQL SQLITE_MAX_EXPR_DEPTH=100.
-- The original migrations remain unchanged; only these two triggers are replaced.

DROP TRIGGER "Authorized_execution_event_guard";
CREATE TRIGGER "Authorized_execution_event_guard" BEFORE INSERT ON "ClubAdmissionEvent"
WHEN NEW."action" IN ('EXECUTE_AUTHORIZED_CORRECTION','EXECUTE_AUTHORIZED_ACCESS_RESTORE')
    AND NOT EXISTS (
 SELECT 1 FROM "ClubJoinRequest" r JOIN "PlayerInvitation" i ON i."id"=r."originInvitationId"
 JOIN "Account" recipient ON recipient."id"=r."userId" JOIN "Account" issuer ON issuer."id"=i."createdByUserId"
 JOIN "ClubAccess" issuerAccess ON issuerAccess."id"=i."authorizerAccessId"
 WHERE ((((((r."id"=NEW."admissionRequestId")
    AND (r."status"='PENDING'))
    AND ((r."revision"=NEW."revision")
    AND (r."kind"='EXISTING_PLAYER')))
    AND (((r."clubId"=i."clubId")
    AND (r."requestedPlayerId"=i."playerId"))
    AND ((NOT EXISTS (SELECT 1 FROM "ClubJoinRequest" other WHERE other."id"!=r."id"
    AND other."clubId"=r."clubId"
    AND other."userId"=r."userId"
    AND other."status"='PENDING'))
    AND (i."status"='ACTIVE'))))
    AND ((((i."targetAccountUserId"=r."userId")
    AND (i."createdByUserId"!=r."userId"))
    AND (((CASE WHEN typeof(i."expiresAt") IN ('integer','real') THEN i."expiresAt" ELSE round((julianday(i."expiresAt")-2440587.5)*86400000) END) > round((julianday('now')-2440587.5)*86400000))
    AND (recipient."isActive"=1)))
    AND (((issuer."isActive"=1)
    AND (issuerAccess."clubId"=i."clubId"))
    AND ((issuerAccess."userId"=i."createdByUserId")
    AND (issuerAccess."status"='ACTIVE')))))
    AND (((((issuerAccess."role" IN ('ADMIN','OWNER'))
    AND (issuerAccess."revision"=i."authorizerAccessRevision"))
    AND ((NEW."actorUserId"=r."userId")
    AND (NEW."authorizedByUserId"=i."createdByUserId")))
    AND (((EXISTS (SELECT 1 FROM "PlayerInvitationEvent" issued WHERE issued."invitationId"=i."id"
    AND issued."actorUserId"=i."createdByUserId"
    AND issued."action"=CASE WHEN i."purpose"='CORRECTION' THEN 'CORRECTION_RETIRE_AUTHORIZED' ELSE 'ACCESS_RESTORE_AUTHORIZED' END
    AND issued."reason"=i."authorizationReason"
    AND json_valid(issued."detailsJson")
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
    AND json_extract(issued."detailsJson",'$.recipientAccessRevision') IS i."recipientAccessRevision"))
    AND ((json_type(NEW."detailsJson",'$.supersededRecoveryRequest') IS NULL
   OR json_type(NEW."detailsJson",'$.supersededRecoveryRequest')='null'
   OR EXISTS (SELECT 1 FROM "ClubJoinRequest" oldRequest
     JOIN "PlayerInvitation" oldInvite ON oldInvite."id"=oldRequest."originInvitationId"
     JOIN "ClubAdmissionEvent" cancelEvent ON cancelEvent."admissionRequestId"=oldRequest."id"
     WHERE oldRequest."id"=json_extract(NEW."detailsJson",'$.supersededRecoveryRequest.requestId')
    AND oldRequest."clubId"=i."clubId"
    AND oldRequest."userId"=r."userId"
    AND oldRequest."kind"='EXISTING_PLAYER'
    AND oldRequest."requestedPlayerId"=i."playerId"
    AND oldRequest."status"='CANCELLED'
    AND oldRequest."revision"=json_extract(NEW."detailsJson",'$.supersededRecoveryRequest.cancelledRevision')
    AND oldRequest."revision"=json_extract(NEW."detailsJson",'$.supersededRecoveryRequest.previousRevision')+1
    AND oldInvite."id"=json_extract(NEW."detailsJson",'$.supersededRecoveryRequest.originInvitationId')
    AND oldInvite."purpose"='CLAIM'
    AND oldInvite."status" IN ('REVOKED','EXPIRED')
    AND cancelEvent."id"=json_extract(NEW."detailsJson",'$.supersededRecoveryRequest.cancellationEventId')
    AND cancelEvent."revision"=oldRequest."revision"
    AND cancelEvent."action"='CANCEL'
    AND cancelEvent."actorUserId"=r."userId"
    AND json_valid(cancelEvent."detailsJson")
    AND json_extract(cancelEvent."detailsJson",'$.supersededByInvitationId')=i."id"))))
    AND ((json_valid(NEW."detailsJson"))
    AND (json_extract(NEW."detailsJson",'$.originInvitationId')=i."id"))))
    AND ((((json_extract(NEW."detailsJson",'$.targetPlayerId')=i."playerId")
    AND (json_extract(NEW."detailsJson",'$.sourcePlayerId') IS i."sourcePlayerId"))
    AND ((json_extract(NEW."detailsJson",'$.sourceMemberId') IS i."sourceMemberId")
    AND ((i."purpose"!='CORRECTION' OR (i."retireSourcePlayerId"=i."sourcePlayerId"
    AND json_extract(NEW."detailsJson",'$.retireSourcePlayerId')=i."retireSourcePlayerId")))))
    AND (((json_extract(NEW."detailsJson",'$.reason')=i."authorizationReason")
    AND (json_extract(NEW."detailsJson",'$.authorizedAccessAction')=i."authorizedAccessAction"))
    AND ((json_extract(NEW."detailsJson",'$.restoreArchivedRoster')=i."restoreArchivedRoster")
    AND ((((i."recipientAccessStatus"='NONE'
    AND NOT EXISTS (SELECT 1 FROM "ClubAccess" a WHERE a."clubId"=i."clubId"
    AND a."userId"=r."userId"))
   OR (i."recipientAccessStatus" IN ('ACTIVE','REVOKED')
    AND EXISTS (SELECT 1 FROM "ClubAccess" a WHERE a."id"=i."recipientAccessId"
    AND a."clubId"=i."clubId"
    AND a."userId"=r."userId"
    AND a."status"=i."recipientAccessStatus"
    AND a."role"=i."recipientAccessRole"
    AND a."revision"=i."recipientAccessRevision"))))
    AND (((i."purpose"='CORRECTION'
    AND NEW."action"='EXECUTE_AUTHORIZED_CORRECTION'
    AND EXISTS (
    SELECT 1 FROM "CommunityMember" tm JOIN "User" tp ON tp."id"=tm."userId"
    JOIN "CommunityMember" sm ON sm."id"=i."sourceMemberId" JOIN "User" sp ON sp."id"=sm."userId"
    WHERE tm."id"=i."clubMemberId"
    AND tm."communityId"=i."clubId"
    AND tm."userId"=i."playerId"
    AND tm."archivedAt" IS NULL
    AND tm."retiredByAdmissionEventId" IS NULL
    AND tp."isActive"=1
    AND tp."ownerUserId" IS NULL
    AND sm."communityId"=i."clubId"
    AND sm."userId"=i."sourcePlayerId"
    AND sm."retiredByAdmissionEventId" IS NULL
    AND sp."ownerUserId"=r."userId"
    AND (SELECT count(*) FROM "CommunityMember" allSource WHERE allSource."userId"=sp."id")=1)
    AND NOT EXISTS (SELECT 1 FROM "PlayerRetirementBlocker" b WHERE b."playerId"=i."sourcePlayerId"
    AND b."reason"!='ROSTER_NOT_ARCHIVED')
    AND NOT EXISTS (SELECT 1 FROM "PlayerRetirementSourceInvitation" si WHERE si."playerId"=i."sourcePlayerId"
    AND si."invitationId"!=i."id"))
   OR (i."purpose"='ACCESS_RESTORE'
    AND NEW."action"='EXECUTE_AUTHORIZED_ACCESS_RESTORE'
    AND EXISTS (
    SELECT 1 FROM "CommunityMember" tm JOIN "User" tp ON tp."id"=tm."userId"
    WHERE tm."id"=i."clubMemberId"
    AND tm."communityId"=i."clubId"
    AND tm."userId"=i."playerId"
    AND tm."retiredByAdmissionEventId" IS NULL
    AND tp."isActive"=1
    AND tp."ownerUserId"=r."userId"
    AND ((i."restoreArchivedRoster"=1
    AND tm."archivedAt" IS NOT NULL) OR (i."restoreArchivedRoster"=0
    AND tm."archivedAt" IS NULL))))))))))))
 )
BEGIN SELECT RAISE(ABORT,'AUTHORIZED_EXECUTION_INVALID'); END;

DROP TRIGGER "ClubMember_retirement_guard";
CREATE TRIGGER "ClubMember_retirement_guard" BEFORE UPDATE OF "retiredByAdmissionEventId" ON "CommunityMember"
WHEN NEW."retiredByAdmissionEventId" IS NOT OLD."retiredByAdmissionEventId"
    AND (
 OLD."retiredByAdmissionEventId" IS NOT NULL OR NEW."retiredByAdmissionEventId" IS NULL
 OR NEW."archivedAt" IS NULL OR NEW."ownerUserId" IS NULL
 OR NEW."id" IS NOT OLD."id" OR NEW."communityId" IS NOT OLD."communityId" OR NEW."userId" IS NOT OLD."userId"
 OR NEW."ownerUserId" IS NOT OLD."ownerUserId" OR NEW."role" IS NOT OLD."role" OR NEW."status" IS NOT OLD."status"
 OR NEW."preferredPool" IS NOT OLD."preferredPool" OR NEW."needsMoreRest" IS NOT OLD."needsMoreRest" OR NEW."elo" IS NOT OLD."elo"
 OR NEW."createdAt" IS NOT OLD."createdAt" OR NEW."archivedAt" IS NOT OLD."archivedAt"
 OR NEW."achievementPreferencesJson" IS NOT OLD."achievementPreferencesJson"
 OR EXISTS (SELECT 1 FROM "PlayerRetirementBlocker" b WHERE b."playerId"=OLD."userId"
    AND b."reason"!='ROSTER_NOT_ARCHIVED')
 OR NOT (
  EXISTS (SELECT 1 FROM "ClubAdmissionEvent" e JOIN "ClubJoinRequest" r ON r."id"=e."admissionRequestId"
   JOIN "RecoverablePlayerInvitation" i ON i."id"=r."originInvitationId" JOIN "User" p ON p."id"=OLD."userId"
   JOIN "ClubAccess" access ON access."clubId"=r."clubId"
    AND access."userId"=e."actorUserId"
   JOIN "Account" a ON a."id"=e."actorUserId" JOIN "Account" requester ON requester."id"=r."userId"
   WHERE e."id"=NEW."retiredByAdmissionEventId"
    AND e."action"='APPROVE_RECOVERY'
    AND e."revision"=r."revision"
    AND r."status"='PENDING'
    AND r."clubId"=OLD."communityId"
    AND r."userId"=p."ownerUserId"
    AND p."isActive"=0
    AND access."status"='ACTIVE'
    AND access."role" IN ('ADMIN','OWNER')
    AND a."isActive"=1
    AND requester."isActive"=1
    AND a."id"!=r."userId"
    AND json_extract(e."detailsJson",'$.sourcePlayerId')=OLD."userId"
    AND json_extract(e."detailsJson",'$.sourceMemberId')=OLD."id"
    AND json_extract(e."detailsJson",'$.targetPlayerId')=r."requestedPlayerId"
    AND length(trim(json_extract(e."detailsJson",'$.reason')))>0)
  OR EXISTS (SELECT 1 FROM "ClubAdmissionEvent" e JOIN "ClubJoinRequest" r ON r."id"=e."admissionRequestId"
   JOIN "PlayerInvitation" i ON i."id"=r."originInvitationId" JOIN "User" sourcePlayer ON sourcePlayer."id"=OLD."userId"
   JOIN "Account" recipient ON recipient."id"=r."userId" JOIN "Account" issuer ON issuer."id"=i."createdByUserId"
   JOIN "ClubAccess" issuerAccess ON issuerAccess."id"=i."authorizerAccessId"
   WHERE (((((e."id"=NEW."retiredByAdmissionEventId")
    AND ((e."action"='EXECUTE_AUTHORIZED_CORRECTION')
    AND (e."revision"=r."revision")))
    AND (((e."actorUserId"=r."userId")
    AND (e."authorizedByUserId"=i."createdByUserId"))
    AND ((r."status"='PENDING')
    AND (r."clubId"=OLD."communityId"))))
    AND ((((r."userId"=i."targetAccountUserId")
    AND (r."requestedPlayerId"=i."playerId"))
    AND ((r."approvedPlayerId" IS NULL)
    AND (i."purpose"='CORRECTION')))
    AND (((i."retireSourcePlayerId"=i."sourcePlayerId")
    AND (i."status"='REDEEMED'))
    AND ((i."redeemedByUserId"=r."userId")
    AND (i."sourcePlayerId"=OLD."userId")))))
    AND ((((i."sourceMemberId"=OLD."id")
    AND ((i."createdByUserId"!=r."userId")
    AND (i."targetAccountUserId"=sourcePlayer."ownerUserId")))
    AND (((sourcePlayer."isActive"=0)
    AND (recipient."isActive"=1))
    AND ((issuer."isActive"=1)
    AND (issuerAccess."clubId"=i."clubId"))))
    AND ((((issuerAccess."userId"=issuer."id")
    AND (issuerAccess."revision"=i."authorizerAccessRevision"))
    AND ((issuerAccess."status"='ACTIVE')
    AND (issuerAccess."role" IN ('ADMIN','OWNER'))))
    AND (((NOT EXISTS (SELECT 1 FROM "PlayerRetirementBlocker" b WHERE b."playerId"=OLD."userId"
    AND b."reason"!='ROSTER_NOT_ARCHIVED'))
    AND (NOT EXISTS (SELECT 1 FROM "PlayerRetirementSourceInvitation" si WHERE si."playerId"=OLD."userId")))
    AND ((EXISTS (SELECT 1 FROM "PlayerInvitationEvent" authorized WHERE authorized."invitationId"=i."id"
    AND authorized."actorUserId"=i."createdByUserId"
    AND authorized."reason"=i."authorizationReason"
    AND authorized."action"='CORRECTION_RETIRE_AUTHORIZED'
    AND json_valid(authorized."detailsJson")
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
    AND json_extract(authorized."detailsJson",'$.recipientAccessRevision') IS i."recipientAccessRevision"))
    AND (EXISTS (SELECT 1 FROM "ClubAdmissionEvent" issued WHERE issued."admissionRequestId"=r."id"
    AND issued."revision"=r."revision"
    AND issued."action"='EXECUTE_AUTHORIZED_CORRECTION'
    AND issued."actorUserId"=r."userId"
    AND issued."authorizedByUserId"=i."createdByUserId"
    AND json_valid(issued."detailsJson")
    AND json_extract(issued."detailsJson",'$.originInvitationId')=i."id"
    AND json_extract(issued."detailsJson",'$.targetPlayerId')=i."playerId"
    AND json_extract(issued."detailsJson",'$.sourcePlayerId')=i."sourcePlayerId"
    AND json_extract(issued."detailsJson",'$.sourceMemberId')=i."sourceMemberId"
    AND json_extract(issued."detailsJson",'$.retireSourcePlayerId')=i."retireSourcePlayerId"
    AND json_extract(issued."detailsJson",'$.reason')=i."authorizationReason"
    AND json_extract(issued."detailsJson",'$.authorizedAccessAction')=i."authorizedAccessAction"
    AND json_extract(issued."detailsJson",'$.restoreArchivedRoster')=i."restoreArchivedRoster"))))))))
 ))
BEGIN SELECT RAISE(ABORT,'PLAYER_RETIREMENT_INVALID'); END;
