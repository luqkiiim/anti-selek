import type { Prisma, PrismaClient } from "@prisma/client";
import { ClubRole } from "@/types/enums";

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
    communityId,
    userId,
    isGlobalAdmin = false,
  }: {
    communityId: string;
    userId: string;
    isGlobalAdmin?: boolean;
  }
): Promise<ClubAdminAccess | null> {
  const [community, membership] = await Promise.all([
    tx.community.findUnique({
      where: { id: communityId },
      select: { createdById: true },
    }),
    tx.communityMember.findUnique({
      where: {
        communityId_userId: {
          communityId,
          userId,
        },
      },
      select: { role: true },
    }),
  ]);

  if (!community) return null;

  const isOwner = community.createdById === userId;
  const membershipRole = membership?.role ?? null;

  return {
    createdById: community.createdById,
    isGlobalAdmin,
    isOwner,
    membershipRole,
    canAdmin:
      isGlobalAdmin || isOwner || membershipRole === ClubRole.ADMIN,
  };
}

export async function canAdminClub(
  tx: DbClient,
  {
    communityId,
    userId,
    isGlobalAdmin = false,
  }: {
    communityId: string;
    userId: string;
    isGlobalAdmin?: boolean;
  }
) {
  return (
    (
      await getClubAdminAccess(tx, {
        communityId,
        userId,
        isGlobalAdmin,
      })
    )?.canAdmin === true
  );
}
