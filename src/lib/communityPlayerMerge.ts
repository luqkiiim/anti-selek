import type { Prisma } from "@prisma/client";
import {
  ClaimRequestStatus,
  SessionCommunityStatus,
} from "@/types/enums";

const MATCH_USER_FIELDS = [
  "team1User1Id",
  "team1User2Id",
  "team2User1Id",
  "team2User2Id",
] as const;

const QUEUED_MATCH_USER_FIELDS = [
  "team1User1Id",
  "team1User2Id",
  "team2User1Id",
  "team2User2Id",
] as const;

export class CommunityPlayerMergeError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "CommunityPlayerMergeError";
    this.statusCode = statusCode;
  }
}

export async function getMergeAffectedSessionIds(
  tx: Prisma.TransactionClient,
  communityId: string
) {
  const sessions = await tx.session.findMany({
    where: {
      OR: [
        { communityId },
        {
          sessionCommunities: {
            some: {
              communityId,
              status: {
                in: [
                  SessionCommunityStatus.PENDING,
                  SessionCommunityStatus.ACCEPTED,
                ],
              },
            },
          },
        },
      ],
    },
    select: { id: true },
  });

  return sessions.map((session) => session.id);
}

async function deleteDisposableMergedUser(
  tx: Prisma.TransactionClient,
  userId: string
) {
  const queuedMatchReference = await tx.queuedMatch.findFirst({
    where: {
      OR: QUEUED_MATCH_USER_FIELDS.map((field) => ({ [field]: userId })),
    },
    select: { id: true },
  });
  if (queuedMatchReference) return 0;

  const scoreSubmissionReference = await tx.match.findFirst({
    where: { scoreSubmittedByUserId: userId },
    select: { id: true },
  });
  if (scoreSubmissionReference) return 0;

  const result = await tx.user.deleteMany({
    where: {
      id: userId,
      isClaimed: false,
      email: null,
      communities: { none: {} },
      sessionPlayers: { none: {} },
      matchesAsTeam1Player1: { none: {} },
      matchesAsTeam1Player2: { none: {} },
      matchesAsTeam2Player1: { none: {} },
      matchesAsTeam2Player2: { none: {} },
      matchEloAdjustments: { none: {} },
    },
  });

  return result.count;
}

