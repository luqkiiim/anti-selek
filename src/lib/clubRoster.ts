import type { Prisma, PrismaClient } from "@prisma/client";
import { deriveClubPairingPreferences } from "./clubPairingPreferences";
import { serializeAvatarEntity } from "./avatar";
import { normalizeClubRole } from "./clubRoles";

type Database = PrismaClient | Prisma.TransactionClient;
type RosterMembership = Prisma.ClubMemberGetPayload<{ include: { player: true } }>;

/** Keep list and mutation responses on the same sporting-membership contract. */
export function serializeClubRosterMember(
  member: RosterMembership,
  { role, createdById }: { role?: string | null; createdById?: string | null }
) {
  const normalizedRole = normalizeClubRole(role);
  return {
    id: member.playerId,
    playerId: member.playerId,
    clubMemberId: member.id,
    ownerUserId: member.ownerUserId,
    retiredByAdmissionEventId: member.retiredByAdmissionEventId,
    name: member.player.name,
    email: null,
    avatarUrl: serializeAvatarEntity(member.player).avatarUrl,
    gender: member.player.gender,
    ...deriveClubPairingPreferences(member),
    elo: member.elo,
    status: member.status,
    preferredPool: member.preferredPool,
    needsMoreRest: member.needsMoreRest,
    isActive: member.player.isActive,
    isClaimed: member.ownerUserId !== null,
    role: member.ownerUserId ? normalizedRole : "MEMBER",
    isOwner: member.ownerUserId !== null && member.ownerUserId === createdById && ["ADMIN", "OWNER"].includes(normalizedRole),
    createdAt: member.player.createdAt,
    wins: 0,
    losses: 0,
  };
}

/** Read just the affected member and its current access inside a mutation. */
export async function getClubRosterMember(db: Database, clubId: string, playerId: string) {
  const member = await db.clubMember.findUnique({
    where: { clubId_playerId: { clubId, playerId } },
    include: { player: true },
  });
  if (!member || member.archivedAt || member.retiredByAdmissionEventId) return null;
  const [access, club] = await Promise.all([
    member.ownerUserId
      ? db.clubAccess.findUnique({
          where: { clubId_userId: { clubId, userId: member.ownerUserId } },
          select: { role: true, status: true },
        })
      : null,
    db.club.findUnique({ where: { id: clubId }, select: { createdById: true } }),
  ]);
  return serializeClubRosterMember(member, {
    role: access?.status === "ACTIVE" ? access.role : null,
    createdById: club?.createdById,
  });
}

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
  return members.map(member => serializeClubRosterMember(member, {
    role: member.ownerUserId ? roles.get(member.ownerUserId) : null,
    createdById: club?.createdById,
  }));
}
