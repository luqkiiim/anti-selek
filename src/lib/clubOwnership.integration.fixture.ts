import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
export const localOwnershipMigration = "20261012120000_club_local_player_ownership";
export function migrateFixture(db: DatabaseSync, through = localOwnershipMigration) {
  for (const name of readdirSync(path.resolve("prisma/migrations")).filter(name => name <= through && !name.includes(".")).sort()) {
    db.exec(readFileSync(path.resolve("prisma/migrations", name, "migration.sql"), "utf8"));
  }
}
/** A real release60 receipt: every predecessor guard remains installed during execution. */
export function seedHistoricalAccessReceipt(db: DatabaseSync) {
  db.exec(`
    INSERT INTO Account (id,name,email,passwordHash,createdAt,updatedAt) VALUES
      ('legacy-admin','Legacy Admin','legacy-admin@example.invalid','fixture',1700000000000,1700000000000),
      ('legacy-recipient','Legacy Recipient','legacy-recipient@example.invalid','fixture',1700000000000,1700000000000);
    INSERT INTO Community (id,name,createdById,createdAt,updatedAt) VALUES ('legacy-club','Legacy Club','legacy-admin',1700000000000,1700000000000);
    INSERT INTO User (id,name,ownerUserId,createdAt,updatedAt) VALUES ('legacy-player','Legacy Player','legacy-recipient',1700000000000,1700000000000);
    INSERT INTO CommunityMember (id,communityId,userId,ownerUserId,createdAt) VALUES ('legacy-member','legacy-club','legacy-player','legacy-recipient',1700000000000);
    INSERT INTO ClubAccess (id,clubId,userId,role,status,createdAt,updatedAt) VALUES
      ('legacy-admin-access','legacy-club','legacy-admin','OWNER','ACTIVE',1700000000000,1700000000000),
      ('legacy-access','legacy-club','legacy-recipient','MEMBER','ACTIVE',1700000000000,1700000000000);
    INSERT INTO PlayerInvitation (id,clubId,playerId,clubMemberId,createdByUserId,tokenHash,expiresAt,createdAt,updatedAt,
      purpose,targetAccountUserId,authorizationReason,authorizedAccessAction,authorizerAccessId,authorizerAccessRevision,
      recipientAccessId,recipientAccessStatus,recipientAccessRole,recipientAccessRevision)
    VALUES ('legacy-invite','legacy-club','legacy-player','legacy-member','legacy-admin','legacy-token',4102444800000,1700000000000,1700000000000,
      'ACCESS_RESTORE','legacy-recipient','Historical approved restoration','PRESERVE_ACTIVE','legacy-admin-access',0,
      'legacy-access','ACTIVE','MEMBER',0);
    INSERT INTO ClubJoinRequest (id,clubId,userId,kind,status,requestedPlayerId,originInvitationId,createdAt,updatedAt)
      VALUES ('legacy-request','legacy-club','legacy-recipient','EXISTING_PLAYER','PENDING','legacy-player','legacy-invite',1700000000000,1700000000000);
    UPDATE ClubJoinRequest SET revision=1 WHERE id='legacy-request';
  `);
  const access = { accessId: "legacy-access", status: "ACTIVE", role: "MEMBER", revision: 0 };
  const details = {
    originInvitationId: "legacy-invite", targetPlayerId: "legacy-player", sourcePlayerId: null, sourceMemberId: null,
    reason: "Historical approved restoration", authorizedAccessAction: "PRESERVE_ACTIVE", restoreArchivedRoster: false,
    accessBefore: access, accessAfter: access, accessOutcome: "PRESERVED_ACTIVE", rosterOutcome: "UNCHANGED", sourceRetired: false,
    accessAfterId: "legacy-access", accessAfterRole: "MEMBER", accessAfterStatus: "ACTIVE", accessAfterRevision: 0,
  };
  db.prepare(`INSERT INTO ClubAdmissionEvent (id,admissionRequestId,actorUserId,authorizedByUserId,action,revision,detailsJson,createdAt)
    VALUES ('legacy-execution','legacy-request','legacy-recipient','legacy-admin','EXECUTE_AUTHORIZED_ACCESS_RESTORE',1,?,1700000000001)`).run(JSON.stringify(details));
  db.exec(`
    UPDATE PlayerInvitation SET status='REDEEMED',redeemedByUserId='legacy-recipient',redeemedAt=1700000000002 WHERE id='legacy-invite';
    UPDATE ClubJoinRequest SET status='APPROVED',approvedPlayerId='legacy-player',decision='EXECUTE_AUTHORIZED_ACCESS_RESTORE',reviewedById='legacy-admin',reviewedAt=1700000000003 WHERE id='legacy-request';
    INSERT INTO Community (id,name,createdById,createdAt,updatedAt) VALUES ('legacy-club-b','Retained Archived Club','legacy-admin',1700000000000,1700000000000);
    INSERT INTO CommunityMember (id,communityId,userId,ownerUserId,archivedAt,elo,createdAt) VALUES ('legacy-member-b','legacy-club-b','legacy-player','legacy-recipient',1700000000004,1432,1700000000000);
    INSERT INTO ClubAccess (id,clubId,userId,role,status,createdAt,updatedAt) VALUES
      ('legacy-admin-access-b','legacy-club-b','legacy-admin','OWNER','ACTIVE',1700000000000,1700000000000),
      ('legacy-access-b','legacy-club-b','legacy-recipient','MEMBER','REVOKED',1700000000000,1700000000000);
  `);
}
