import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getClubEloByUserId, withClubElo } from "@/lib/clubElo";
import {
  finalizeMatchResultInTransaction,
  type FinalizableMatch,
} from "@/lib/matchCompletion";
import { isValidMatchScore } from "@/lib/matchRules";
import { prisma } from "@/lib/prisma";
import { MatchStatus, SessionPool, SessionStatus } from "@/types/enums";
import { logError, safeErrorResponse } from "@/lib/errors";
import { rateLimit, checkInvalidTargetRateLimit, invalidTargetResponse } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

interface CreateRealSessionBody {
  includeResults?: unknown;
  allowDuplicateResults?: unknown;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const rateLimitResponse = await rateLimit(request, "api:sessions:code:create-real:post", { limit: 15, windowMs: 60_000 });
    if (rateLimitResponse) return rateLimitResponse;

    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as
      | CreateRealSessionBody
      | null;
    const includeResults = body?.includeResults === true;
    const allowDuplicateResults = body?.allowDuplicateResults === true;

    const { code } = await params;

    if (typeof code !== "string" || code.length === 0) {
      return NextResponse.json({ error: "Invalid request parameters" }, { status: 400 });
    }

    const invalidTargetLimitResponse = await checkInvalidTargetRateLimit(request, "api:sessions:code:create-real");

