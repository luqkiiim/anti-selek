import type { Prisma, PrismaClient } from "@prisma/client";
import { serializeAvatarEntity } from "./avatar";
import { normalizeClubRole } from "./clubRoles";

type Database = PrismaClient | Prisma.TransactionClient;

/** Sporting membership is independent of account authorization. */
export async function getClubRoster(db: Database, clubId: string, includeArchived = false) {
  const [members, access, club] = await Promise.all([
    db.clubMember.findMany({
      where: { clubId, ...(includeArchived ? {} : { archivedAt: null, retiredByAdmissionEventId: null }) },
      include: { player: true },
      orderBy: { createdAt: "asc" },
    }),
    db.clubAccess.findMany({ where: { clubId, status: "ACTIVE" }, select: { userId: true, role: true } }),
    db.club.findUnique({ where: { id: clubId }, select: { createdById: true } }),
  ]);
  const roles = new Map(access.map(grant => [grant.userId, normalizeClubRole(grant.role)]));
  return members.map(member => ({
    id: member.playerId,
    playerId: member.playerId,
    clubMemberId: member.id,
    ownerUserId: member.ownerUserId,
    retiredByAdmissionEventId: member.retiredByAdmissionEventId,
    name: member.player.name,
    email: null,
    avatarUrl: serializeAvatarEntity(member.player).avatarUrl,
    gender: member.player.gender,
    partnerPreference: member.player.partnerPreference,
    mixedSideOverride: member.player.mixedSideOverride,
    elo: member.elo,
    status: member.status,
    preferredPool: member.preferredPool,
    needsMoreRest: member.needsMoreRest,
    isActive: member.player.isActive,
    isClaimed: member.ownerUserId !== null,
    role: member.ownerUserId ? roles.get(member.ownerUserId) ?? "MEMBER" : "MEMBER",
    isOwner: member.ownerUserId !== null && member.ownerUserId === club?.createdById && ["ADMIN", "OWNER"].includes(roles.get(member.ownerUserId) ?? "MEMBER"),
    createdAt: member.player.createdAt,
    wins: 0,
    losses: 0,
  }));
}
