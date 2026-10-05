import { sportingJson } from "@/lib/sportingResponse";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { resolveAvatarUrl, serializeAvatarEntity } from "@/lib/avatar";
import { applyPendingPlayerGroupChangesInTransaction } from "@/lib/playerGroupPreferences";
import { prisma } from "@/lib/prisma";
import { getClubEloByUserId, withClubElo } from "@/lib/clubElo";
import {
  getPlayerClubBadges,
  getSessionAdminMembership,
  isAccountSessionPlayer,
  getSessionMembership,
  getSessionOperatorMembership,
  withPlayerClubBadges,
} from "@/lib/sessionCollab";
import {
  MatchStatus,

  SessionCollabFormat,
  SessionPool,
  SessionScoringType,
  SessionStatus,
} from "@/types/enums";
import { getQueuedMatchUserIds } from "@/lib/sessionQueue";
import { parseMatchmakingReasonJson } from "@/lib/matchmaking/matchReason";
import {
  canQuickAccessSessionRead,
  getQuickAccessDeniedMessage,
  getQuickAccessPlayerId,
  isQuickAccessSession,
} from "@/lib/quickAccess";
import { tryRebuildQueuedMatchForSessionId } from "./queue-match/shared";
import { logError, safeErrorResponse } from "@/lib/errors";
import { withLegacyClubAliases } from "@/lib/clubContractAliases";
import { rateLimit, checkInvalidTargetRateLimit, invalidTargetResponse } from "@/lib/rateLimit";
import { getTutorialClubDisplayName } from "@/lib/tutorialPlayground";
import {
  getLegacySessionModeForSettings,
  getLegacySessionTypeForSettings,
  isValidSessionBalanceMetric,
  isValidSessionMatchmakingStyle,
  isValidSessionPairingMode,
  type SessionSettings,
} from "@/lib/sessionSettings";
import { isValidSessionCrossoverFrequency } from "@/lib/sessionPools";
import { SessionRouteError } from "../sessionRouteShared";
import { getAccountClubContext } from "@/lib/playerIdentity";

export const dynamic = "force-dynamic";

interface UpdateSessionSettingsRequest {
  autoQueueEnabled?: unknown;
  respectPlayerRest?: unknown;
  courtLabels?: unknown;
  gameplaySettings?: unknown;
}

interface ParsedCourtLabel {
  courtNumber: number;
  label: string | null;
}

interface ParsedGameplaySettings extends SessionSettings {
  poolsEnabled: boolean;
  crossoverFrequency: string;
  courtCount: number;
}

function parseCourtLabels(value: unknown): ParsedCourtLabel[] {
  if (!Array.isArray(value)) {
    throw new SessionRouteError("Court labels must be provided as a list", 400);
  }

  const seenCourtNumbers = new Set<number>();
  return value.map((item) => {
    if (!item || typeof item !== "object") {
      throw new SessionRouteError("Invalid court label", 400);
    }
    const candidate = item as { courtNumber?: unknown; label?: unknown };
    if (
      !Number.isInteger(candidate.courtNumber) ||
      (candidate.courtNumber as number) < 1 ||
      (candidate.courtNumber as number) > 10 ||
      (typeof candidate.label !== "string" && candidate.label !== null)
    ) {
      throw new SessionRouteError("Invalid court label", 400);
    }
    const courtNumber = candidate.courtNumber as number;
    if (seenCourtNumbers.has(courtNumber)) {
      throw new SessionRouteError("Court numbers must be unique", 400);
    }
    seenCourtNumbers.add(courtNumber);
    const trimmedLabel = candidate.label?.trim() ?? "";
    if (trimmedLabel.length > 24) {
      throw new SessionRouteError("Court labels must be 24 characters or fewer", 400);
    }
    return { courtNumber, label: trimmedLabel || null };
  });
}

