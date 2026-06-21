import type { Prisma } from "@prisma/client";
import {
  ClaimRequestStatus,
  SessionClubStatus,
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

export class ClubPlayerMergeError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "ClubPlayerMergeError";
    this.statusCode = statusCode;
  }
}

export async function getMergeAffectedSessionIds(
  tx: Prisma.TransactionClient,
  clubId: string
) {
  const sessions = await tx.session.findMany({
    where: {
      OR: [
        { clubId },
        {
          sessionClubs: {
            some: {
              clubId,
              status: {
                in: [
                  SessionClubStatus.PENDING,
                  SessionClubStatus.ACCEPTED,
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
      clubMemberships: { none: {} },
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

export async function mergeDuplicateUnclaimedClubPlayer(
  tx: Prisma.TransactionClient,
  {
    clubId,
    sourceUserId,
    targetUserId,
    reviewerUserId,
  }: {
    clubId: string;
    sourceUserId: string;
    targetUserId: string;
    reviewerUserId: string;
  }
) {
  if (sourceUserId === targetUserId) {
    throw new ClubPlayerMergeError("Choose a different player to merge into");
  }

  const [sourceMembership, targetUser, targetCurrentMembership] =
    await Promise.all([
      tx.clubMember.findUnique({
        where: {
          clubId_userId: {
            clubId,
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
              avatarKey: true,
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
          avatarKey: true,
        },
      }),
      tx.clubMember.findUnique({
        where: {
          clubId_userId: {
            clubId,
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
    throw new ClubPlayerMergeError(
      "Source player must be an unclaimed placeholder in this club",
      404
    );
  }

  if (!targetUser || targetUser.isClaimed || targetUser.email !== null) {
    throw new ClubPlayerMergeError(
      "Target player must be an unclaimed placeholder",
      400
    );
  }

  if (targetCurrentMembership) {
    throw new ClubPlayerMergeError(
      "Target player already belongs to this club",
      409
    );
  }

  const affectedSessionIds = await getMergeAffectedSessionIds(tx, clubId);
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
      throw new ClubPlayerMergeError(
        "Target player already appears in this club's session history",
        409
      );
    }
  }

  const sourceAdjustments = await tx.matchEloAdjustment.findMany({
    where: {
      clubId,
      userId: sourceUserId,
    },
    select: { matchId: true },
  });
  if (sourceAdjustments.length > 0) {
    const ledgerConflict = await tx.matchEloAdjustment.findFirst({
      where: {
        clubId,
        userId: targetUserId,
        matchId: {
          in: sourceAdjustments.map((adjustment) => adjustment.matchId),
        },
      },
      select: { id: true },
    });
    if (ledgerConflict) {
      throw new ClubPlayerMergeError(
        "Target player already has rating ledger rows for this club's matches",
        409
      );
    }
  }

  const reviewedAt = new Date();
  const targetKeepsExistingAvatar = !!targetUser.avatarKey;
  const shouldTransferAvatar =
    !targetKeepsExistingAvatar && !!sourceMembership.user.avatarKey;

  if (shouldTransferAvatar) {
    await tx.user.update({
      where: { id: targetUserId },
      data: { avatarKey: sourceMembership.user.avatarKey },
    });
  }

  if (shouldTransferAvatar || sourceMembership.user.avatarKey) {
    await tx.user.update({
      where: { id: sourceUserId },
      data: { avatarKey: null },
    });
  }

  await tx.clubMember.update({
    where: {
      clubId_userId: {
        clubId,
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
      clubId,
      userId: sourceUserId,
    },
    data: { userId: targetUserId },
  });

  await tx.claimRequest.updateMany({
    where: {
      clubId,
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
    discardedAvatarKey:
      targetKeepsExistingAvatar && sourceMembership.user.avatarKey
        ? sourceMembership.user.avatarKey
        : null,
  };
}
