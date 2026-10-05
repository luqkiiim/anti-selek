import { sportingJson } from "@/lib/sportingResponse";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getClubEloByUserId } from "@/lib/clubElo";
import {
  getCompetitiveEntryAt,
  deriveLadderRecordsByEntryTime,
  deriveRaceRecordsByEntryTime,
} from "@/lib/matchmaking/ladder";
import {
  compareCompetitiveStandings,
  compareSessionStandings,
} from "@/lib/sessionStandings";
import { canQuickAccessSessionRead, getQuickAccessPlayerId, isQuickAccessSession } from "@/lib/quickAccess";
import { getSessionMembership, isAccountSessionPlayer } from "@/lib/sessionCollab";
import { MatchStatus, SessionType } from "@/types/enums";
import { logError, safeErrorResponse } from "@/lib/errors";
import { rateLimit, checkInvalidTargetRateLimit, invalidTargetResponse } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

async function getSessionLeaderboard(
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

  const invalidTargetLimitResponse = await checkInvalidTargetRateLimit(request, "api:sessions:code:leaderboard");

  if (invalidTargetLimitResponse) return invalidTargetLimitResponse;
  const sessionData = await prisma.session.findUnique({
    where: { code },
    include: {
      players: {
        include: {
          player: {
            select: {
              id: true,
              name: true,
              elo: true,
              gender: true,
              partnerPreference: true,
            },
          },
        },
      },
      matches: {
        where: { status: { in: [MatchStatus.COMPLETED, MatchStatus.PENDING_APPROVAL] } },
        select: {
          team1Player1Id: true,
          team1Player2Id: true,
          team2Player1Id: true,
          team2Player2Id: true,
          team1Score: true,
          team2Score: true,
          status: true,
          completedAt: true,
        }
      },
      sessionClubs: {
        select: {
          clubId: true,
          status: true,
        },
      },
    },
  });

  if (!sessionData) {
    return invalidTargetResponse(request, "api:sessions:code:leaderboard");
  }
  if (!canQuickAccessSessionRead(session, sessionData)) {
    return invalidTargetResponse(request, "api:sessions:code:leaderboard");
  }

  const membership = await getSessionMembership(prisma, {
    session: sessionData,
    userId: session.user.id,
    acceptedOnly: true,
  });
  const clubRole = membership?.role ?? null;

  const quickPlayerId = getQuickAccessPlayerId(session);
  const isSessionPlayer = quickPlayerId
    ? sessionData.players.some((player) => player.playerId === quickPlayerId)
    : await isAccountSessionPlayer(prisma, sessionData.id, session.user.id);
  const canView =
    (!isQuickAccessSession(session) && session.user.isAdmin) ||
    !!clubRole ||
    isSessionPlayer;
  if (!canView) {
    return invalidTargetResponse(request, "api:sessions:code:leaderboard");
  }

  // Calculate match counts
  const matchCounts: Record<string, number> = {};
  const pointDiffByUserId: Record<string, number> = {};
  sessionData.matches.forEach(m => {
    [m.team1Player1Id, m.team1Player2Id, m.team2Player1Id, m.team2Player2Id].forEach(id => {
      matchCounts[id] = (matchCounts[id] || 0) + 1;
    });

    if (
      m.status === MatchStatus.COMPLETED &&
      typeof m.team1Score === "number" &&
      typeof m.team2Score === "number"
    ) {
      const team1Diff = m.team1Score - m.team2Score;
      const team2Diff = m.team2Score - m.team1Score;
      [m.team1Player1Id, m.team1Player2Id].forEach((id) => {
        pointDiffByUserId[id] = (pointDiffByUserId[id] || 0) + team1Diff;
      });
      [m.team2Player1Id, m.team2Player2Id].forEach((id) => {
        pointDiffByUserId[id] = (pointDiffByUserId[id] || 0) + team2Diff;
      });
    }
  });

  const clubEloByUserId =
    sessionData.clubId && sessionData.players.length > 0
      ? await getClubEloByUserId(
          sessionData.clubId,
          sessionData.players.map((p) => p.playerId)
        )
      : new Map<string, number>();

  const getPlayerElo = (playerId: string, fallbackElo: number) =>
    clubEloByUserId.get(playerId) ?? fallbackElo;

  const leaderboardEntries = sessionData.players
    .map((p) => ({
      playerId: p.playerId,
      name: p.player.name,
      isGuest: p.isGuest,
      sessionPoints: p.sessionPoints,
      elo: getPlayerElo(p.playerId, p.player.elo),
      matchesPlayed: matchCounts[p.playerId] || 0,
      pointDiff: pointDiffByUserId[p.playerId] || 0,
      ladderEntryAt: p.ladderEntryAt,
    }));

  const sessionPointsLeaderboard = leaderboardEntries
    .slice()
    .sort(compareSessionStandings);

  const eloLeaderboard = leaderboardEntries
    .slice()
    .sort(compareSessionStandings);

  const ladderRecordByUserId = deriveLadderRecordsByEntryTime(
    new Map(
      sessionData.players.map((player) => [
        player.playerId,
        getCompetitiveEntryAt(player),
      ])
    ),
    sessionData.matches.map((match) => ({
      team1: [match.team1Player1Id, match.team1Player2Id] as [string, string],
      team2: [match.team2Player1Id, match.team2Player2Id] as [string, string],
      team1Score: match.team1Score,
      team2Score: match.team2Score,
      status: match.status,
      completedAt: match.completedAt,
    }))
  );
  const ladderLeaderboard = leaderboardEntries
    .map((entry) => {
      const record = ladderRecordByUserId.get(entry.playerId) ?? {
        ladderScore: 0,
        pointDiff: 0,
      };

      return {
        ...entry,
        score: record.ladderScore,
        pointDiff: record.pointDiff,
      };
    })
    .sort(compareCompetitiveStandings);

  const raceRecordByUserId = deriveRaceRecordsByEntryTime(
    new Map(
      sessionData.players.map((player) => [
        player.playerId,
        getCompetitiveEntryAt(player),
      ])
    ),
    sessionData.matches.map((match) => ({
      team1: [match.team1Player1Id, match.team1Player2Id] as [string, string],
      team2: [match.team2Player1Id, match.team2Player2Id] as [string, string],
      team1Score: match.team1Score,
      team2Score: match.team2Score,
      status: match.status,
      completedAt: match.completedAt,
    }))
  );
  const raceLeaderboard = leaderboardEntries
    .map((entry) => {
      const record = raceRecordByUserId.get(entry.playerId) ?? {
        ladderScore: 0,
        pointDiff: 0,
      };

      return {
        ...entry,
        score: record.ladderScore,
        pointDiff: record.pointDiff,
      };
    })
    .sort(compareCompetitiveStandings);

  return sportingJson({
    sessionPointsLeaderboard,
    eloLeaderboard,
    ladderLeaderboard,
    raceLeaderboard,
    currentLeaderboard:
      sessionData.type === SessionType.LADDER
        ? ladderLeaderboard
        : sessionPointsLeaderboard,
  });
}

export async function GET(...args: Parameters<typeof getSessionLeaderboard>) {
  try {
    const rateLimitResponse = await rateLimit(args[0], "api:sessions:code:leaderboard:get", { limit: 30, windowMs: 60_000 });
    if (rateLimitResponse) return rateLimitResponse;

    return await getSessionLeaderboard(...args);
  } catch (error) {
    logError("Load session leaderboard error", error);
    return safeErrorResponse();
  }
}