function parseGameplaySettings(value: unknown): ParsedGameplaySettings | null {
  if (value === undefined) return null;
  if (!value || typeof value !== "object") {
    throw new SessionRouteError("Invalid gameplay settings", 400);
  }

  const candidate = value as Record<string, unknown>;
  if (
    !isValidSessionMatchmakingStyle(candidate.matchmakingStyle) ||
    !isValidSessionBalanceMetric(candidate.balanceMetric) ||
    !isValidSessionPairingMode(candidate.pairingMode) ||
    typeof candidate.poolsEnabled !== "boolean" ||
    !isValidSessionCrossoverFrequency(candidate.crossoverFrequency) ||
    !Number.isInteger(candidate.courtCount) ||
    (candidate.courtCount as number) < 1 ||
    (candidate.courtCount as number) > 10
  ) {
    throw new SessionRouteError("Invalid gameplay settings", 400);
  }

  return {
    scoringType: SessionScoringType.POINTS,
    matchmakingStyle: candidate.matchmakingStyle,
    balanceMetric: candidate.balanceMetric,
    pairingMode: candidate.pairingMode,
    poolsEnabled: candidate.poolsEnabled,
    crossoverFrequency: candidate.crossoverFrequency,
    courtCount: candidate.courtCount as number,
  };
}

