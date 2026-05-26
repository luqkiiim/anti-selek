import type { Prisma, PrismaClient } from "@prisma/client";
import { CommunityRole } from "@/types/enums";

type DbClient = Prisma.TransactionClient | PrismaClient;

export interface CommunityAdminAccess {
  createdById: string;
  isGlobalAdmin: boolean;
  isOwner: boolean;
  membershipRole: string | null;
  canAdmin: boolean;
}

export async function getCommunityAdminAccess(
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
): Promise<CommunityAdminAccess | null> {
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
      isGlobalAdmin || isOwner || membershipRole === CommunityRole.ADMIN,
  };
}

export async function canAdminCommunity(
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
      await getCommunityAdminAccess(tx, {
        communityId,
        userId,
        isGlobalAdmin,
      })
    )?.canAdmin === true
  );
}
