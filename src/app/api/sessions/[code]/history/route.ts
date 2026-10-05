import { sportingJson } from "@/lib/sportingResponse";
import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  canQuickAccessSessionRead,
  isQuickAccessSession,
  getQuickAccessPlayerId,
} from "@/lib/quickAccess";
import {
  getSessionAdminMembership,
  isAccountSessionPlayer,
  getSessionMembership,
  getSessionOperatorMembership,
} from "@/lib/sessionCollab";
import {
  MatchStatus,
  SessionClubStatus,
  SessionStatus,
} from "@/types/enums";
import { logError, safeErrorResponse } from "@/lib/errors";
import { rateLimit, checkInvalidTargetRateLimit, invalidTargetResponse } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

const NEWER_OUTSIDE_MATCH_BLOCKED_REASON =
  "Newer completed matches exist outside this tournament, so exact ELO replay is blocked.";

interface CorrectionAvailabilitySession {
  id: string;
  clubId?: string | null;
  players: Array<{ playerId: string }>;
  sessionClubs: Array<{ clubId: string; status: string }>;
  matches: Array<{
    status: string;
    createdAt: Date;
    completedAt?: Date | null;
  }>;
}

function getMatchHistoryOrderTime(match: {
  createdAt: Date;
  completedAt?: Date | null;
}) {
  return match.completedAt ?? match.createdAt;
}

async function getCompletedScoreCorrectionBlockedReason(
  sessionData: CorrectionAvailabilitySession
) {
  const completedMatches = sessionData.matches.filter(
    (match) => match.status === MatchStatus.COMPLETED
  );
  if (completedMatches.length === 0) {
    return "There are no completed matches to correct.";
  }

  const firstReplayTime = completedMatches
    .map(getMatchHistoryOrderTime)
    .sort((left, right) => left.getTime() - right.getTime())[0];
  const newerCompletedMatchTimeFilter = [
    { completedAt: { gt: firstReplayTime } },
    { completedAt: null, createdAt: { gt: firstReplayTime } },
  ];
  const acceptedClubIds = Array.from(
    new Set(
      [
        sessionData.clubId,
        ...sessionData.sessionClubs
          .filter((link) => link.status === SessionClubStatus.ACCEPTED)
          .map((link) => link.clubId),
      ].filter((clubId): clubId is string => Boolean(clubId))
    )
  );

  const newerOutsideMatch =
    acceptedClubIds.length > 0
      ? await prisma.match.findFirst({
          where: {
            sessionId: { not: sessionData.id },
            status: MatchStatus.COMPLETED,
            OR: newerCompletedMatchTimeFilter,
            session: {
              isTest: false,
              OR: [
                { clubId: { in: acceptedClubIds } },
                {
                  sessionClubs: {
                    some: {
                      clubId: { in: acceptedClubIds },
                      status: SessionClubStatus.ACCEPTED,
                    },
                  },
                },
              ],
            },
          },
          select: { id: true },
        })
      : await prisma.match.findFirst({
          where: {
            sessionId: { not: sessionData.id },
            status: MatchStatus.COMPLETED,
            session: { isTest: false },
            AND: [
              { OR: newerCompletedMatchTimeFilter },
              {
                OR: [
                  {
                    team1Player1Id: {
                      in: sessionData.players.map((player) => player.playerId),
                    },
                  },
                  {
                    team1Player2Id: {
                      in: sessionData.players.map((player) => player.playerId),
                    },
                  },
                  {
                    team2Player1Id: {
                      in: sessionData.players.map((player) => player.playerId),
                    },
                  },
                  {
                    team2Player2Id: {
                      in: sessionData.players.map((player) => player.playerId),
                    },
                  },
                ],
              },
            ],
          },
          select: { id: true },
        });

  return newerOutsideMatch ? NEWER_OUTSIDE_MATCH_BLOCKED_REASON : null;
}

