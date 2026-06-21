import { serializeAvatarEntity } from "@/lib/avatar";
import { isClubAdminRole } from "@/lib/clubRoles";
import { prisma } from "@/lib/prisma";
import { getClubEloByUserId, withClubElo } from "@/lib/clubElo";
import {
  getPlayerClubBadges,
  withPlayerClubBadges,
} from "@/lib/sessionCollab";
import { withLegacyClubAliases } from "@/lib/clubContractAliases";
import { getTutorialClubDisplayName } from "@/lib/tutorialPlayground";
import { SessionClubStatus } from "@/types/enums";
import { SessionRouteError } from "./sessionRouteShared";

export async function listSessionsForClub({
  clubId,
  viewerId,
  viewerIsAdmin,
}: {
  clubId: string;
  viewerId: string;
  viewerIsAdmin: boolean;
}) {
  const membership = await prisma.clubMember.findUnique({
    where: {
      clubId_userId: {
        clubId,
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
        { clubId },
        {
          sessionClubs: {
            some: {
              clubId,
              status: { in: visibleCollabStatuses },
            },
          },
        },
      ],
    },
    orderBy: { createdAt: "desc" },
    include: {
      sessionClubs: {
        include: {
          club: { select: { id: true, name: true, isTutorial: true } },
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
  const clubEloByUserId = await getClubEloByUserId(clubId, userIds);
  const clubIds = Array.from(
    new Set(
      sessions.flatMap((session) => [
        ...(session.clubId ? [session.clubId] : []),
        ...session.sessionClubs.map((link) => link.clubId),
      ])
    )
  );
  const badgesByUserId = await getPlayerClubBadges(
    prisma,
    clubIds,
    userIds
  );

  return sessions.map((session) => {
    const currentClubLink = session.sessionClubs.find(
      (link) => link.clubId === clubId
    );
    const partnerLink = session.sessionClubs.find(
      (link) => link.role === "PARTNER"
    );

    return withLegacyClubAliases({
      ...session,
      players:
        (
          session.sessionClubs.length > 1
            ? withPlayerClubBadges(
                session.players,
                badgesByUserId,
                clubId
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
      clubs: session.sessionClubs.map((link) => ({
        id: link.club.id,
        name: getTutorialClubDisplayName(link.club),
        role: link.role,
        status: link.status,
      })),
    });
  });
}
