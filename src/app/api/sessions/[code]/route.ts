import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { resolveAvatarUrl, serializeAvatarEntity } from "@/lib/avatar";
import { prisma } from "@/lib/prisma";
import { getClubEloByUserId, withClubElo } from "@/lib/clubElo";
import {
  getPlayerClubBadges,
  getSessionAdminMembership,
  getSessionMembership,
  getSessionOperatorMembership,
  withPlayerClubBadges,
} from "@/lib/sessionCollab";
import { MatchStatus } from "@/types/enums";
import { getQueuedMatchUserIds } from "@/lib/sessionQueue";
import { parseMatchmakingReasonJson } from "@/lib/matchmaking/matchReason";
import {
  canQuickAccessSessionRead,
  getQuickAccessDeniedMessage,
  isQuickAccessSession,
} from "@/lib/quickAccess";
import { tryRebuildQueuedMatchForSessionId } from "./queue-match/shared";
import { logError, safeErrorResponse } from "@/lib/errors";
import { withLegacyClubAliases } from "@/lib/clubContractAliases";
import { rateLimit, checkInvalidTargetRateLimit, invalidTargetResponse } from "@/lib/rateLimit";
import { getTutorialClubDisplayName } from "@/lib/tutorialPlayground";

export const dynamic = "force-dynamic";

interface UpdateSessionSettingsRequest {
  autoQueueEnabled?: unknown;
  respectPlayerRest?: unknown;
}

async function getSessionRoute(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { code } = await params;

  if (typeof code !== "string" || code.length === 0) {
    return NextResponse.json({ error: "Invalid request parameters" }, { status: 400 });
  }

  const invalidTargetLimitResponse = await checkInvalidTargetRateLimit(request, "api:sessions:code");

  if (invalidTargetLimitResponse) return invalidTargetLimitResponse;

  const sessionData = await prisma.session.findUnique({
    where: { code },
    include: {
      club: {
        select: {
          id: true,
          isTutorial: true,
          tutorialOwnerId: true,
        },
      },
      courts: {
        include: {
          currentMatch: {
            select: {
              id: true,
              status: true,
              team1ClubId: true,
              team2ClubId: true,
              team1Score: true,
              team2Score: true,
              completedAt: true,
              scoreSubmittedByUserId: true,
              matchmakingReasonJson: true,
              team1User1: { select: { id: true, name: true, avatarKey: true } },
              team1User2: { select: { id: true, name: true, avatarKey: true } },
              team2User1: { select: { id: true, name: true, avatarKey: true } },
              team2User2: { select: { id: true, name: true, avatarKey: true } },
            },
          },
        },
      },
      sessionClubs: {
        include: {
          club: {
            select: {
              id: true,
              name: true,
              avatarKey: true,
              isTutorial: true,
            },
          },
        },
      },
      players: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              avatarKey: true,
              elo: true,
              gender: true,
              partnerPreference: true,
              mixedSideOverride: true,
            },
          },
        },
        orderBy: { sessionPoints: "desc" },
      },
      matches: {
        where: { status: { in: [MatchStatus.COMPLETED, MatchStatus.PENDING_APPROVAL] } },
        select: {
          id: true,
          team1User1Id: true,
          team1User2Id: true,
          team2User1Id: true,
          team2User2Id: true,
          team1ClubId: true,
          team2ClubId: true,
          team1Score: true,
          team2Score: true,
          winnerTeam: true,
          status: true,
          completedAt: true,
        },
      },
      queuedMatch: true,
    },
  });

  if (!sessionData) {
    return invalidTargetResponse(request, "api:sessions:code");
  }
  if (
    sessionData.club?.isTutorial &&
    sessionData.club.tutorialOwnerId !== session.user.id
  ) {
    return invalidTargetResponse(request, "api:sessions:code");
  }
  if (!canQuickAccessSessionRead(session, sessionData)) {
    return invalidTargetResponse(request, "api:sessions:code");
  }

  const membership = await getSessionMembership(prisma, {
    session: sessionData,
    userId: session.user.id,
    acceptedOnly: false,
  });
  const adminMembership = await getSessionAdminMembership(prisma, {
    session: sessionData,
    userId: session.user.id,
    acceptedOnly: false,
  });
  const operatorMembership = await getSessionOperatorMembership(prisma, {
    session: sessionData,
    userId: session.user.id,
    acceptedOnly: true,
  });
  const clubRole = membership?.role ?? null;

  const isSessionPlayer = sessionData.players.some((p) => p.userId === session.user.id);
  const isQuickAccess = isQuickAccessSession(session);
  const canView =
    (!isQuickAccess && session.user.isAdmin) || !!clubRole || isSessionPlayer;
  if (!canView) {
    return invalidTargetResponse(request, "api:sessions:code");
  }

  const linkedClubIds = Array.from(
    new Set(
      [
        ...(sessionData.clubId ? [sessionData.clubId] : []),
        ...sessionData.sessionClubs.map((link) => link.clubId),
      ].filter(Boolean)
    )
  );
  const playerIds = sessionData.players.map((p) => p.userId);
  const players =
    linkedClubIds.length > 1 && sessionData.players.length > 0
      ? withPlayerClubBadges(
          sessionData.players,
          await getPlayerClubBadges(prisma, linkedClubIds, playerIds),
          sessionData.clubId
        )
      : sessionData.clubId && sessionData.players.length > 0
        ? withClubElo(
            sessionData.players,
            await getClubEloByUserId(sessionData.clubId, playerIds)
          )
        : sessionData.players;
  const serializedPlayers = players.map((player) => ({
    ...player,
    user: serializeAvatarEntity(player.user),
  }));

  const queuedMatch = sessionData.queuedMatch
    ? (() => {
        const playerById = new Map(
          serializedPlayers.map((player) => [player.userId, player.user])
        );
        const [team1User1Id, team1User2Id, team2User1Id, team2User2Id] =
          getQueuedMatchUserIds(sessionData.queuedMatch);
        const team1User1 = playerById.get(team1User1Id);
        const team1User2 = playerById.get(team1User2Id);
        const team2User1 = playerById.get(team2User1Id);
        const team2User2 = playerById.get(team2User2Id);

        if (!team1User1 || !team1User2 || !team2User1 || !team2User2) {
          return null;
        }

        return {
          id: sessionData.queuedMatch.id,
          createdAt: sessionData.queuedMatch.createdAt,
          targetPool: sessionData.queuedMatch.targetPool,
          team1ClubId: sessionData.queuedMatch.team1ClubId,
          team2ClubId: sessionData.queuedMatch.team2ClubId,
          matchmakingReason: parseMatchmakingReasonJson(
            sessionData.queuedMatch.matchmakingReasonJson
          ),
          team1User1,
          team1User2,
          team2User1,
          team2User2,
        };
      })()
    : null;
  const courts = sessionData.courts.map((court) => {
    if (!court.currentMatch) {
      return court;
    }

    const { matchmakingReasonJson, ...currentMatch } = court.currentMatch;

    return {
      ...court,
      currentMatch: {
        ...currentMatch,
        team1User1: serializeAvatarEntity(currentMatch.team1User1),
        team1User2: serializeAvatarEntity(currentMatch.team1User2),
        team2User1: serializeAvatarEntity(currentMatch.team2User1),
        team2User2: serializeAvatarEntity(currentMatch.team2User2),
        matchmakingReason: parseMatchmakingReasonJson(matchmakingReasonJson),
      },
    };
  });

  return NextResponse.json(withLegacyClubAliases({
    ...sessionData,
    courts,
    players: serializedPlayers,
    queuedMatch,
    viewerClubRole: clubRole,
    viewerIsQuickAccess: isQuickAccess,
    viewerCanManage:
      !isQuickAccess && (session.user.isAdmin || !!operatorMembership),
    viewerCanUseAdminSessionControls:
      !isQuickAccess && (session.user.isAdmin || !!adminMembership),
    isTutorialClub: sessionData.club?.isTutorial === true,
    tutorialOwnerId: sessionData.club?.tutorialOwnerId ?? null,
    clubs: sessionData.sessionClubs.map((link) => ({
      id: link.club.id,
      name: getTutorialClubDisplayName(link.club),
      avatarUrl: resolveAvatarUrl(link.club.avatarKey),
      role: link.role,
      status: link.status,
    })),
  }));
}

