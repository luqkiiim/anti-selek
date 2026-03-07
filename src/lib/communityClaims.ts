import type { Prisma } from "@prisma/client";
import { deleteDisposableUnclaimedUsers } from "./sessionLifecycle";
import { ClaimRequestStatus } from "../types/enums";

type CommunityRole = "ADMIN" | "MEMBER";

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
  requesterRole: CommunityRole,
  targetRole: CommunityRole
): CommunityRole {
  return requesterRole === "ADMIN" || targetRole === "ADMIN" ? "ADMIN" : "MEMBER";
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

  const [requesterMembership, targetMembership, communitySessions] = await Promise.all([
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
    tx.communityMember.findUnique({
      where: {
        communityId_userId: {
          communityId,
          userId: claimRequest.targetUserId,
        },
      },
      select: {
        role: true,
      },
    }),
    tx.session.findMany({
      where: { communityId },
      select: {
        id: true,
        code: true,
        name: true,
      },
    }),
  ]);

  if (!requesterMembership) {
    throw new CommunityClaimError(
      "Requester must already be a member of this community",
      409
    );
  }

  if (!targetMembership) {
    throw new CommunityClaimError("Target profile is no longer in this community", 409);
  }

  const communitySessionIds = communitySessions.map((session) => session.id);

  if (requesterMembership.elo !== 1000) {
    throw new CommunityClaimError(
      "Requester already has community Elo changes. Manual merge required.",
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
            code: true,
            name: true,
          },
        },
      },
    });

    if (conflictingSessionPlayer) {
      throw new CommunityClaimError(
        `Requester already has tournament history in ${conflictingSessionPlayer.session.name} (${conflictingSessionPlayer.session.code}). Manual merge required.`,
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

  await tx.communityMember.update({
    where: {
      communityId_userId: {
        communityId,
        userId: claimRequest.targetUserId,
      },
    },
    data: {
      userId: claimRequest.requesterUserId,
      role: mergeCommunityRoles(requesterMembership.role as CommunityRole, targetMembership.role as CommunityRole),
    },
  });

  if (communitySessionIds.length > 0) {
    await tx.sessionPlayer.updateMany({
      where: {
        sessionId: { in: communitySessionIds },
        userId: claimRequest.targetUserId,
      },
      data: {
        userId: claimRequest.requesterUserId,
      },
    });

    for (const field of COMMUNITY_MATCH_USER_FIELDS) {
      await tx.match.updateMany({
        where: {
          sessionId: { in: communitySessionIds },
          [field]: claimRequest.targetUserId,
        },
        data: {
          [field]: claimRequest.requesterUserId,
        },
      });
    }
  }

  await tx.user.update({
    where: { id: claimRequest.requesterUserId },
    data: {
      name: claimRequest.target.name,
      gender: claimRequest.target.gender,
      partnerPreference: claimRequest.target.partnerPreference,
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
        { targetUserId: claimRequest.targetUserId },
      ],
    },
    data: {
      status: ClaimRequestStatus.REJECTED,
      reviewedById: reviewerUserId,
      reviewedAt,
    },
  });

  await deleteDisposableUnclaimedUsers(tx, [claimRequest.targetUserId]);

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
