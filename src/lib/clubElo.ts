import { prisma } from "@/lib/prisma";

export async function getClubEloByUserId(
  clubId: string,
  userIds: string[]
): Promise<Map<string, number>> {
  const uniqueUserIds = Array.from(new Set(userIds));
  if (uniqueUserIds.length === 0) {
    return new Map<string, number>();
  }

  const rows = await prisma.clubMember.findMany({
    where: {
      clubId,
      playerId: { in: uniqueUserIds },
    },
    select: { playerId: true, elo: true },
  });

  return new Map(rows.map((row) => [row.playerId, row.elo]));
}

export function withClubElo<
  T extends { playerId: string; player: { elo: number } }
>(players: T[], eloByUserId: Map<string, number>): T[] {
  return players.map((player) => {
    const elo = eloByUserId.get(player.playerId);
    if (typeof elo !== "number") return player;

    return {
      ...player,
      player: {
        ...player.player,
        elo,
      },
    };
  });
}
