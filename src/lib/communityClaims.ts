import type { Prisma } from "@prisma/client";
import {
  getHighestCommunityRole,
  normalizeCommunityRole,
  type CommunityRoleValue,
} from "./communityRoles";
import { deleteDisposableUnclaimedUsers } from "./sessionLifecycle";
import { ClaimRequestStatus } from "../types/enums";

const COMMUNITY_MATCH_USER_FIELDS = [
  "team1User1Id",
  "team1User2Id",
  "team2User1Id",
  "team2User2Id",
] as const;

export class CommunityClaimError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "CommunityClaimError";
    this.statusCode = statusCode;
  }
}

export function mergeCommunityRoles(
  requesterRole: CommunityRoleValue,
  targetRole: CommunityRoleValue
): CommunityRoleValue {
  return getHighestCommunityRole(requesterRole, targetRole);
}

export function isClaimableCommunityPlaceholder(user: {
  isClaimed: boolean;
  email: string | null;
}): boolean {
  return !user.isClaimed && user.email === null;
}

interface ApproveCommunityClaimArgs {
  communityId: string;
  requestId: string;
  reviewerUserId: string;
}

interface ClaimTransferMember {
  communityId: string;
  userId: string;
}

async function getClaimTransferMembers(
  tx: Prisma.TransactionClient,
  targetUserId: string,
  fallbackCommunityId: string
): Promise<ClaimTransferMember[]> {
  const offlineIdentityMember = await tx.offlineIdentityMember.findUnique({
    where: { userId: targetUserId },
    include: {
      offlineIdentity: {
        include: {
          members: {
            select: {
              communityId: true,
              userId: true,
            },
          },
        },
      },
    },
  });

  if (!offlineIdentityMember) {
    return [{ communityId: fallbackCommunityId, userId: targetUserId }];
  }

  return offlineIdentityMember.offlineIdentity.members;
}

