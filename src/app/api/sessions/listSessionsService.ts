import { prisma } from "@/lib/prisma";
import { getCommunityEloByUserId, withCommunityElo } from "@/lib/communityElo";
import { SessionRouteError } from "./sessionRouteShared";

export async function listSessionsForCommunity({
  communityId,
  viewerId,
  viewerIsAdmin,
}: {
  communityId: string;
  viewerId: string;
  viewerIsAdmin: boolean;
}) {
  const membership = await prisma.communityMember.findUnique({
    where: {
      communityId_userId: {
        communityId,
        userId: viewerId,
      },
    },
  });

  if (!membership && !viewerIsAdmin) {
    throw new SessionRouteError("Not authorized for this community", 403);
  }

  const sessions = await prisma.session.findMany({
    where: { communityId },
    orderBy: { createdAt: "desc" },
    include: {
      courts: true,
      players: {
        include: { user: { select: { id: true, name: true, elo: true } } },
      },
    },
  });

  if (sessions.length === 0) {
    return sessions;
  }

  const userIds = Array.from(
    new Set(sessions.flatMap((session) => session.players.map((player) => player.userId)))
  );
  const communityEloByUserId = await getCommunityEloByUserId(communityId, userIds);

  return sessions.map((session) => ({
    ...session,
    players: withCommunityElo(session.players, communityEloByUserId),
  }));
}
