import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { serializeAvatarEntity } from "@/lib/avatar";
import { getCommunityEloByUserId, withCommunityElo } from "@/lib/communityElo";
import { prisma } from "@/lib/prisma";
import { MatchStatus, SessionStatus } from "@/types/enums";
import { logError, safeErrorResponse } from "@/lib/errors";
import { rateLimit, checkInvalidTargetRateLimit, invalidTargetResponse } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const rateLimitResponse = await rateLimit(_request, "api:sessions:code:reset:post", { limit: 15, windowMs: 60_000 });
    if (rateLimitResponse) return rateLimitResponse;

    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { code } = await params;

    if (typeof code !== "string" || code.length === 0) {
      return NextResponse.json({ error: "Invalid request parameters" }, { status: 400 });
    }

    const invalidTargetLimitResponse = await checkInvalidTargetRateLimit(_request, "api:sessions:code:reset");

    if (invalidTargetLimitResponse) return invalidTargetLimitResponse;
    const targetSession = await prisma.session.findUnique({
      where: { code },
      select: {
        id: true,
        communityId: true,
        isTest: true,
      },
    });

    if (!targetSession) {
      return invalidTargetResponse(_request, "api:sessions:code:reset");
    }

    let isCommunityAdmin = false;
    if (targetSession.communityId) {
      const membership = await prisma.communityMember.findUnique({
        where: {
          communityId_userId: {
            communityId: targetSession.communityId,
            userId: session.user.id,
          },
        },
        select: { role: true },
      });
      isCommunityAdmin = membership?.role === "ADMIN";
    }

    if (!session.user.isAdmin && !isCommunityAdmin) {
      return NextResponse.json({ error: "Admin only" }, { status: 403 });
    }

    if (!targetSession.isTest) {
      return NextResponse.json(
        { error: "Only test sessions can be reset" },
        { status: 400 }
      );
    }

    const resetAt = new Date();
    const updatedSession = await prisma.$transaction(async (tx) => {
      await tx.queuedMatch.deleteMany({
        where: { sessionId: targetSession.id },
      });

      await tx.court.updateMany({
        where: { sessionId: targetSession.id },
        data: { currentMatchId: null },
      });

      await tx.match.deleteMany({
        where: { sessionId: targetSession.id },
      });

      await tx.sessionPlayer.updateMany({
        where: { sessionId: targetSession.id },
        data: {
          sessionPoints: 0,
          lastPartnerId: null,
          isPaused: false,
          matchesPlayed: 0,
          matchmakingMatchesCredit: 0,
          availableSince: resetAt,
          lastPlayedAt: null,
          pausedAt: null,
          joinedAt: resetAt,
          ladderEntryAt: resetAt,
          arrivalPriorityAt: null,
          inactiveSeconds: 0,
        },
      });

      return tx.session.update({
        where: { id: targetSession.id },
        data: {
          status: SessionStatus.WAITING,
          endedAt: null,
          poolACourtAssignments: 0,
          poolBCourtAssignments: 0,
          poolAMissedTurns: 0,
          poolBMissedTurns: 0,
        },
        include: {
          courts: {
            include: {
              currentMatch: {
                select: {
                  id: true,
                  status: true,
                  team1Score: true,
                  team2Score: true,
                  completedAt: true,
                  scoreSubmittedByUserId: true,
                  team1User1: { select: { id: true, name: true, avatarKey: true } },
                  team1User2: { select: { id: true, name: true, avatarKey: true } },
                  team2User1: { select: { id: true, name: true, avatarKey: true } },
                  team2User2: { select: { id: true, name: true, avatarKey: true } },
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
            where: {
              status: {
                in: [MatchStatus.COMPLETED, MatchStatus.PENDING_APPROVAL],
              },
            },
            select: {
              id: true,
              team1User1Id: true,
              team1User2Id: true,
              team2User1Id: true,
              team2User2Id: true,
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
    });

    const players =
      updatedSession.communityId && updatedSession.players.length > 0
        ? withCommunityElo(
            updatedSession.players,
            await getCommunityEloByUserId(
              updatedSession.communityId,
              updatedSession.players.map((player) => player.userId)
            )
          )
        : updatedSession.players;
    const serializedPlayers = players.map((player) => ({
      ...player,
      user: serializeAvatarEntity(player.user),
    }));
    const courts = updatedSession.courts.map((court) => ({
      ...court,
      currentMatch: court.currentMatch
        ? {
            ...court.currentMatch,
            team1User1: serializeAvatarEntity(court.currentMatch.team1User1),
            team1User2: serializeAvatarEntity(court.currentMatch.team1User2),
            team2User1: serializeAvatarEntity(court.currentMatch.team2User1),
            team2User2: serializeAvatarEntity(court.currentMatch.team2User2),
          }
        : null,
    }));

    return NextResponse.json({
      ...updatedSession,
      courts,
      players: serializedPlayers,
      matches: [],
      queuedMatch: null,
    });
  } catch (error) {
    logError("Reset test session error", error);
    return safeErrorResponse();
  }
}
