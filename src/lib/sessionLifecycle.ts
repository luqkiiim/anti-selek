import type { Prisma } from "@prisma/client";

export interface CompletedMatchEloChange {
  team1Player1Id: string;
  team1Player2Id: string;
  team2Player1Id: string;
  team2Player2Id: string;
  team1EloChange: number | null;
  team2EloChange: number | null;
}

export interface SessionGuestPlayerRow {
  playerId: string;
  isGuest: boolean;
}

function applyDelta(map: Map<string, number>, playerId: string, delta: number) {
  if (delta === 0) return;
  const next = (map.get(playerId) ?? 0) + delta;
  if (next === 0) {
    map.delete(playerId);
    return;
  }
  map.set(playerId, next);
}

export function computeRollbackEloDeltas(
  matches: CompletedMatchEloChange[],
  isGuestByUserId: Map<string, boolean>
): Map<string, number> {
  const deltas = new Map<string, number>();

  for (const match of matches) {
    const team1ReverseDelta = -(match.team1EloChange ?? 0);
    const team2ReverseDelta = -(match.team2EloChange ?? 0);

    if (isGuestByUserId.get(match.team1Player1Id) !== true) {
      applyDelta(deltas, match.team1Player1Id, team1ReverseDelta);
    }
    if (isGuestByUserId.get(match.team1Player2Id) !== true) {
      applyDelta(deltas, match.team1Player2Id, team1ReverseDelta);
    }
    if (isGuestByUserId.get(match.team2Player1Id) !== true) {
      applyDelta(deltas, match.team2Player1Id, team2ReverseDelta);
    }
    if (isGuestByUserId.get(match.team2Player2Id) !== true) {
      applyDelta(deltas, match.team2Player2Id, team2ReverseDelta);
    }
  }

  return deltas;
}

export function collectGuestUserIds(sessionPlayers: SessionGuestPlayerRow[]): string[] {
  return Array.from(
    new Set(
      sessionPlayers
        .filter((player) => player.isGuest)
        .map((player) => player.playerId)
    )
  );
}

export async function deleteDisposableUnclaimedUsers(
  tx: Prisma.TransactionClient,
  userIds: string[]
): Promise<number> {
  // Player identities are durable, including unattached legacy/guest records.
  // Phase 1 intentionally disables the old disposable-account cleanup path.
  void tx;
  void userIds;
  return 0;
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
    select: { playerId: true, isGuest: true },
  });
  const isGuestByUserId = new Map(
    sessionPlayers.map((player) => [player.playerId, player.isGuest])
  );
  const completedMatches = await tx.match.findMany({
    where: { sessionId, status: "COMPLETED" },
    select: {
      id: true,
      team1Player1Id: true,
      team1Player2Id: true,
      team2Player1Id: true,
      team2Player2Id: true,
      team1EloChange: true,
      team2EloChange: true,
    },
  });
  const ledgerAdjustments = await tx.matchEloAdjustment.findMany({
    where: { matchId: { in: completedMatches.map((match) => match.id) } },
    select: { clubId: true, playerId: true, delta: true },
  });
  const reversedPlayerKeys = new Set<string>();

  if (ledgerAdjustments.length > 0) {
    const reverseDeltaByClubAndUserId = new Map<
      string,
      { clubId: string; playerId: string; delta: number }
    >();
    for (const adjustment of ledgerAdjustments) {
      const key = `${adjustment.clubId}:${adjustment.playerId}`;
      const current = reverseDeltaByClubAndUserId.get(key) ?? {
        clubId: adjustment.clubId,
        playerId: adjustment.playerId,
        delta: 0,
      };
      current.delta -= adjustment.delta;
      reverseDeltaByClubAndUserId.set(key, current);
    }

    for (const item of reverseDeltaByClubAndUserId.values()) {
      if (item.delta === 0) continue;
      await tx.clubMember.updateMany({
        where: { clubId: item.clubId, playerId: item.playerId },
        data: { elo: { increment: item.delta } },
      });
      reversedPlayerKeys.add(`${item.clubId}:${item.playerId}`);
    }
  } else {
    const eloReverseDeltaByUserId = computeRollbackEloDeltas(
      completedMatches,
      isGuestByUserId
    );

    for (const [playerId, delta] of eloReverseDeltaByUserId.entries()) {
      if (delta === 0) continue;
      if (clubId) {
        await tx.clubMember.updateMany({
          where: { clubId, playerId },
          data: { elo: { increment: delta } },
        });
        reversedPlayerKeys.add(`${clubId}:${playerId}`);
      } else {
        await tx.player.updateMany({
          where: { id: playerId },
          data: { elo: { increment: delta } },
        });
        reversedPlayerKeys.add(playerId);
      }
    }
  }

  return reversedPlayerKeys.size;
}