export async function mergeDuplicateUnclaimedCommunityPlayer(
  tx: Prisma.TransactionClient,
  {
    communityId,
    sourceUserId,
    targetUserId,
    reviewerUserId,
  }: {
    communityId: string;
    sourceUserId: string;
    targetUserId: string;
    reviewerUserId: string;
  }
) {
  if (sourceUserId === targetUserId) {
    throw new CommunityPlayerMergeError("Choose a different player to merge into");
  }

  const [sourceMembership, targetUser, targetCurrentMembership] =
    await Promise.all([
      tx.communityMember.findUnique({
        where: {
          communityId_userId: {
            communityId,
            userId: sourceUserId,
          },
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              isClaimed: true,
            },
          },
        },
      }),
      tx.user.findUnique({
        where: { id: targetUserId },
        select: {
          id: true,
          name: true,
          email: true,
          isClaimed: true,
        },
      }),
      tx.communityMember.findUnique({
        where: {
          communityId_userId: {
            communityId,
            userId: targetUserId,
          },
        },
        select: { id: true },
      }),
    ]);

  if (
    !sourceMembership ||
    sourceMembership.user.isClaimed ||
    sourceMembership.user.email !== null
  ) {
    throw new CommunityPlayerMergeError(
      "Source player must be an unclaimed placeholder in this community",
      404
    );
  }

  if (!targetUser || targetUser.isClaimed || targetUser.email !== null) {
    throw new CommunityPlayerMergeError(
      "Target player must be an unclaimed placeholder",
      400
    );
  }

  if (targetCurrentMembership) {
    throw new CommunityPlayerMergeError(
      "Target player already belongs to this community",
      409
    );
  }

  const affectedSessionIds = await getMergeAffectedSessionIds(tx, communityId);
  if (affectedSessionIds.length > 0) {
    const targetSessionPlayer = await tx.sessionPlayer.findFirst({
      where: {
        sessionId: { in: affectedSessionIds },
        userId: targetUserId,
      },
      select: { id: true },
    });
    const targetMatch = await tx.match.findFirst({
      where: {
        sessionId: { in: affectedSessionIds },
        OR: [
          ...MATCH_USER_FIELDS.map((field) => ({ [field]: targetUserId })),
          { scoreSubmittedByUserId: targetUserId },
        ],
      },
      select: { id: true },
    });
    const targetQueuedMatch = await tx.queuedMatch.findFirst({
      where: {
        sessionId: { in: affectedSessionIds },
        OR: QUEUED_MATCH_USER_FIELDS.map((field) => ({
          [field]: targetUserId,
        })),
      },
      select: { id: true },
    });

    if (targetSessionPlayer || targetMatch || targetQueuedMatch) {
      throw new CommunityPlayerMergeError(
        "Target player already appears in this community's session history",
        409
      );
    }
  }

  const sourceAdjustments = await tx.matchEloAdjustment.findMany({
    where: {
      communityId,
      userId: sourceUserId,
    },
    select: { matchId: true },
  });
  if (sourceAdjustments.length > 0) {
    const ledgerConflict = await tx.matchEloAdjustment.findFirst({
      where: {
        communityId,
        userId: targetUserId,
        matchId: {
          in: sourceAdjustments.map((adjustment) => adjustment.matchId),
        },
      },
      select: { id: true },
    });
    if (ledgerConflict) {
      throw new CommunityPlayerMergeError(
        "Target player already has rating ledger rows for this community's matches",
        409
      );
    }
  }

  const reviewedAt = new Date();

  await tx.communityMember.update({
    where: {
      communityId_userId: {
        communityId,
        userId: sourceUserId,
      },
    },
    data: { userId: targetUserId },
  });

  if (affectedSessionIds.length > 0) {
    await tx.sessionPlayer.updateMany({
      where: {
        sessionId: { in: affectedSessionIds },
        userId: sourceUserId,
      },
      data: { userId: targetUserId },
    });

    await tx.match.updateMany({
      where: {
        sessionId: { in: affectedSessionIds },
        scoreSubmittedByUserId: sourceUserId,
      },
      data: { scoreSubmittedByUserId: targetUserId },
    });

    for (const field of MATCH_USER_FIELDS) {
      await tx.match.updateMany({
        where: {
          sessionId: { in: affectedSessionIds },
          [field]: sourceUserId,
        },
        data: { [field]: targetUserId },
      });
    }

    for (const field of QUEUED_MATCH_USER_FIELDS) {
      await tx.queuedMatch.updateMany({
        where: {
          sessionId: { in: affectedSessionIds },
          [field]: sourceUserId,
        },
        data: { [field]: targetUserId },
      });
    }
  }

  await tx.matchEloAdjustment.updateMany({
    where: {
      communityId,
      userId: sourceUserId,
    },
    data: { userId: targetUserId },
  });

  await tx.claimRequest.updateMany({
    where: {
      communityId,
      status: ClaimRequestStatus.PENDING,
      OR: [
        { requesterUserId: sourceUserId },
        { targetUserId: sourceUserId },
      ],
    },
    data: {
      status: ClaimRequestStatus.REJECTED,
      reviewedById: reviewerUserId,
      reviewedAt,
    },
  });

  const deletedSourceUsers = await deleteDisposableMergedUser(tx, sourceUserId);

  return {
    sourceUserId,
    sourceName: sourceMembership.user.name,
    targetUserId,
    targetName: targetUser.name,
    deletedSourceUser: deletedSourceUsers > 0,
  };
}
