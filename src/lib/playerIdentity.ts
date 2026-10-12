import type { Prisma, PrismaClient } from "@prisma/client";
import { ClubRole } from "@/types/enums";
import { isClubAdminRole, isClubOperatorRole } from "@/lib/clubRoles";
export { getSessionAccountId, getQuickAccessPlayerId } from "@/lib/quickAccess";

export type IdentityDb = Prisma.TransactionClient | PrismaClient;
/** Retirement, unlike ordinary inactivity or archiving, is permanent and audited. */
export const nonretiredPlayer = { clubMemberships: { none: { retiredByAdmissionEventId: { not: null } } } } satisfies Prisma.PlayerWhereInput;

export class IdentityConflictError extends Error {
  readonly statusCode = 409;
}

/** Legacy global writers remain callable only to return an explicit denial. */
export async function assertNoOtherOwnedPlayer(_db: Prisma.TransactionClient, _userId: string, _playerId: string) {
  throw new IdentityConflictError("Global ownership changes are unavailable. Select a club profile.");
}
export async function linkUnownedPlayer(_db: Prisma.TransactionClient, _playerId: string, _userId: string) {
  throw new IdentityConflictError("Global ownership changes are unavailable. Select a club profile.");
}

export async function getOwnedPlayer(db: IdentityDb, { userId, playerId, clubId }: { userId: string; playerId: string; clubId?: string }) {
  // Callers authorizing a club/session action must supply its exact club. The
  // broader form is retained for account metadata readers with an exact ID.
  return db.player.findFirst({ where: { id: playerId, clubMemberships: { some: {
    ...(clubId ? { clubId } : {}), ownerUserId: userId, retiredByAdmissionEventId: null,
  } } } });
}

/** Never select an arbitrary legacy identity when an account has conflicting memberships. */
export async function getOwnedClubPlayer(db: IdentityDb, { userId, clubId }: { userId: string; clubId: string }) {
  const memberships = await db.clubMember.findMany({
    where: { clubId, retiredByAdmissionEventId: null, ownerUserId: userId }, include: { player: true }, take: 2,
  });
  if (memberships.length > 1) throw new IdentityConflictError("Multiple owned profiles exist in this club. An administrator must review this identity conflict.");
  return memberships[0] ?? null;
}

export async function resolveOwnedSessionPlayer(db: IdentityDb, { userId, clubIds, playerId, profileClubId }: { userId: string; clubIds: string[]; playerId?: string | null; profileClubId?: string | null }) {
  if (!clubIds.length || (profileClubId && !clubIds.includes(profileClubId))) return null;
  const memberships = await db.clubMember.findMany({ where: {
    ownerUserId: userId, archivedAt: null, retiredByAdmissionEventId: null,
    clubId: profileClubId ?? { in: clubIds }, ...(playerId ? { playerId } : {}), player: { isActive: true },
  }, include: { player: true } });
  const eligible = [];
  for (const member of memberships) {
    const access = await db.clubAccess.findUnique({ where: { clubId_userId: { clubId: member.clubId, userId } }, select: { status: true } });
    if (access?.status === "ACTIVE") eligible.push(member);
  }
  if (eligible.length > 1) throw new IdentityConflictError("Choose the club and player profile for this session.");
  return eligible[0]?.player ?? null;
}

export async function getAccountClubContext(db: IdentityDb, { userId, clubId, isGlobalAdmin = false }: { userId: string; clubId: string; isGlobalAdmin?: boolean }) {
  const [club, access, membership] = await Promise.all([
    db.club.findUnique({ where: { id: clubId }, select: { id: true, createdById: true, isTutorial: true, tutorialOwnerId: true } }),
    db.clubAccess.findUnique({ where: { clubId_userId: { clubId, userId } } }),
    getOwnedClubPlayer(db, { userId, clubId }),
  ]);
  const isOwner = club?.createdById === userId && access?.status === "ACTIVE" && ["ADMIN", "OWNER"].includes(access.role);
  const role = isOwner ? ClubRole.OWNER : access?.status === "ACTIVE" ? access.role : null;
  return {
    club, access, membership, player: membership?.player ?? null, role, isOwner,
    canAccess: !!club && (isGlobalAdmin || access?.status === "ACTIVE"),
    canAdmin: !!club && (isGlobalAdmin || isOwner || isClubAdminRole(role)),
    canOperate: !!club && (isGlobalAdmin || isOwner || isClubOperatorRole(role)),
  };
}
