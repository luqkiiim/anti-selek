import type { Prisma } from "@prisma/client";

export interface SkipNextPlayer {
  playerId: string;
  skipNextMatchAt?: Date | string | null;
}

export function hasPendingSkipNextMatch(player: SkipNextPlayer) {
  return player.skipNextMatchAt !== null && player.skipNextMatchAt !== undefined;
}

export function getPendingSkipNextUserIds(players: readonly SkipNextPlayer[]) {
  return new Set(
    players
      .filter(hasPendingSkipNextMatch)
      .map((player) => player.playerId)
  );
}

export function getSkippedSelectionUserIds(
  selectedUserIds: readonly string[],
  pendingSkipUserIds: ReadonlySet<string>,
  ignoredUserIds: ReadonlySet<string> = new Set()
) {
  return selectedUserIds.filter(
    (playerId) => pendingSkipUserIds.has(playerId) && !ignoredUserIds.has(playerId)
  );
}

export async function consumeSkipNextMatches(
  tx: Prisma.TransactionClient,
  {
    sessionId,
    userIds,
    consumedAt = new Date(),
  }: {
    sessionId: string;
    userIds: readonly string[];
    consumedAt?: Date;
  }
) {
  const uniqueUserIds = Array.from(new Set(userIds));

  if (uniqueUserIds.length === 0) {
    return;
  }

  await tx.sessionPlayer.updateMany({
    where: {
      sessionId,
      playerId: { in: uniqueUserIds },
      skipNextMatchAt: { not: null },
    },
    data: {
      skipNextMatchAt: null,
      skipNextMatchRequestedById: null,
      matchmakingMatchesCredit: { increment: 1 },
      availableSince: consumedAt,
      arrivalPriorityAt: null,
    },
  });
}
