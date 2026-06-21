import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canQuickAccessClub, isQuickAccessSession } from "@/lib/quickAccess";
import {
  getSessionAdminMembership,
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
  "Newer completed matches exist outside this session, so exact ELO replay is blocked.";

interface CorrectionAvailabilitySession {
  id: string;
  communityId?: string | null;
  players: Array<{ userId: string }>;
  sessionCommunities: Array<{ communityId: string; status: string }>;
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
        sessionData.communityId,
        ...sessionData.sessionCommunities
          .filter((link) => link.status === SessionClubStatus.ACCEPTED)
          .map((link) => link.communityId),
      ].filter((communityId): communityId is string => Boolean(communityId))
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
                { communityId: { in: acceptedClubIds } },
                {
                  sessionCommunities: {
                    some: {
                      communityId: { in: acceptedClubIds },
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
                    team1User1Id: {
                      in: sessionData.players.map((player) => player.userId),
                    },
                  },
                  {
                    team1User2Id: {
                      in: sessionData.players.map((player) => player.userId),
                    },
                  },
                  {
                    team2User1Id: {
                      in: sessionData.players.map((player) => player.userId),
                    },
                  },
                  {
                    team2User2Id: {
                      in: sessionData.players.map((player) => player.userId),
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
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { code } = await params;

  if (typeof code !== "string" || code.length === 0) {
    return NextResponse.json({ error: "Invalid request parameters" }, { status: 400 });
  }

  const invalidTargetLimitResponse = await checkInvalidTargetRateLimit(_request, "api:sessions:code:history");

  if (invalidTargetLimitResponse) return invalidTargetLimitResponse;

  const sessionData = await prisma.session.findUnique({
    where: { code },
    select: {
      id: true,
      code: true,
      communityId: true,
      name: true,
      status: true,
      isTest: true,
      type: true,
      mode: true,
      scoringType: true,
      matchmakingStyle: true,
      balanceMetric: true,
      pairingMode: true,
      createdAt: true,
      endedAt: true,
      sessionCommunities: {
        select: {
          communityId: true,
          status: true,
        },
      },
      players: {
        select: {
          userId: true,
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
          team1User1Id: true,
          team1User2Id: true,
          team2User1Id: true,
          team2User2Id: true,
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
          team1User1: { select: { id: true, name: true } },
          team1User2: { select: { id: true, name: true } },
          team2User1: { select: { id: true, name: true } },
          team2User2: { select: { id: true, name: true } },
        },
      },
    },
  });

  if (!sessionData) {
    return invalidTargetResponse(_request, "api:sessions:code:history");
  }
  if (!canQuickAccessClub(session, sessionData.communityId)) {
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

  const isSessionPlayer = sessionData.players.some((player) => player.userId === session.user.id);
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
  if (
    viewerCanCorrectCompletedScores &&
    sessionData.status === SessionStatus.COMPLETED
  ) {
    if (sessionData.isTest) {
      correctionBlockedReason =
        "Test sessions do not support completed score correction.";
    } else {
      correctionBlockedReason =
        await getCompletedScoreCorrectionBlockedReason(sessionData);
      canCorrectCompletedScores = correctionBlockedReason === null;
    }
  }

  return NextResponse.json({
    session: {
      id: sessionData.id,
      code: sessionData.code,
      communityId: sessionData.communityId,
      name: sessionData.name,
      status: sessionData.status,
      isTest: sessionData.isTest,
      type: sessionData.type,
      mode: sessionData.mode,
      scoringType: sessionData.scoringType,
      matchmakingStyle: sessionData.matchmakingStyle,
      balanceMetric: sessionData.balanceMetric,
      pairingMode: sessionData.pairingMode,
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

export async function GET(...args: Parameters<typeof getSessionHistory>) {
  try {
    const rateLimitResponse = await rateLimit(args[0], "api:sessions:code:history:get", { limit: 30, windowMs: 60_000 });
    if (rateLimitResponse) return rateLimitResponse;

    return await getSessionHistory(...args);
  } catch (error) {
    logError("Load session history error", error);
    return safeErrorResponse();
  }
}
