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
      communities: { none: {} },
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
