import { canReadClubGlobally } from "@/lib/globalClubViewer";
import type { Session } from "next-auth";
import { getSessionListProfiles, withSessionListProfiles } from "@/lib/sessionListProfiles";
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
  quickAccessPlayerId,
  globalViewerSession,
}: {
  clubId: string;
  viewerId: string;
  viewerIsAdmin: boolean;
  quickAccessPlayerId?: string;
  globalViewerSession?: Session;
}) {
  const canRead = globalViewerSession?.user.id === viewerId && await canReadClubGlobally(globalViewerSession, clubId);
  if (globalViewerSession && !canRead) throw new SessionRouteError("Not authorized for this club", 403);
  const quick = quickAccessPlayerId !== undefined;
  const guestMembership = quick
    ? await prisma.clubMember.findFirst({
        where: {
          clubId,
          playerId: quickAccessPlayerId,
          archivedAt: null,
          ownerUserId: null,
          retiredByAdmissionEventId: null,
          player: { isActive: true },
        },
        select: { id: true },
      })
    : null;
  const membership = quick ? null : await prisma.clubAccess.findUnique({
    where: {
      clubId_userId: {
        clubId,
        userId: viewerId,
      },
    },
  });

  if (quick ? !guestMembership : membership?.status !== "ACTIVE" && !viewerIsAdmin && !canRead) {
    throw new SessionRouteError("Not authorized for this club", 403);
  }

  const visibleCollabStatuses =
    !canRead && !quick && (viewerIsAdmin || isClubAdminRole(membership?.role))
      ? [SessionClubStatus.ACCEPTED, SessionClubStatus.PENDING]
      : [SessionClubStatus.ACCEPTED];
  const sessions = await prisma.session.findMany({
    where: {
      ...(quick ? { isTest: false } : {}),
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
      courts: { where: { isActive: true } },
      players: {
        include: {
          player: { select: { id: true, name: true, avatarKey: true, elo: true } },
        },
      },
    },
  });

  if (sessions.length === 0) {
    return sessions;
  }

  const userIds = Array.from(
    new Set(sessions.filter(session => session.ratingPolicyVersion !== 2).flatMap((session) => session.players.map((player) => player.playerId)))
  );
  const clubEloByUserId = await getClubEloByUserId(clubId, userIds);
  const clubIds = Array.from(
    new Set(
      sessions.filter(session => session.ratingPolicyVersion !== 2).flatMap((session) => [
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

  const profiles = await getSessionListProfiles(prisma, sessions);
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
        (withSessionListProfiles((
          session.ratingPolicyVersion === 2 ? session.players : session.sessionClubs.length > 1
            ? withPlayerClubBadges(
                session.players,
                badgesByUserId,
                clubId
              )
            : withClubElo(session.players, clubEloByUserId)
        ), profiles.get(session.id))).map((player) => ({
          ...player,
          player: serializeAvatarEntity(player.player),
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
