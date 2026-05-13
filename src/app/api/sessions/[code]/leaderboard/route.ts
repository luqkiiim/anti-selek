import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCommunityEloByUserId } from "@/lib/communityElo";
import {
  getCompetitiveEntryAt,
  deriveLadderRecordsByEntryTime,
  deriveRaceRecordsByEntryTime,
} from "@/lib/matchmaking/ladder";
import {
  compareCompetitiveStandings,
  compareSessionStandings,
} from "@/lib/sessionStandings";
import { canQuickAccessCommunity, isQuickAccessSession } from "@/lib/quickAccess";
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
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { code } = await params;

  if (typeof code !== "string" || code.length === 0) {
    return NextResponse.json({ error: "Invalid request parameters" }, { status: 400 });
  }

  const invalidTargetLimitResponse = await checkInvalidTargetRateLimit(request, "api:sessions:code:leaderboard");

  if (invalidTargetLimitResponse) return invalidTargetLimitResponse;
  const sessionData = await prisma.session.findUnique({
    where: { code },
    include: {
      players: {
        include: {
          user: {
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
          team1User1Id: true,
          team1User2Id: true,
          team2User1Id: true,
          team2User2Id: true,
          team1Score: true,
          team2Score: true,
          status: true,
          completedAt: true,
        }
      }
    },
  });

  if (!sessionData) {
    return invalidTargetResponse(request, "api:sessions:code:leaderboard");
  }
  if (!canQuickAccessCommunity(session, sessionData.communityId)) {
    return invalidTargetResponse(request, "api:sessions:code:leaderboard");
  }

  let communityRole: string | null = null;
  if (sessionData.communityId) {
    const membership = await prisma.communityMember.findUnique({
      where: {
        communityId_userId: {
          communityId: sessionData.communityId,
          userId: session.user.id,
        },
      },
      select: { role: true },
    });
    communityRole = membership?.role ?? null;
  }

  const isSessionPlayer = sessionData.players.some((p) => p.userId === session.user.id);
  const canView =
    (!isQuickAccessSession(session) && session.user.isAdmin) ||
    !!communityRole ||
    isSessionPlayer;
  if (!canView) {
    return invalidTargetResponse(request, "api:sessions:code:leaderboard");
  }

  // Calculate match counts
  const matchCounts: Record<string, number> = {};
  const pointDiffByUserId: Record<string, number> = {};
  sessionData.matches.forEach(m => {
    [m.team1User1Id, m.team1User2Id, m.team2User1Id, m.team2User2Id].forEach(id => {
      matchCounts[id] = (matchCounts[id] || 0) + 1;
    });

    if (
      m.status === MatchStatus.COMPLETED &&
      typeof m.team1Score === "number" &&
      typeof m.team2Score === "number"
    ) {
      const team1Diff = m.team1Score - m.team2Score;
      const team2Diff = m.team2Score - m.team1Score;
      [m.team1User1Id, m.team1User2Id].forEach((id) => {
        pointDiffByUserId[id] = (pointDiffByUserId[id] || 0) + team1Diff;
      });
      [m.team2User1Id, m.team2User2Id].forEach((id) => {
        pointDiffByUserId[id] = (pointDiffByUserId[id] || 0) + team2Diff;
      });
    }
  });

  const communityEloByUserId =
    sessionData.communityId && sessionData.players.length > 0
      ? await getCommunityEloByUserId(
          sessionData.communityId,
          sessionData.players.map((p) => p.userId)
        )
      : new Map<string, number>();

  const getPlayerElo = (userId: string, fallbackElo: number) =>
    communityEloByUserId.get(userId) ?? fallbackElo;

  const leaderboardEntries = sessionData.players
    .map((p) => ({
      userId: p.userId,
      name: p.user.name,
      isGuest: p.isGuest,
      sessionPoints: p.sessionPoints,
      elo: getPlayerElo(p.userId, p.user.elo),
      matchesPlayed: matchCounts[p.userId] || 0,
      pointDiff: pointDiffByUserId[p.userId] || 0,
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
        player.userId,
        getCompetitiveEntryAt(player),
      ])
    ),
    sessionData.matches.map((match) => ({
      team1: [match.team1User1Id, match.team1User2Id] as [string, string],
      team2: [match.team2User1Id, match.team2User2Id] as [string, string],
      team1Score: match.team1Score,
      team2Score: match.team2Score,
      status: match.status,
      completedAt: match.completedAt,
    }))
  );
  const ladderLeaderboard = leaderboardEntries
    .map((entry) => {
      const record = ladderRecordByUserId.get(entry.userId) ?? {
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
        player.userId,
        getCompetitiveEntryAt(player),
      ])
    ),
    sessionData.matches.map((match) => ({
      team1: [match.team1User1Id, match.team1User2Id] as [string, string],
      team2: [match.team2User1Id, match.team2User2Id] as [string, string],
      team1Score: match.team1Score,
      team2Score: match.team2Score,
      status: match.status,
      completedAt: match.completedAt,
    }))
  );
  const raceLeaderboard = leaderboardEntries
    .map((entry) => {
      const record = raceRecordByUserId.get(entry.userId) ?? {
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

  return NextResponse.json({
    sessionPointsLeaderboard,
    eloLeaderboard,
    ladderLeaderboard,
    raceLeaderboard,
    currentLeaderboard:
      sessionData.type === SessionType.LADDER
        ? ladderLeaderboard
        : sessionData.type === SessionType.RACE
          ? raceLeaderboard
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