export async function approveCommunityClaimRequest(
  tx: Prisma.TransactionClient,
  { communityId, requestId, reviewerUserId }: ApproveCommunityClaimArgs
) {
  const claimRequest = await tx.claimRequest.findUnique({
    where: { id: requestId },
    include: {
      requester: {
        select: {
          id: true,
          name: true,
          email: true,
          isClaimed: true,
        },
      },
      target: {
        select: {
          id: true,
          name: true,
          email: true,
          isClaimed: true,
          gender: true,
          partnerPreference: true,
          mixedSideOverride: true,
        },
      },
    },
  });

  if (!claimRequest || claimRequest.communityId !== communityId) {
    throw new CommunityClaimError("Claim request not found", 404);
  }

  if (claimRequest.status !== ClaimRequestStatus.PENDING) {
    throw new CommunityClaimError("Claim request is no longer pending", 409);
  }

  if (!claimRequest.requester.isClaimed) {
    throw new CommunityClaimError("Only claimed accounts can receive a profile merge", 400);
  }

  if (!isClaimableCommunityPlaceholder(claimRequest.target)) {
    throw new CommunityClaimError(
      "Only unclaimed placeholder profiles without email can be approved",
      400
    );
  }

  const transferMembers = await getClaimTransferMembers(
    tx,
    claimRequest.targetUserId,
    communityId
  );
  const transferCommunityIds = Array.from(
    new Set(transferMembers.map((member) => member.communityId))
  );
  if (
    transferCommunityIds.length !== 1 ||
    transferCommunityIds[0] !== communityId
  ) {
    throw new CommunityClaimError(
      "Linked profiles span multiple clubs. Manual merge required.",
      409
    );
  }

  const transferTargetUserIds = Array.from(
    new Set(transferMembers.map((member) => member.userId))
  );

  const [requesterMembership, targetMemberships, communitySessions] = await Promise.all([
    tx.communityMember.findUnique({
      where: {
        communityId_userId: {
          communityId,
          userId: claimRequest.requesterUserId,
        },
      },
      select: {
        role: true,
        elo: true,
      },
    }),
    tx.communityMember.findMany({
      where: {
        OR: transferMembers.map((member) => ({
          communityId: member.communityId,
          userId: member.userId,
        })),
      },
      select: {
        communityId: true,
        userId: true,
        role: true,
      },
    }),
    tx.session.findMany({
      where: {
        OR: [
          { communityId: { in: transferCommunityIds } },
          {
            sessionCommunities: {
              some: {
                communityId: { in: transferCommunityIds },
                status: "ACCEPTED",
              },
            },
          },
        ],
      },
      select: {
        id: true,
        name: true,
      },
    }),
  ]);

  if (!requesterMembership) {
    throw new CommunityClaimError(
      "Requester must already be a member of this club",
      409
    );
  }

  if (targetMemberships.length !== transferMembers.length) {
    throw new CommunityClaimError("Target profile is no longer in this club", 409);
  }

  const communitySessionIds = communitySessions.map((session) => session.id);
  const targetMembershipByCommunityAndUser = new Map(
    targetMemberships.map((membership) => [
      `${membership.communityId}:${membership.userId}`,
      membership,
    ])
  );

  if (requesterMembership.elo !== 1000) {
    throw new CommunityClaimError(
      "Requester already has club rating changes. Manual merge required.",
      409
    );
  }

  const requesterExistingMemberships = await tx.communityMember.findMany({
    where: {
      communityId: { in: transferCommunityIds },
      userId: claimRequest.requesterUserId,
    },
    select: {
      communityId: true,
      elo: true,
    },
  });
  const unexpectedRequesterMembership = requesterExistingMemberships.find(
    (membership) => membership.communityId !== communityId
  );
  if (unexpectedRequesterMembership) {
    throw new CommunityClaimError(
      "Requester already belongs to a linked club. Manual merge required.",
      409
    );
  }

  if (communitySessionIds.length > 0) {
    const conflictingSessionPlayer = await tx.sessionPlayer.findFirst({
      where: {
        sessionId: { in: communitySessionIds },
        userId: claimRequest.requesterUserId,
      },
      select: {
        session: {
          select: {
            name: true,
          },
        },
      },
    });

    if (conflictingSessionPlayer) {
      throw new CommunityClaimError(
        `Requester already has tournament history in ${conflictingSessionPlayer.session.name}. Manual merge required.`,
        409
      );
    }
  }

  const reviewedAt = new Date();

  await tx.communityMember.delete({
    where: {
      communityId_userId: {
        communityId,
        userId: claimRequest.requesterUserId,
      },
    },
  });

  for (const member of transferMembers) {
    const targetMembership = targetMembershipByCommunityAndUser.get(
      `${member.communityId}:${member.userId}`
    );
    if (!targetMembership) continue;

    await tx.communityMember.update({
      where: {
        communityId_userId: {
          communityId: member.communityId,
          userId: member.userId,
        },
      },
      data: {
        userId: claimRequest.requesterUserId,
        role:
          member.communityId === communityId
            ? mergeCommunityRoles(
                normalizeCommunityRole(requesterMembership.role),
                normalizeCommunityRole(targetMembership.role)
              )
            : targetMembership.role,
      },
    });
  }

  if (communitySessionIds.length > 0) {
    await tx.sessionPlayer.updateMany({
      where: {
        sessionId: { in: communitySessionIds },
        userId: { in: transferTargetUserIds },
      },
      data: {
        userId: claimRequest.requesterUserId,
      },
    });

    for (const field of COMMUNITY_MATCH_USER_FIELDS) {
      await tx.match.updateMany({
        where: {
          sessionId: { in: communitySessionIds },
          [field]: { in: transferTargetUserIds },
        },
        data: {
          [field]: claimRequest.requesterUserId,
        },
      });
    }

    await tx.match.updateMany({
      where: {
        sessionId: { in: communitySessionIds },
        scoreSubmittedByUserId: { in: transferTargetUserIds },
      },
      data: {
        scoreSubmittedByUserId: claimRequest.requesterUserId,
      },
    });
  }

  await tx.matchEloAdjustment.updateMany({
    where: {
      communityId: { in: transferCommunityIds },
      userId: { in: transferTargetUserIds },
    },
    data: {
      userId: claimRequest.requesterUserId,
    },
  });

  await tx.user.update({
    where: { id: claimRequest.requesterUserId },
    data: {
      gender: claimRequest.target.gender,
      partnerPreference: claimRequest.target.partnerPreference,
      mixedSideOverride: claimRequest.target.mixedSideOverride,
    },
  });

  await tx.claimRequest.update({
    where: { id: claimRequest.id },
    data: {
      status: ClaimRequestStatus.APPROVED,
      reviewedById: reviewerUserId,
      reviewedAt,
    },
  });

  await tx.claimRequest.updateMany({
    where: {
      communityId,
      status: ClaimRequestStatus.PENDING,
      NOT: { id: claimRequest.id },
      OR: [
        { requesterUserId: claimRequest.requesterUserId },
        { targetUserId: { in: transferTargetUserIds } },
      ],
    },
    data: {
      status: ClaimRequestStatus.REJECTED,
      reviewedById: reviewerUserId,
      reviewedAt,
    },
  });

  const offlineIdentityMembers = await tx.offlineIdentityMember.findMany({
    where: { userId: { in: transferTargetUserIds } },
    select: { offlineIdentityId: true },
  });
  const offlineIdentityIds = Array.from(
    new Set(offlineIdentityMembers.map((member) => member.offlineIdentityId))
  );
  if (offlineIdentityIds.length > 0) {
    await tx.offlineIdentity.updateMany({
      where: { id: { in: offlineIdentityIds } },
      data: {
        resolvedUserId: claimRequest.requesterUserId,
        resolvedAt: reviewedAt,
      },
    });
    await tx.offlineIdentityMember.deleteMany({
      where: { offlineIdentityId: { in: offlineIdentityIds } },
    });
  }

  await deleteDisposableUnclaimedUsers(tx, transferTargetUserIds);

  return {
    id: claimRequest.id,
    status: ClaimRequestStatus.APPROVED,
    requesterUserId: claimRequest.requester.id,
    requesterName: claimRequest.requester.name,
    targetUserId: claimRequest.target.id,
    targetName: claimRequest.target.name,
    reviewedAt,
  };
}
