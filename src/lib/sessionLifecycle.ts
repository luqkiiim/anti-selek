import type { Prisma } from "@prisma/client";

export interface CompletedMatchEloChange {
  team1User1Id: string;
  team1User2Id: string;
  team2User1Id: string;
  team2User2Id: string;
  team1EloChange: number | null;
  team2EloChange: number | null;
}

export interface SessionGuestPlayerRow {
  userId: string;
  isGuest: boolean;
}

function applyDelta(map: Map<string, number>, userId: string, delta: number) {
  if (delta === 0) return;
  const next = (map.get(userId) ?? 0) + delta;
  if (next === 0) {
    map.delete(userId);
    return;
  }
  map.set(userId, next);
}

export function computeRollbackEloDeltas(
  matches: CompletedMatchEloChange[],
  isGuestByUserId: Map<string, boolean>
): Map<string, number> {
  const deltas = new Map<string, number>();

  for (const match of matches) {
    const team1ReverseDelta = -(match.team1EloChange ?? 0);
    const team2ReverseDelta = -(match.team2EloChange ?? 0);

    if (isGuestByUserId.get(match.team1User1Id) !== true) {
      applyDelta(deltas, match.team1User1Id, team1ReverseDelta);
    }
    if (isGuestByUserId.get(match.team1User2Id) !== true) {
      applyDelta(deltas, match.team1User2Id, team1ReverseDelta);
    }
    if (isGuestByUserId.get(match.team2User1Id) !== true) {
      applyDelta(deltas, match.team2User1Id, team2ReverseDelta);
    }
    if (isGuestByUserId.get(match.team2User2Id) !== true) {
      applyDelta(deltas, match.team2User2Id, team2ReverseDelta);
    }
  }

  return deltas;
}

export function collectGuestUserIds(sessionPlayers: SessionGuestPlayerRow[]): string[] {
  return Array.from(
    new Set(
      sessionPlayers
        .filter((player) => player.isGuest)
        .map((player) => player.userId)
    )
  );
}

export async function deleteDisposableUnclaimedUsers(
  tx: Prisma.TransactionClient,
  userIds: string[]
): Promise<number> {
  const uniqueUserIds = Array.from(new Set(userIds));
  if (uniqueUserIds.length === 0) {
    return 0;
  }

  const result = await tx.user.deleteMany({
    where: {
      id: { in: uniqueUserIds },
      isClaimed: false,
      email: null,
      clubMemberships: { none: {} },
      sessionPlayers: { none: {} },
      matchesAsTeam1Player1: { none: {} },
      matchesAsTeam1Player2: { none: {} },
      matchesAsTeam2Player1: { none: {} },
      matchesAsTeam2Player2: { none: {} },
    },
  });

  return result.count;
}

export async function deleteEphemeralGuestUsers(
  tx: Prisma.TransactionClient,
  guestUserIds: string[]
): Promise<number> {
  return deleteDisposableUnclaimedUsers(tx, guestUserIds);
}

export async function reverseSessionEloChanges(
  tx: Prisma.TransactionClient,
  {
    sessionId,
    clubId,
  }: {
    sessionId: string;
    clubId: string | null;
  }
): Promise<number> {
  const sessionPlayers = await tx.sessionPlayer.findMany({
    where: { sessionId },
    select: { userId: true, isGuest: true },
  });
  const isGuestByUserId = new Map(
    sessionPlayers.map((player) => [player.userId, player.isGuest])
  );
  const completedMatches = await tx.match.findMany({
    where: { sessionId, status: "COMPLETED" },
    select: {
      id: true,
      team1User1Id: true,
      team1User2Id: true,
      team2User1Id: true,
      team2User2Id: true,
      team1EloChange: true,
      team2EloChange: true,
    },
  });
  const ledgerAdjustments = await tx.matchEloAdjustment.findMany({
    where: { matchId: { in: completedMatches.map((match) => match.id) } },
    select: { clubId: true, userId: true, delta: true },
  });
  const reversedPlayerKeys = new Set<string>();

  if (ledgerAdjustments.length > 0) {
    const reverseDeltaByClubAndUserId = new Map<
      string,
      { clubId: string; userId: string; delta: number }
    >();
    for (const adjustment of ledgerAdjustments) {
      const key = `${adjustment.clubId}:${adjustment.userId}`;
      const current = reverseDeltaByClubAndUserId.get(key) ?? {
        clubId: adjustment.clubId,
        userId: adjustment.userId,
        delta: 0,
      };
      current.delta -= adjustment.delta;
      reverseDeltaByClubAndUserId.set(key, current);
    }

    for (const item of reverseDeltaByClubAndUserId.values()) {
      if (item.delta === 0) continue;
      await tx.clubMember.updateMany({
        where: { clubId: item.clubId, userId: item.userId },
        data: { elo: { increment: item.delta } },
      });
      reversedPlayerKeys.add(`${item.clubId}:${item.userId}`);
    }
  } else {
    const eloReverseDeltaByUserId = computeRollbackEloDeltas(
      completedMatches,
      isGuestByUserId
    );

    for (const [userId, delta] of eloReverseDeltaByUserId.entries()) {
      if (delta === 0) continue;
      if (clubId) {
        await tx.clubMember.updateMany({
          where: { clubId, userId },
          data: { elo: { increment: delta } },
        });
        reversedPlayerKeys.add(`${clubId}:${userId}`);
      } else {
        await tx.user.updateMany({
          where: { id: userId },
          data: { elo: { increment: delta } },
        });
        reversedPlayerKeys.add(userId);
      }
    }
  }

  return reversedPlayerKeys.size;
}