    if (invalidTargetLimitResponse) return invalidTargetLimitResponse;
    const sourceSession = await prisma.session.findUnique({
      where: { code },
      include: {
        courts: {
          select: {
            id: true,
            courtNumber: true,
            label: true,
          },
          orderBy: { courtNumber: "asc" },
        },
        players: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                elo: true,
              },
            },
          },
          orderBy: { joinedAt: "asc" },
        },
        matches: {
          select: {
            id: true,
            courtId: true,
            status: true,
            scoreSubmittedByUserId: true,
            team1User1Id: true,
            team1User2Id: true,
            team2User1Id: true,
            team2User2Id: true,
            team1Score: true,
            team2Score: true,
            createdAt: true,
            completedAt: true,
          },
          orderBy: [{ completedAt: "asc" }, { createdAt: "asc" }],
        },
        club: {
          select: {
            isTutorial: true,
          },
        },
      },
    });

    if (!sourceSession) {
      return invalidTargetResponse(request, "api:sessions:code:create-real");
    }

    let isClubAdmin = false;
    if (sourceSession.clubId) {
      const membership = await prisma.clubMember.findUnique({
        where: {
          clubId_userId: {
            clubId: sourceSession.clubId,
            userId: session.user.id,
          },
        },
        select: { role: true },
      });
      isClubAdmin = membership?.role === "ADMIN";
    }

    if (!session.user.isAdmin && !isClubAdmin) {
      return NextResponse.json({ error: "Admin only" }, { status: 403 });
    }

    if (!sourceSession.isTest) {
      return NextResponse.json(
        { error: "Only test sessions can create a real session copy" },
        { status: 400 }
      );
    }

    if (sourceSession.club?.isTutorial) {
      return NextResponse.json(
        { error: "Tutorial playground sessions cannot create real sessions" },
        { status: 400 }
      );
    }

    if (sourceSession.players.length < 2) {
      return NextResponse.json(
        { error: "Need at least 2 players to create a real session" },
        { status: 400 }
      );
    }

    type SourceMatch = (typeof sourceSession.matches)[number];
    type ScoredSourceMatch = SourceMatch & {
      team1Score: number;
      team2Score: number;
    };

    const completedScoredMatches = sourceSession.matches
      .filter(
        (match): match is ScoredSourceMatch =>
          match.status === MatchStatus.COMPLETED &&
          typeof match.team1Score === "number" &&
          typeof match.team2Score === "number"
      )
      .sort((a, b) => {
        const aCompletedAt = a.completedAt ?? a.createdAt;
        const bCompletedAt = b.completedAt ?? b.createdAt;
        return (
          aCompletedAt.getTime() - bCompletedAt.getTime() ||
          a.createdAt.getTime() - b.createdAt.getTime()
        );
      });

    if (includeResults) {
      const invalidMatch = completedScoredMatches.find(
        (match) => !isValidMatchScore(match.team1Score, match.team2Score)
      );
      if (invalidMatch) {
        return NextResponse.json(
          {
            error:
              "Cannot copy results because the test session contains an invalid completed score.",
          },
          { status: 400 }
        );
      }

      const sourcePlayerIds = new Set(
        sourceSession.players.map((player) => player.userId)
      );
      const sourceCourtIds = new Set(sourceSession.courts.map((court) => court.id));
      const orphanedMatch = completedScoredMatches.find((match) =>
        [
          match.team1User1Id,
          match.team1User2Id,
          match.team2User1Id,
          match.team2User2Id,
        ].some((userId) => !sourcePlayerIds.has(userId))
      );
      if (orphanedMatch) {
        return NextResponse.json(
          {
            error:
              "Cannot copy results because a completed match includes a player who is no longer in the test roster.",
          },
          { status: 400 }
        );
      }

      const missingCourtMatch = completedScoredMatches.find(
        (match) => !sourceCourtIds.has(match.courtId)
      );
      if (missingCourtMatch) {
        return NextResponse.json(
          {
            error:
              "Cannot copy results because a completed match references a court that is no longer in the test session.",
          },
          { status: 400 }
        );
      }

      if (!allowDuplicateResults) {
        const existingResultCopy = await prisma.session.findFirst({
          where: {
            sourceSessionId: sourceSession.id,
            isTest: false,
            matches: {
              some: {
                status: MatchStatus.COMPLETED,
              },
            },
          },
          select: {
            code: true,
          },
        });

        if (existingResultCopy) {
          return NextResponse.json(
            {
              error:
                "This test session already has a real copy with results. Use that session to avoid double-counting standings or ratings.",
              code: existingResultCopy.code,
            },
            { status: 409 }
          );
        }
      }
    }

    const createdAt = new Date();
    const nextSessionId = randomUUID();
    const createdSession = await prisma.$transaction(async (tx) => {
      const courtIdBySourceCourtId = new Map(
        sourceSession.courts.map((court) => [court.id, randomUUID()])
      );
      const userIdBySourceUserId = new Map<string, string>();
      sourceSession.players
        .filter((player) => !player.isGuest)
        .forEach((player) => {
          userIdBySourceUserId.set(player.userId, player.userId);
        });

      const nextSession = await tx.session.create({
        data: {
          id: nextSessionId,
          code: nextSessionId,
          clubId: sourceSession.clubId,
          name: sourceSession.name,
          type: sourceSession.type,
          mode: sourceSession.mode,
          scoringType: sourceSession.scoringType,
          matchmakingStyle: sourceSession.matchmakingStyle,
          balanceMetric: sourceSession.balanceMetric,
          pairingMode: sourceSession.pairingMode,
          status: includeResults ? sourceSession.status : SessionStatus.WAITING,
          isTest: false,
          sourceSessionId: sourceSession.id,
          autoQueueEnabled: sourceSession.autoQueueEnabled,
          poolsEnabled: sourceSession.poolsEnabled,
          poolAName: sourceSession.poolAName,
          poolBName: sourceSession.poolBName,
          poolACourtAssignments: includeResults
            ? sourceSession.poolACourtAssignments
            : 0,
          poolBCourtAssignments: includeResults
            ? sourceSession.poolBCourtAssignments
            : 0,
          poolAMissedTurns: includeResults ? sourceSession.poolAMissedTurns : 0,
          poolBMissedTurns: includeResults ? sourceSession.poolBMissedTurns : 0,
          crossoverMissThreshold: sourceSession.crossoverMissThreshold,
          endedAt: includeResults ? sourceSession.endedAt : null,
          courts: {
            create: sourceSession.courts.map((court) => ({
              id: courtIdBySourceCourtId.get(court.id),
              courtNumber: court.courtNumber,
              label: court.label ?? null,
            })),
          },
        },
      });

      const guestPlayers = sourceSession.players.filter((player) => player.isGuest);
      if (guestPlayers.length > 0) {
        for (const guestPlayer of guestPlayers) {
          const guest = await tx.user.create({
            data: {
              name: guestPlayer.user.name,
              email: null,
              passwordHash: null,
              isClaimed: false,
              elo: guestPlayer.user.elo,
              gender: guestPlayer.gender,
              partnerPreference: guestPlayer.partnerPreference,
              mixedSideOverride: guestPlayer.mixedSideOverride,
            },
            select: {
              id: true,
            },
          });
          userIdBySourceUserId.set(guestPlayer.userId, guest.id);
        }
      }

      await tx.sessionPlayer.createMany({
        data: sourceSession.players.map((player) => ({
          sessionId: nextSession.id,
          userId: userIdBySourceUserId.get(player.userId) ?? player.userId,
          isGuest: player.isGuest,
          gender: player.gender,
          partnerPreference: player.partnerPreference,
          mixedSideOverride: player.mixedSideOverride,
          pool: sourceSession.poolsEnabled ? player.pool : SessionPool.A,
          sessionPoints: 0,
          lastPartnerId: null,
          isPaused: includeResults ? player.isPaused : false,
          matchesPlayed: 0,
          matchmakingMatchesCredit: includeResults
            ? player.matchmakingMatchesCredit
            : 0,
          availableSince: includeResults ? player.availableSince : createdAt,
          lastPlayedAt: null,
          pausedAt: includeResults ? player.pausedAt : null,
          joinedAt: includeResults ? player.joinedAt : createdAt,
          ladderEntryAt: includeResults ? player.ladderEntryAt : createdAt,
          arrivalPriorityAt: includeResults ? player.arrivalPriorityAt : null,
          inactiveSeconds: includeResults ? player.inactiveSeconds : 0,
        })),
      });

      if (includeResults) {
        for (const sourceMatch of completedScoredMatches) {
          const mappedCourtId = courtIdBySourceCourtId.get(sourceMatch.courtId);
          const mappedTeam1User1Id = userIdBySourceUserId.get(
            sourceMatch.team1User1Id
          );
          const mappedTeam1User2Id = userIdBySourceUserId.get(
            sourceMatch.team1User2Id
          );
          const mappedTeam2User1Id = userIdBySourceUserId.get(
            sourceMatch.team2User1Id
          );
          const mappedTeam2User2Id = userIdBySourceUserId.get(
            sourceMatch.team2User2Id
          );

          if (
            !mappedCourtId ||
            !mappedTeam1User1Id ||
            !mappedTeam1User2Id ||
            !mappedTeam2User1Id ||
            !mappedTeam2User2Id
          ) {
            throw new Error("RESULT_COPY_MAPPING_FAILED");
          }

          const copiedMatch = await tx.match.create({
            data: {
              id: randomUUID(),
              sessionId: nextSession.id,
              courtId: mappedCourtId,
              status: MatchStatus.IN_PROGRESS,
              team1User1Id: mappedTeam1User1Id,
              team1User2Id: mappedTeam1User2Id,
              team2User1Id: mappedTeam2User1Id,
              team2User2Id: mappedTeam2User2Id,
              createdAt: sourceMatch.createdAt,
            },
            include: {
              team1User1: { select: { id: true, name: true, elo: true } },
              team1User2: { select: { id: true, name: true, elo: true } },
              team2User1: { select: { id: true, name: true, elo: true } },
              team2User2: { select: { id: true, name: true, elo: true } },
            },
          });

          const copiedFinalizableMatch: FinalizableMatch = {
            ...copiedMatch,
            session: {
              clubId: nextSession.clubId,
              type: nextSession.type,
              isTest: false,
            },
          };

          const scoreSubmittedByUserId =
            sourceMatch.scoreSubmittedByUserId === null
              ? undefined
              : userIdBySourceUserId.get(sourceMatch.scoreSubmittedByUserId) ??
                sourceMatch.scoreSubmittedByUserId;

          await finalizeMatchResultInTransaction(tx, {
            match: copiedFinalizableMatch,
            expectedStatus: MatchStatus.IN_PROGRESS,
            finalTeam1Score: sourceMatch.team1Score,
            finalTeam2Score: sourceMatch.team2Score,
            scoreSubmittedByUserId,
            completedAt: sourceMatch.completedAt ?? sourceMatch.createdAt,
          });
        }
      }

      return tx.session.findUnique({
        where: { id: nextSession.id },
        include: {
          courts: true,
          players: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  elo: true,
                  gender: true,
                  partnerPreference: true,
                  mixedSideOverride: true,
                },
              },
            },
          },
        },
      });
    });

    if (!createdSession) {
      logError(
        "Create real session returned no session",
        new Error("Session transaction completed without a created session")
      );
      return safeErrorResponse();
    }

    const players =
      createdSession.clubId && createdSession.players.length > 0
        ? withClubElo(
            createdSession.players,
            await getClubEloByUserId(
              createdSession.clubId,
              createdSession.players.map((player) => player.userId)
            )
          )
        : createdSession.players;

    return NextResponse.json({
      ...createdSession,
      players,
    });
  } catch (error) {
    logError("Create real session from test error", error);
    return safeErrorResponse();
  }
}
