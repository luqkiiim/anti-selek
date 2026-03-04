import { prisma } from "@/lib/prisma";

export async function getCommunityEloByUserId(
  communityId: string,
  userIds: string[]
): Promise<Map<string, number>> {
  const uniqueUserIds = Array.from(new Set(userIds));
  if (uniqueUserIds.length === 0) {
    return new Map<string, number>();
  }

  const rows = await prisma.communityMember.findMany({
    where: {
      communityId,
      userId: { in: uniqueUserIds },
    },
    select: { userId: true, elo: true },
  });

  return new Map(rows.map((row) => [row.userId, row.elo]));
}

export function withCommunityElo<
  T extends { userId: string; user: { elo: number } }
>(players: T[], eloByUserId: Map<string, number>): T[] {
  return players.map((player) => {
    const elo = eloByUserId.get(player.userId);
    if (typeof elo !== "number") return player;

    return {
      ...player,
      user: {
        ...player.user,
        elo,
      },
    };
  });
}
