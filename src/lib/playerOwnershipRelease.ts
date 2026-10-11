import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { ClubAdmissionError } from "./clubAdmissions";

type Db = Prisma.TransactionClient | PrismaClient;
export class PlayerReleaseError extends ClubAdmissionError {
  constructor(message: string, readonly code = "PLAYER_RELEASE_BLOCKED", status = 409) { super(message, status); }
}
async function localAdmin(db: Db, clubId: string, actorUserId: string) {
  const [account, access, club] = await Promise.all([
    db.user.findUnique({ where: { id: actorUserId }, select: { isActive: true } }),
    db.clubAccess.findUnique({ where: { clubId_userId: { clubId, userId: actorUserId } } }),
    db.club.findUnique({ where: { id: clubId }, select: { isTutorial: true } }),
  ]);
  if (!account?.isActive || !club || club.isTutorial || access?.status !== "ACTIVE" || !["ADMIN", "OWNER"].includes(access.role))
    throw new PlayerReleaseError("Active club admin access required.", "ADMIN_REQUIRED", 403);
}
export async function removedOwnedPlayers(db: Db, clubId: string, actorUserId: string) {
  await localAdmin(db, clubId, actorUserId);
  const members = await db.clubMember.findMany({
    where: { clubId, archivedAt: { not: null }, retiredByAdmissionEventId: null, player: { ownerUserId: { not: null } } },
    select: { player: { select: { id: true, name: true } } }, orderBy: { createdAt: "desc" },
  });
  return { players: members.map(m => m.player) };
}
/** Disconnect only an explicitly selected, already removed global Player.
 * Sporting references (including achievements) are preserved; this is not retirement.
 * The database repeats the authority checks and performs the audited unlink atomically.
 */
export async function disconnectRemovedPlayer(db: Prisma.TransactionClient, input: { clubId: string; playerId: string; actorUserId: string }) {
  await localAdmin(db, input.clubId, input.actorUserId);
  const member = await db.clubMember.findUnique({ where: { clubId_playerId: { clubId: input.clubId, playerId: input.playerId } }, include: { player: true } });
  if (!member || !member.archivedAt || member.retiredByAdmissionEventId) throw new PlayerReleaseError("Remove this Player from the club before disconnecting the account.");
  if (!member.player.ownerUserId) return { disconnected: true }; // retry: never remove twice or repeat grants
  const previousOwner = member.player.ownerUserId;
  if (previousOwner === input.actorUserId) throw new PlayerReleaseError("Another club admin must disconnect your account.", "SELF_APPROVAL", 403);
  const memberships = await db.clubMember.findMany({ where: { playerId: input.playerId }, include: { club: { select: { id: true, createdById: true, isTutorial: true } } } });
  for (const row of memberships) {
    if (!row.archivedAt || row.retiredByAdmissionEventId) throw new PlayerReleaseError("This Player still belongs to another club. Remove it there before disconnecting the account.");
    if (row.club.createdById === previousOwner || row.club.isTutorial) throw new PlayerReleaseError("The club owner's Player cannot be disconnected.");
    await localAdmin(db, row.clubId, input.actorUserId);
    const grant = await db.clubAccess.findUnique({ where: { clubId_userId: { clubId: row.clubId, userId: previousOwner } } });
    if (grant?.status === "ACTIVE") throw new PlayerReleaseError("Remove this account's club access before disconnecting the Player.");
  }
  const [participation, pending, claim, invitation] = await Promise.all([
    db.sessionPlayer.findFirst({ where: { playerId: input.playerId, session: { status: { in: ["WAITING", "ACTIVE"] } } }, select: { id: true } }),
    db.clubAdmissionRequest.findFirst({ where: { requesterUserId: previousOwner, status: "PENDING" }, select: { id: true } }),
    db.claimRequest.findFirst({ where: { targetPlayerId: input.playerId, status: "PENDING" }, select: { id: true } }),
    db.playerInvitation.findFirst({ where: { status: "ACTIVE", OR: [{ playerId: input.playerId }, { sourcePlayerId: input.playerId }, { targetAccountUserId: previousOwner }] }, select: { id: true } }),
  ]);
  if (participation) throw new PlayerReleaseError("Finish or leave the Player's unfinished sessions first.");
  if (pending || claim || invitation) throw new PlayerReleaseError("Close the pending profile request or invitation before disconnecting this account.");
  const grant = await db.clubAccess.findUnique({ where: { clubId_userId: { clubId: input.clubId, userId: previousOwner } } });
  if (!grant || grant.status !== "REVOKED") throw new PlayerReleaseError("The removed account's revoked club access is required.");
  const snapshots = await db.$queryRaw<Array<{ snapshot: string }>>`SELECT json_group_array(json_object('memberId',"id",'clubId',"communityId",'archivedAt',"archivedAt")) AS "snapshot" FROM "CommunityMember" WHERE "userId"=${input.playerId}`;
  const id = randomUUID();
  const now = Date.now();
  await db.$executeRaw`INSERT INTO "PlayerOwnershipRelease" ("id","clubId","playerId","previousOwnerUserId","actorUserId","accessId","accessRevision","membershipsJson","reason","createdAt")
    VALUES (${id},${input.clubId},${input.playerId},${previousOwner},${input.actorUserId},${grant.id},${grant.revision},${snapshots[0].snapshot},'Admin disconnected a removed Player; history retained and a fresh profile invitation may restore MEMBER access.',${now})`;
  return { disconnected: true };
}
export async function claimReleaseAuthorization(db: Prisma.TransactionClient, invitationId: string, userId: string) {
  const rows = await db.$queryRaw<Array<{ releaseId: string }>>`SELECT "releaseId" FROM "ClaimReleaseAuthorization" WHERE "invitationId"=${invitationId} AND "recipientUserId"=${userId} LIMIT 1`;
  return rows[0]?.releaseId ?? null;
}
export async function recordReleaseClaim(db: Prisma.TransactionClient, releaseId: string, invitationId: string, userId: string) {
  await db.$executeRaw`INSERT INTO "PlayerOwnershipReleaseClaim" ("releaseId","invitationId","actorUserId","createdAt") VALUES (${releaseId},${invitationId},${userId},${Date.now()})`;
}
