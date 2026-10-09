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

/**
 * Automatic claims may add membership to an already-owned Player, but may not
 * give one Account a second nonretired sporting identity across disjoint clubs.
 * Call this inside the admission writer reservation before any ownership read.
 */
export async function assertNoOtherOwnedPlayer(db: Prisma.TransactionClient, userId: string, playerId: string) {
  const existing = await db.player.findFirst({
    where: { ownerUserId: userId, id: { not: playerId }, ...nonretiredPlayer },
    select: { id: true },
  });
  if (existing) throw new IdentityConflictError("This account already owns a different nonretired Player. Ask an administrator to review the identity before claiming another profile.");
}

/** Writes only the new ownership column: preserve every legacy value and timestamp. */
export async function linkUnownedPlayer(db: Prisma.TransactionClient, playerId: string, userId: string) {
  await assertNoOtherOwnedPlayer(db, userId, playerId);
  const linked = await db.$executeRaw`UPDATE "User" SET "ownerUserId" = ${userId} WHERE "id" = ${playerId} AND "ownerUserId" IS NULL`;
  if (linked !== 1) throw new IdentityConflictError("Another account has claimed this Player. Refresh before trying again.");
}

export async function getOwnedPlayer(db: IdentityDb, { userId, playerId }: { userId: string; playerId: string }) {
  return db.player.findFirst({ where: { id: playerId, ownerUserId: userId, ...nonretiredPlayer } });
}

/** Never select an arbitrary legacy identity when an account has conflicting memberships. */
export async function getOwnedClubPlayer(db: IdentityDb, { userId, clubId }: { userId: string; clubId: string }) {
  const memberships = await db.clubMember.findMany({
    where: { clubId, retiredByAdmissionEventId: null, player: { ownerUserId: userId } }, include: { player: true }, take: 2,
  });
  if (memberships.length > 1) throw new IdentityConflictError("Multiple owned profiles exist in this club. An administrator must review this identity conflict.");
  return memberships[0] ?? null;
}

export async function resolveOwnedSessionPlayer(db: IdentityDb, { userId, clubIds, playerId }: { userId: string; clubIds: string[]; playerId?: string | null }) {
  const players = await db.player.findMany({ where: {
    ownerUserId: userId,
    AND: [nonretiredPlayer],
    ...(playerId ? { id: playerId } : {}),
    ...(clubIds.length ? { clubMemberships: { some: { clubId: { in: clubIds } } } } : {}),
  }, take: 2 });
  if (players.length > 1) throw new IdentityConflictError("Choose which owned player profile will participate in this session.");
  return players[0] ?? null;
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
