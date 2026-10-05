import type { Prisma, PrismaClient } from "@prisma/client";
import { isClubAdminRole } from "@/lib/clubRoles";

type DbClient = Prisma.TransactionClient | PrismaClient;

export interface ClubAdminAccess {
  createdById: string;
  isGlobalAdmin: boolean;
  isOwner: boolean;
  membershipRole: string | null;
  canAdmin: boolean;
}

export async function getClubAdminAccess(
  tx: DbClient,
  {
    clubId,
    userId,
    isGlobalAdmin = false,
  }: {
    clubId: string;
    userId: string;
    isGlobalAdmin?: boolean;
  }
): Promise<ClubAdminAccess | null> {
  const [club, membership] = await Promise.all([
    tx.club.findUnique({
      where: { id: clubId },
      select: { createdById: true },
    }),
    tx.clubAccess.findUnique({
      where: {
        clubId_userId: {
          clubId,
          userId,
        },
      },
      select: { role: true, status: true },
    }),
  ]);

  if (!club) return null;

  const isOwner = club.createdById === userId && membership?.status === "ACTIVE" && ["ADMIN", "OWNER"].includes(membership.role);
  const membershipRole = membership?.status === "ACTIVE" ? membership.role : null;

  return {
    createdById: club.createdById,
    isGlobalAdmin,
    isOwner,
    membershipRole,
    canAdmin:
      isGlobalAdmin || isOwner || isClubAdminRole(membershipRole),
  };
}

export async function canAdminClub(
  tx: DbClient,
  {
    clubId,
    userId,
    isGlobalAdmin = false,
  }: {
    clubId: string;
    userId: string;
    isGlobalAdmin?: boolean;
  }
) {
  return (
    (
      await getClubAdminAccess(tx, {
        clubId,
        userId,
        isGlobalAdmin,
      })
    )?.canAdmin === true
  );
}