async function getSessionRoute(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return sportingJson({ error: "Not authenticated" }, { status: 401 });
  }

  const { code } = await params;

  if (typeof code !== "string" || code.length === 0) {
    return sportingJson({ error: "Invalid request parameters" }, { status: 400 });
  }

  const rateLimitResponse = await rateLimit(
    request,
    "api:sessions:code:get",
    {
      applyHighRiskBucket: false,
      identity: session.user.id,
      limit: 120,
      windowMs: 60_000,
    }
  );
  if (rateLimitResponse) return rateLimitResponse;

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
              createdAt: true,
              status: true,
              team1ClubId: true,
              team2ClubId: true,
              team1Score: true,
              team2Score: true,
              completedAt: true,
              scoreSubmittedByUserId: true,
              scoreSubmittedByPlayerId: true,
              matchmakingReasonJson: true,
              courtGroupType: true,
              poolASeatCount: true,
              poolBSeatCount: true,
              team1Player1: { select: { id: true, name: true, avatarKey: true } },
              team1Player2: { select: { id: true, name: true, avatarKey: true } },
              team2Player1: { select: { id: true, name: true, avatarKey: true } },
              team2Player2: { select: { id: true, name: true, avatarKey: true } },
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
          player: {
            select: {
              id: true,
              ownerUserId: true,
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
          createdAt: true,
          team1Player1Id: true,
          team1Player2Id: true,
          team2Player1Id: true,
          team2Player2Id: true,
          team1ClubId: true,
          team2ClubId: true,
          team1Score: true,
          team2Score: true,
          winnerTeam: true,
          status: true,
          completedAt: true,
          scoreSubmittedByUserId: true,
          scoreSubmittedByPlayerId: true,
          courtGroupType: true,
          poolASeatCount: true,
          poolBSeatCount: true,
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
  const hostClubContext = sessionData.clubId
    ? await getAccountClubContext(prisma, {
        userId: session.user.id,
        clubId: sessionData.clubId,
      })
    : null;
  const clubRole = membership?.role ?? null;

  const quickPlayerId = getQuickAccessPlayerId(session);
  const isSessionPlayer = quickPlayerId
    ? sessionData.players.some((player) => player.playerId === quickPlayerId)
    : await isAccountSessionPlayer(prisma, sessionData.id, session.user.id);
  const isQuickAccess = isQuickAccessSession(session);
  const viewerOwnedPlayers = isQuickAccess
    ? []
    : sessionData.players.filter((player) => player.player.ownerUserId === session.user.id);
  const viewerPlayerId = quickPlayerId
    ? sessionData.players.some((player) => player.playerId === quickPlayerId) ? quickPlayerId : null
    : viewerOwnedPlayers.length === 1 ? viewerOwnedPlayers[0].playerId : null;
  const viewerUserId = isQuickAccess ? null : session.user.id;
  const canView =
    (!isQuickAccess && session.user.isAdmin) || !!clubRole || isSessionPlayer;
  if (!canView) {
    return invalidTargetResponse(request, "api:sessions:code");
  }

  const canRequestRollback =
    !isQuickAccess &&
    sessionData.status === SessionStatus.COMPLETED &&
    !sessionData.isTest &&
    sessionData.club?.isTutorial !== true &&
    (session.user.isAdmin || hostClubContext?.canAdmin === true);
  const latestCompleted = canRequestRollback
    ? await prisma.session.findFirst({
        where: {
          clubId: sessionData.clubId,
          status: SessionStatus.COMPLETED,
          isTest: false,
        },
        orderBy: [{ endedAt: "desc" }, { createdAt: "desc" }],
        select: { id: true },
      })
    : null;
  const viewerCanRollback = canRequestRollback && latestCompleted?.id === sessionData.id;

  const linkedClubIds = Array.from(
    new Set(
      [
        ...(sessionData.clubId ? [sessionData.clubId] : []),
        ...sessionData.sessionClubs.map((link) => link.clubId),
      ].filter(Boolean)
    )
  );
  const playerIds = sessionData.players.map((p) => p.playerId);
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
    ...(sessionData.status === SessionStatus.COMPLETED
      ? { isPaused: false, pausedAt: null }
      : {}),
    player: serializeAvatarEntity({
      id: player.player.id,
      name: player.player.name,
      avatarKey: player.player.avatarKey,
      elo: player.player.elo,
      gender: player.player.gender,
      partnerPreference: player.player.partnerPreference,
      mixedSideOverride: player.player.mixedSideOverride,
    }),
  }));

  const queuedMatch = sessionData.queuedMatch
    ? (() => {
        const playerById = new Map(
          serializedPlayers.map((player) => [player.playerId, player.player])
        );
        const [team1Player1Id, team1Player2Id, team2Player1Id, team2Player2Id] =
          getQueuedMatchUserIds(sessionData.queuedMatch);
        const team1Player1 = playerById.get(team1Player1Id);
        const team1Player2 = playerById.get(team1Player2Id);
        const team2Player1 = playerById.get(team2Player1Id);
        const team2Player2 = playerById.get(team2Player2Id);

        if (!team1Player1 || !team1Player2 || !team2Player1 || !team2Player2) {
          return null;
        }

        return {
          id: sessionData.queuedMatch.id,
          createdAt: sessionData.queuedMatch.createdAt,
          targetPool: sessionData.queuedMatch.targetPool,
          courtGroupType: sessionData.queuedMatch.courtGroupType,
          poolASeatCount: sessionData.queuedMatch.poolASeatCount,
          poolBSeatCount: sessionData.queuedMatch.poolBSeatCount,
          isAutomatic: sessionData.queuedMatch.isAutomatic,
          team1ClubId: sessionData.queuedMatch.team1ClubId,
          team2ClubId: sessionData.queuedMatch.team2ClubId,
          matchmakingReason: parseMatchmakingReasonJson(
            sessionData.queuedMatch.matchmakingReasonJson
          ),
          team1Player1,
          team1Player2,
          team2Player1,
          team2Player2,
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
        team1Player1: serializeAvatarEntity(currentMatch.team1Player1),
        team1Player2: serializeAvatarEntity(currentMatch.team1Player2),
        team2Player1: serializeAvatarEntity(currentMatch.team2Player1),
        team2Player2: serializeAvatarEntity(currentMatch.team2Player2),
        matchmakingReason: parseMatchmakingReasonJson(matchmakingReasonJson),
      },
    };
  });

  return sportingJson(withLegacyClubAliases({
    ...sessionData,
    courts,
    players: serializedPlayers,
    queuedMatch,
    viewerClubRole: clubRole,
    viewerUserId,
    viewerPlayerId,
    viewerIsQuickAccess: isQuickAccess,
    viewerCanManage:
      !isQuickAccess && (session.user.isAdmin || !!operatorMembership),
    viewerCanUseAdminSessionControls:
      !isQuickAccess && (session.user.isAdmin || !!adminMembership),
    viewerCanDelete:
      !isQuickAccess &&
      (sessionData.status !== SessionStatus.COMPLETED || sessionData.isTest) &&
      (session.user.isAdmin || hostClubContext?.canAdmin === true || hostClubContext?.canOperate === true),
    viewerCanRollback,
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

function privateNoStore(response: NextResponse) {
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  return response;
}

export async function GET(...args: Parameters<typeof getSessionRoute>) {
  try {
    return privateNoStore(await getSessionRoute(...args));
  } catch (error) {
    logError("Load session error", error);
    return privateNoStore(safeErrorResponse());
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
      return sportingJson({ error: "Not authenticated" }, { status: 401 });
    }
    if (isQuickAccessSession(session)) {
      return sportingJson(
        { error: getQuickAccessDeniedMessage() },
        { status: 403 }
      );
    }

    const body = (await request.json().catch(
      () => null
    )) as UpdateSessionSettingsRequest | null;
    if (
      !body ||
      typeof body.autoQueueEnabled !== "boolean" ||
      typeof body.respectPlayerRest !== "boolean"
    ) {
      return sportingJson(
        {
          error:
            "autoQueueEnabled and respectPlayerRest must be true or false",
        },
        { status: 400 }
      );
    }
    const autoQueueEnabled = body.autoQueueEnabled;
    const respectPlayerRest = body.respectPlayerRest;
    const courtLabels = parseCourtLabels(body.courtLabels ?? []);
    const gameplaySettings = parseGameplaySettings(body.gameplaySettings);

    const { code } = await params;

    if (typeof code !== "string" || code.length === 0) {
      return sportingJson({ error: "Invalid request parameters" }, { status: 400 });
    }

    const invalidTargetLimitResponse = await checkInvalidTargetRateLimit(request, "api:sessions:code");

    if (invalidTargetLimitResponse) return invalidTargetLimitResponse;
    const sessionData = await prisma.session.findUnique({
      where: { code },
      select: {
        id: true,
        clubId: true,
        status: true,
        collabFormat: true,
        poolAssignmentsInitialized: true,
        courts: {
          select: {
            id: true,
            courtNumber: true,
            currentMatchId: true,
            _count: { select: { matches: true } },
          },
        },
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

    if (gameplaySettings && sessionData.status !== SessionStatus.WAITING) {
      return sportingJson(
        { error: "Reset the tournament before changing gameplay settings" },
        { status: 409 }
      );
    }
    if (
      gameplaySettings?.poolsEnabled &&
      sessionData.collabFormat === SessionCollabFormat.INTERCLUB
    ) {
      return sportingJson(
        { error: "Club vs club tournaments do not support player groups" },
        { status: 400 }
      );
    }
    if (
      gameplaySettings &&
      courtLabels.some(
        (court) => court.courtNumber > gameplaySettings.courtCount
      )
    ) {
      return sportingJson(
        { error: "Court labels must match the selected court count" },
        { status: 400 }
      );
    }

    const courtsToRemove = gameplaySettings
      ? sessionData.courts.filter(
          (court) => court.courtNumber > gameplaySettings.courtCount
        )
      : [];
    if (
      courtsToRemove.some(
        (court) => court.currentMatchId || court._count.matches > 0
      )
    ) {
      return sportingJson(
        { error: "Courts with match history cannot be removed" },
        { status: 409 }
      );
    }

    await prisma.$transaction(async (tx) => {
      let initializeLegacyPools = false;
      if (
        gameplaySettings?.poolsEnabled &&
        !sessionData.poolAssignmentsInitialized
      ) {
        initializeLegacyPools = true;
        const players = await tx.sessionPlayer.findMany({
          where: { sessionId: sessionData.id },
          select: { playerId: true, isGuest: true },
        });
        const memberUserIds = players
          .filter((player) => !player.isGuest)
          .map((player) => player.playerId);
        const memberships = sessionData.clubId
          ? await tx.clubMember.findMany({
              where: {
                clubId: sessionData.clubId,
                playerId: { in: memberUserIds },
              },
              select: { playerId: true, preferredPool: true },
            })
          : [];
        const preferredPoolByUserId = new Map(
          memberships.map((membership) => [
            membership.playerId,
            membership.preferredPool === SessionPool.A
              ? SessionPool.A
              : SessionPool.B,
          ])
        );
        const competitiveUserIds = players
          .filter(
            (player) =>
              !player.isGuest &&
              preferredPoolByUserId.get(player.playerId) === SessionPool.A
          )
          .map((player) => player.playerId);
        await tx.sessionPlayer.updateMany({
          where: { sessionId: sessionData.id },
          data: { pool: SessionPool.B, pendingPool: null },
        });
        if (competitiveUserIds.length > 0) {
          await tx.sessionPlayer.updateMany({
            where: {
              sessionId: sessionData.id,
              playerId: { in: competitiveUserIds },
            },
            data: { pool: SessionPool.A, pendingPool: null },
          });
        }
      }

      await tx.session.update({
        where: { id: sessionData.id },
        data: {
          autoQueueEnabled,
          respectPlayerRest,
          ...(gameplaySettings
            ? {
                type: getLegacySessionTypeForSettings(gameplaySettings),
                mode: getLegacySessionModeForSettings(gameplaySettings),
                scoringType: gameplaySettings.scoringType,
                matchmakingStyle: gameplaySettings.matchmakingStyle,
                balanceMetric: gameplaySettings.balanceMetric,
                pairingMode: gameplaySettings.pairingMode,
                poolsEnabled: gameplaySettings.poolsEnabled,
                crossoverFrequency: gameplaySettings.crossoverFrequency,
                poolAssignmentsInitialized:
                  initializeLegacyPools ||
                  sessionData.poolAssignmentsInitialized,
              }
            : {}),
        },
      });

      if (gameplaySettings) {
        const existingCourtNumbers = new Set(
          sessionData.courts.map((court) => court.courtNumber)
        );
        const newCourts = Array.from(
          { length: gameplaySettings.courtCount },
          (_, index) => index + 1
        ).filter((courtNumber) => !existingCourtNumbers.has(courtNumber));
        if (newCourts.length > 0) {
          await tx.court.createMany({
            data: newCourts.map((courtNumber) => ({
              sessionId: sessionData.id,
              courtNumber,
            })),
          });
        }
        if (courtsToRemove.length > 0) {
          await tx.court.deleteMany({
            where: { id: { in: courtsToRemove.map((court) => court.id) } },
          });
        }
      }

      for (const courtLabel of courtLabels) {
        await tx.court.updateMany({
          where: {
            sessionId: sessionData.id,
            courtNumber: courtLabel.courtNumber,
          },
          data: { label: courtLabel.label },
        });
      }

      if (!autoQueueEnabled) {
        const queuedMatch = await tx.queuedMatch.findUnique({
          where: { sessionId: sessionData.id },
        });
        const deletedQueuedMatch = await tx.queuedMatch.deleteMany({
          where: { sessionId: sessionData.id },
        });
        if (
          deletedQueuedMatch.count > 0 &&
          queuedMatch &&
          !queuedMatch.isAutomatic
        ) {
          await applyPendingPlayerGroupChangesInTransaction(tx, {
            sessionId: sessionData.id,
            userIds: getQueuedMatchUserIds(queuedMatch),
          });
        }
      }
    });

    const updatedSession = await prisma.session.findUnique({
      where: { id: sessionData.id },
      include: {
        courts: { orderBy: { courtNumber: "asc" } },
        players: {
          include: {
            player: {
              select: {
                id: true,
                name: true,
                avatarKey: true,
                elo: true,
              },
            },
          },
          orderBy: { sessionPoints: "desc" },
        },
      },
    });
    if (!updatedSession) {
      return invalidTargetResponse(request, "api:sessions:code");
    }

    return sportingJson({
      type: updatedSession.type,
      mode: updatedSession.mode,
      scoringType: updatedSession.scoringType,
      matchmakingStyle: updatedSession.matchmakingStyle,
      balanceMetric: updatedSession.balanceMetric,
      pairingMode: updatedSession.pairingMode,
      autoQueueEnabled: updatedSession.autoQueueEnabled,
      respectPlayerRest: updatedSession.respectPlayerRest,
      poolsEnabled: updatedSession.poolsEnabled,
      crossoverFrequency: updatedSession.crossoverFrequency,
      courtLabels: updatedSession.courts.map((court) => ({
        id: court.id,
        label: court.label,
      })),
      ...(gameplaySettings
        ? {
            courts: updatedSession.courts.map((court) => ({
              ...court,
              currentMatch: null,
            })),
            players: updatedSession.players.map((player) => ({
              ...player,
              player: serializeAvatarEntity(player.player),
            })),
          }
        : {}),
      queuedMatch: autoQueueEnabled
        ? await tryRebuildQueuedMatchForSessionId(sessionData.id)
        : null,
    });
  } catch (error) {
    if (error instanceof SessionRouteError) {
      return sportingJson(
        { error: error.message },
        { status: error.status }
      );
    }
    logError("Update session settings error", error);
    return safeErrorResponse();
  }
}