export async function GET(...args: Parameters<typeof getSessionRoute>) {
  try {
    const rateLimitResponse = await rateLimit(args[0], "api:sessions:code:get", { limit: 30, windowMs: 60_000 });
    if (rateLimitResponse) return rateLimitResponse;

    return await getSessionRoute(...args);
  } catch (error) {
    logError("Load session error", error);
    return safeErrorResponse();
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const rateLimitResponse = await rateLimit(request, "api:sessions:code:patch", { limit: 15, windowMs: 60_000 });
    if (rateLimitResponse) return rateLimitResponse;

    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    if (isQuickAccessSession(session)) {
      return NextResponse.json(
        { error: getQuickAccessDeniedMessage() },
        { status: 403 }
      );
    }

    const body =
      (await request.json().catch(() => null)) as UpdateSessionSettingsRequest | null;
    if (
      !body ||
      typeof body.autoQueueEnabled !== "boolean" ||
      typeof body.respectPlayerRest !== "boolean"
    ) {
      return NextResponse.json(
        {
          error:
            "autoQueueEnabled and respectPlayerRest must be true or false",
        },
        { status: 400 }
      );
    }

    const { code } = await params;

    if (typeof code !== "string" || code.length === 0) {
      return NextResponse.json({ error: "Invalid request parameters" }, { status: 400 });
    }

    const invalidTargetLimitResponse = await checkInvalidTargetRateLimit(request, "api:sessions:code");

    if (invalidTargetLimitResponse) return invalidTargetLimitResponse;
    const sessionData = await prisma.session.findUnique({
      where: { code },
      select: {
        id: true,
        clubId: true,
      },
    });

    if (!sessionData) {
      return invalidTargetResponse(request, "api:sessions:code");
    }

    const operatorMembership = await getSessionOperatorMembership(prisma, {
      session: sessionData,
      userId: session.user.id,
      acceptedOnly: true,
    });
    const canManage = session.user.isAdmin || !!operatorMembership;
    if (!canManage) {
      return invalidTargetResponse(request, "api:sessions:code");
    }

    if (!body.autoQueueEnabled) {
      await prisma.$transaction([
        prisma.session.update({
          where: { id: sessionData.id },
          data: {
            autoQueueEnabled: false,
            respectPlayerRest: body.respectPlayerRest,
          },
        }),
        prisma.queuedMatch.deleteMany({
          where: { sessionId: sessionData.id },
        }),
      ]);

      return NextResponse.json({
        autoQueueEnabled: false,
        respectPlayerRest: body.respectPlayerRest,
        queuedMatch: null,
      });
    }

    await prisma.session.update({
      where: { id: sessionData.id },
      data: {
        autoQueueEnabled: true,
        respectPlayerRest: body.respectPlayerRest,
      },
    });

    return NextResponse.json({
      autoQueueEnabled: true,
      respectPlayerRest: body.respectPlayerRest,
      queuedMatch: await tryRebuildQueuedMatchForSessionId(sessionData.id),
    });
  } catch (error) {
    logError("Update session settings error", error);
    return safeErrorResponse();
  }
}
