import { serializeAvatarEntity } from "@/lib/avatar";
import { isClubAdminRole } from "@/lib/clubRoles";
import { prisma } from "@/lib/prisma";
import { getClubEloByUserId, withClubElo } from "@/lib/clubElo";
import {
  getPlayerClubBadges,
  withPlayerClubBadges,
} from "@/lib/sessionCollab";
import { getTutorialClubDisplayName } from "@/lib/tutorialPlayground";
import { SessionClubStatus } from "@/types/enums";
import { SessionRouteError } from "./sessionRouteShared";

export async function listSessionsForClub({
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
    viewerIsAdmin || isClubAdminRole(membership?.role)
      ? [SessionClubStatus.ACCEPTED, SessionClubStatus.PENDING]
      : [SessionClubStatus.ACCEPTED];
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
  const clubEloByUserId = await getClubEloByUserId(communityId, userIds);
  const communityIds = Array.from(
    new Set(
      sessions.flatMap((session) => [
        ...(session.communityId ? [session.communityId] : []),
        ...session.sessionCommunities.map((link) => link.communityId),
      ])
    )
  );
  const badgesByUserId = await getPlayerClubBadges(
    prisma,
    communityIds,
    userIds
  );

  return sessions.map((session) => {
    const currentClubLink = session.sessionCommunities.find(
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
            ? withPlayerClubBadges(
                session.players,
                badgesByUserId,
                communityId
              )
            : withClubElo(session.players, clubEloByUserId)
        ).map((player) => ({
          ...player,
          user: serializeAvatarEntity(player.user),
        })),
      collabStatus:
        currentClubLink?.role === "PARTNER"
          ? currentClubLink.status
          : partnerLink?.status ?? SessionClubStatus.ACCEPTED,
      communities: session.sessionCommunities.map((link) => ({
        id: link.community.id,
        name: getTutorialClubDisplayName(link.community),
        role: link.role,
        status: link.status,
      })),
    };
  });
}
