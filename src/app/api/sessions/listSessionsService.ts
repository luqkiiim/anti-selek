import { serializeAvatarEntity } from "@/lib/avatar";
import { isCommunityAdminRole } from "@/lib/communityRoles";
import { prisma } from "@/lib/prisma";
import { getCommunityEloByUserId, withCommunityElo } from "@/lib/communityElo";
import {
  getPlayerCommunityBadges,
  withPlayerCommunityBadges,
} from "@/lib/sessionCollab";
import { getTutorialCommunityDisplayName } from "@/lib/tutorialPlayground";
import { SessionCommunityStatus } from "@/types/enums";
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
    throw new SessionRouteError("Not authorized for this club", 403);
  }

  const visibleCollabStatuses =
    viewerIsAdmin || isCommunityAdminRole(membership?.role)
      ? [SessionCommunityStatus.ACCEPTED, SessionCommunityStatus.PENDING]
      : [SessionCommunityStatus.ACCEPTED];
  const sessions = await prisma.session.findMany({
    where: {
      OR: [
        { communityId },
        {
          sessionCommunities: {
            some: {
              communityId,
              status: { in: visibleCollabStatuses },
            },
          },
        },
      ],
    },
    orderBy: { createdAt: "desc" },
    include: {
      sessionCommunities: {
        include: {
          community: { select: { id: true, name: true, isTutorial: true } },
        },
      },
      courts: true,
      players: {
        include: {
          user: { select: { id: true, name: true, avatarKey: true, elo: true } },
        },
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
  const communityIds = Array.from(
    new Set(
      sessions.flatMap((session) => [
        ...(session.communityId ? [session.communityId] : []),
        ...session.sessionCommunities.map((link) => link.communityId),
      ])
    )
  );
  const badgesByUserId = await getPlayerCommunityBadges(
    prisma,
    communityIds,
    userIds
  );

  return sessions.map((session) => {
    const currentCommunityLink = session.sessionCommunities.find(
      (link) => link.communityId === communityId
    );
    const partnerLink = session.sessionCommunities.find(
      (link) => link.role === "PARTNER"
    );

    return {
      ...session,
      players:
        (
          session.sessionCommunities.length > 1
            ? withPlayerCommunityBadges(
                session.players,
                badgesByUserId,
                communityId
              )
            : withCommunityElo(session.players, communityEloByUserId)
        ).map((player) => ({
          ...player,
          user: serializeAvatarEntity(player.user),
        })),
      collabStatus:
        currentCommunityLink?.role === "PARTNER"
          ? currentCommunityLink.status
          : partnerLink?.status ?? SessionCommunityStatus.ACCEPTED,
      communities: session.sessionCommunities.map((link) => ({
        id: link.community.id,
        name: getTutorialCommunityDisplayName(link.community),
        role: link.role,
        status: link.status,
      })),
    };
  });
}