async function getSessionHistory(
  _request: Request,
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
    _request,
    "api:sessions:code:history:get",
    {
      applyHighRiskBucket: false,
      identity: session.user.id,
      limit: 120,
      windowMs: 60_000,
    }
  );
  if (rateLimitResponse) return rateLimitResponse;

  const invalidTargetLimitResponse = await checkInvalidTargetRateLimit(_request, "api:sessions:code:history");

  if (invalidTargetLimitResponse) return invalidTargetLimitResponse;

  const sessionData = await prisma.session.findUnique({
    where: { code },
    select: {
      id: true,
      code: true,
      clubId: true,
      name: true,
      status: true,
      isTest: true,
      type: true,
      mode: true,
      scoringType: true,
      matchmakingStyle: true,
      balanceMetric: true,
      pairingMode: true,
      crossoverFrequency: true,
      createdAt: true,
      endedAt: true,
      sessionClubs: {
        select: {
          clubId: true,
          status: true,
        },
      },
      players: {
        select: {
          playerId: true,
        },
      },
      matches: {
        where: {
          status: {
            in: [MatchStatus.COMPLETED, MatchStatus.PENDING_APPROVAL],
          },
        },
        orderBy: [{ completedAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
        select: {
          id: true,
          status: true,
          createdAt: true,
          completedAt: true,
          team1Player1Id: true,
          team1Player2Id: true,
          team2Player1Id: true,
          team2Player2Id: true,
          team1ClubId: true,
          team2ClubId: true,
          winnerTeam: true,
          team1Score: true,
          team2Score: true,
          team1EloChange: true,
          team2EloChange: true,
          court: {
            select: {
              courtNumber: true,
              label: true,
            },
          },
          team1Player1: { select: { id: true, name: true } },
          team1Player2: { select: { id: true, name: true } },
          team2Player1: { select: { id: true, name: true } },
          team2Player2: { select: { id: true, name: true } },
        },
      },
    },
  });

  if (!sessionData) {
    return invalidTargetResponse(_request, "api:sessions:code:history");
  }
  if (!canQuickAccessSessionRead(session, sessionData)) {
    return invalidTargetResponse(_request, "api:sessions:code:history");
  }

  const membership = await getSessionMembership(prisma, {
    session: sessionData,
    userId: session.user.id,
    acceptedOnly: true,
  });
  const operatorMembership = await getSessionOperatorMembership(prisma, {
    session: sessionData,
    userId: session.user.id,
    acceptedOnly: true,
  });
  const adminMembership = await getSessionAdminMembership(prisma, {
    session: sessionData,
    userId: session.user.id,
    acceptedOnly: true,
  });
  const clubRole = membership?.role ?? null;

  const quickPlayerId = getQuickAccessPlayerId(session);
  const isSessionPlayer = quickPlayerId
    ? sessionData.players.some((player) => player.playerId === quickPlayerId)
    : await isAccountSessionPlayer(prisma, sessionData.id, session.user.id);
  const isQuickAccess = isQuickAccessSession(session);
  const viewerCanManage =
    !isQuickAccess &&
    (!!session.user.isAdmin || !!operatorMembership);
  const viewerCanCorrectCompletedScores =
    !isQuickAccess && (!!session.user.isAdmin || !!adminMembership);
  const canView =
    viewerCanManage ||
    !!clubRole ||
    isSessionPlayer;
  if (!canView) {
    return invalidTargetResponse(_request, "api:sessions:code:history");
  }

  const undoableMatchId =
    viewerCanManage && sessionData.status === SessionStatus.ACTIVE
      ? (sessionData.matches.find(
          (match) => match.status === MatchStatus.COMPLETED
        )?.id ?? null)
      : null;
  let correctionBlockedReason: string | null = null;
  let canCorrectCompletedScores = false;
  const hasCompletedMatches = sessionData.matches.some(
    (match) => match.status === MatchStatus.COMPLETED
  );
  if (
    viewerCanCorrectCompletedScores &&
    hasCompletedMatches &&
    (sessionData.status === SessionStatus.ACTIVE ||
      sessionData.status === SessionStatus.COMPLETED)
  ) {
    if (sessionData.isTest) {
      correctionBlockedReason =
        "Test tournaments do not support completed score correction.";
    } else {
      correctionBlockedReason =
        await getCompletedScoreCorrectionBlockedReason(sessionData);
      canCorrectCompletedScores = correctionBlockedReason === null;
    }
  }

  return sportingJson({
    session: {
      id: sessionData.id,
      code: sessionData.code,
      clubId: sessionData.clubId,
      name: sessionData.name,
      status: sessionData.status,
      isTest: sessionData.isTest,
      type: sessionData.type,
      mode: sessionData.mode,
      scoringType: sessionData.scoringType,
      matchmakingStyle: sessionData.matchmakingStyle,
      balanceMetric: sessionData.balanceMetric,
      pairingMode: sessionData.pairingMode,
      crossoverFrequency: sessionData.crossoverFrequency,
      createdAt: sessionData.createdAt,
      endedAt: sessionData.endedAt,
    },
    viewerCanManage,
    canCorrectCompletedScores,
    correctionBlockedReason,
    undoableMatchId,
    matches: sessionData.matches,
  });
}

function privateNoStore(response: NextResponse) {
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  return response;
}

export async function GET(...args: Parameters<typeof getSessionHistory>) {
  try {
    return privateNoStore(await getSessionHistory(...args));
  } catch (error) {
    logError("Load session history error", error);
    return privateNoStore(safeErrorResponse());
  }
}
