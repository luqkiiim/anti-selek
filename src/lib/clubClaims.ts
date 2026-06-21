import type { Prisma } from "@prisma/client";
import {
  getHighestClubRole,
  normalizeClubRole,
  type ClubRoleValue,
} from "./clubRoles";
import { deleteDisposableUnclaimedUsers } from "./sessionLifecycle";
import { ClaimRequestStatus } from "../types/enums";

const COMMUNITY_MATCH_USER_FIELDS = [
  "team1User1Id",
  "team1User2Id",
  "team2User1Id",
  "team2User2Id",
] as const;

export class ClubClaimError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "ClubClaimError";
    this.statusCode = statusCode;
  }
}

export function mergeClubRoles(
  requesterRole: ClubRoleValue,
  targetRole: ClubRoleValue
): ClubRoleValue {
  return getHighestClubRole(requesterRole, targetRole);
}

export function isClaimableClubPlaceholder(user: {
  isClaimed: boolean;
  email: string | null;
}): boolean {
  return !user.isClaimed && user.email === null;
}

interface ApproveClubClaimArgs {
  clubId: string;
  requestId: string;
  reviewerUserId: string;
}

interface ClaimTransferMember {
  clubId: string;
  userId: string;
}

async function getClaimTransferMembers(
  tx: Prisma.TransactionClient,
  targetUserId: string,
  fallbackClubId: string
): Promise<ClaimTransferMember[]> {
  const offlineIdentityMember = await tx.offlineIdentityMember.findUnique({
    where: { userId: targetUserId },
    include: {
      offlineIdentity: {
        include: {
          members: {
            select: {
              clubId: true,
              userId: true,
            },
          },
        },
      },
    },
  });

  if (!offlineIdentityMember) {
    return [{ clubId: fallbackClubId, userId: targetUserId }];
  }

  return offlineIdentityMember.offlineIdentity.members;
}

export async function approveClubClaimRequest(
  tx: Prisma.TransactionClient,
  { clubId, requestId, reviewerUserId }: ApproveClubClaimArgs
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

  if (!claimRequest || claimRequest.clubId !== clubId) {
    throw new ClubClaimError("Claim request not found", 404);
  }

  if (claimRequest.status !== ClaimRequestStatus.PENDING) {
    throw new ClubClaimError("Claim request is no longer pending", 409);
  }

  if (!claimRequest.requester.isClaimed) {
    throw new ClubClaimError("Only claimed accounts can receive a profile merge", 400);
  }

  if (!isClaimableClubPlaceholder(claimRequest.target)) {
    throw new ClubClaimError(
      "Only unclaimed placeholder profiles without email can be approved",
      400
    );
  }

  const transferMembers = await getClaimTransferMembers(
    tx,
    claimRequest.targetUserId,
    clubId
  );
  const transferClubIds = Array.from(
    new Set(transferMembers.map((member) => member.clubId))
  );
  if (
    transferClubIds.length !== 1 ||
    transferClubIds[0] !== clubId
  ) {
    throw new ClubClaimError(
      "Linked profiles span multiple clubs. Manual merge required.",
      409
    );
  }

  const transferTargetUserIds = Array.from(
    new Set(transferMembers.map((member) => member.userId))
  );

  const [requesterMembership, targetMemberships, clubSessions] = await Promise.all([
    tx.clubMember.findUnique({
      where: {
        clubId_userId: {
          clubId,
          userId: claimRequest.requesterUserId,
        },
      },
      select: {
        role: true,
        elo: true,
      },
    }),
    tx.clubMember.findMany({
      where: {
        OR: transferMembers.map((member) => ({
          clubId: member.clubId,
          userId: member.userId,
        })),
      },
      select: {
        clubId: true,
        userId: true,
        role: true,
      },
    }),
    tx.session.findMany({
      where: {
        OR: [
          { clubId: { in: transferClubIds } },
          {
            sessionClubs: {
              some: {
                clubId: { in: transferClubIds },
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
    throw new ClubClaimError(
      "Requester must already be a member of this club",
      409
    );
  }

  if (targetMemberships.length !== transferMembers.length) {
    throw new ClubClaimError("Target profile is no longer in this club", 409);
  }

  const clubSessionIds = clubSessions.map((session) => session.id);
  const targetMembershipByClubAndUser = new Map(
    targetMemberships.map((membership) => [
      `${membership.clubId}:${membership.userId}`,
      membership,
    ])
  );

  if (requesterMembership.elo !== 1000) {
    throw new ClubClaimError(
      "Requester already has club rating changes. Manual merge required.",
      409
    );
  }

  const requesterExistingMemberships = await tx.clubMember.findMany({
    where: {
      clubId: { in: transferClubIds },
      userId: claimRequest.requesterUserId,
    },
    select: {
      clubId: true,
      elo: true,
    },
  });
  const unexpectedRequesterMembership = requesterExistingMemberships.find(
    (membership) => membership.clubId !== clubId
  );
  if (unexpectedRequesterMembership) {
    throw new ClubClaimError(
      "Requester already belongs to a linked club. Manual merge required.",
      409
    );
  }

  if (clubSessionIds.length > 0) {
    const conflictingSessionPlayer = await tx.sessionPlayer.findFirst({
      where: {
        sessionId: { in: clubSessionIds },
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
      throw new ClubClaimError(
        `Requester already has tournament history in ${conflictingSessionPlayer.session.name}. Manual merge required.`,
        409
      );
    }
  }

  const reviewedAt = new Date();

  await tx.clubMember.delete({
    where: {
      clubId_userId: {
        clubId,
        userId: claimRequest.requesterUserId,
      },
    },
  });

  for (const member of transferMembers) {
    const targetMembership = targetMembershipByClubAndUser.get(
      `${member.clubId}:${member.userId}`
    );
    if (!targetMembership) continue;

    await tx.clubMember.update({
      where: {
        clubId_userId: {
          clubId: member.clubId,
          userId: member.userId,
        },
      },
      data: {
        userId: claimRequest.requesterUserId,
        role:
          member.clubId === clubId
            ? mergeClubRoles(
                normalizeClubRole(requesterMembership.role),
                normalizeClubRole(targetMembership.role)
              )
            : targetMembership.role,
      },
    });
  }

  if (clubSessionIds.length > 0) {
    await tx.sessionPlayer.updateMany({
      where: {
        sessionId: { in: clubSessionIds },
        userId: { in: transferTargetUserIds },
      },
      data: {
        userId: claimRequest.requesterUserId,
      },
    });

    for (const field of COMMUNITY_MATCH_USER_FIELDS) {
      await tx.match.updateMany({
        where: {
          sessionId: { in: clubSessionIds },
          [field]: { in: transferTargetUserIds },
        },
        data: {
          [field]: claimRequest.requesterUserId,
        },
      });
    }

    await tx.match.updateMany({
      where: {
        sessionId: { in: clubSessionIds },
        scoreSubmittedByUserId: { in: transferTargetUserIds },
      },
      data: {
        scoreSubmittedByUserId: claimRequest.requesterUserId,
      },
    });
  }

  await tx.matchEloAdjustment.updateMany({
    where: {
      clubId: { in: transferClubIds },
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
      clubId,
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
