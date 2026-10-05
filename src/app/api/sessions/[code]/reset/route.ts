import { sportingJson } from "@/lib/sportingResponse";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { serializeAvatarEntity } from "@/lib/avatar";
import { getClubEloByUserId, withClubElo } from "@/lib/clubElo";
import { prisma } from "@/lib/prisma";
import { applyPendingPlayerGroupChangesInTransaction } from "@/lib/playerGroupPreferences";
import { MatchStatus, SessionStatus } from "@/types/enums";
import { logError, safeErrorResponse } from "@/lib/errors";
import { rateLimit, checkInvalidTargetRateLimit, invalidTargetResponse } from "@/lib/rateLimit";
import { reverseSessionEloChanges } from "@/lib/sessionLifecycle";
import { getSessionOperatorMembership } from "@/lib/sessionCollab";

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
      return sportingJson({ error: "Not authenticated" }, { status: 401 });
    }

    const { code } = await params;

    if (typeof code !== "string" || code.length === 0) {
      return sportingJson({ error: "Invalid request parameters" }, { status: 400 });
    }

    const invalidTargetLimitResponse = await checkInvalidTargetRateLimit(_request, "api:sessions:code:reset");

    if (invalidTargetLimitResponse) return invalidTargetLimitResponse;
    const targetSession = await prisma.session.findUnique({
      where: { code },
      select: {
        id: true,
        clubId: true,
        isTest: true,
        status: true,
      },
    });

    if (!targetSession) {
      return invalidTargetResponse(_request, "api:sessions:code:reset");
    }

    const operatorMembership = await getSessionOperatorMembership(prisma, {
      session: targetSession,
      userId: session.user.id,
      acceptedOnly: true,
    });
    if (!session.user.isAdmin && !operatorMembership) {
      return sportingJson({ error: "Admin or staff only" }, { status: 403 });
    }

    if (
      !targetSession.isTest &&
      targetSession.status !== SessionStatus.ACTIVE
    ) {
      return sportingJson(
        { error: "Only active tournaments can be reset" },
        { status: 400 }
      );
    }

    const resetAt = new Date();
    const updatedSession = await prisma.$transaction(async (tx) => {
      if (!targetSession.isTest) {
        await reverseSessionEloChanges(tx, {
          sessionId: targetSession.id,
          clubId: targetSession.clubId,
        });
      }

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

      const pendingPlayers = await tx.sessionPlayer.findMany({
        where: {
          sessionId: targetSession.id,
          pendingPool: { not: null },
        },
        select: { playerId: true },
      });
      await applyPendingPlayerGroupChangesInTransaction(tx, {
        sessionId: targetSession.id,
        userIds: pendingPlayers.map((player) => player.playerId),
      });

      await tx.sessionPlayer.updateMany({
        where: { sessionId: targetSession.id },
        data: {
          sessionPoints: 0,
          lastPartnerPlayerId: null,
          isPaused: false,
          matchesPlayed: 0,
          matchmakingMatchesCredit: 0,
          availableSince: resetAt,
          lastPlayedAt: null,
          pausedAt: null,
          joinedAt: resetAt,
          ladderEntryAt: resetAt,
          arrivalPriorityAt: null,
          skipNextMatchAt: null,
          skipNextMatchRequestedById: null,
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
                  team1Player1: { select: { id: true, name: true, avatarKey: true } },
                  team1Player2: { select: { id: true, name: true, avatarKey: true } },
                  team2Player1: { select: { id: true, name: true, avatarKey: true } },
                  team2Player2: { select: { id: true, name: true, avatarKey: true } },
                },
              },
            },
          },
          players: {
            include: {
              player: {
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
              team1Player1Id: true,
              team1Player2Id: true,
              team2Player1Id: true,
              team2Player2Id: true,
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
      updatedSession.clubId && updatedSession.players.length > 0
        ? withClubElo(
            updatedSession.players,
            await getClubEloByUserId(
              updatedSession.clubId,
              updatedSession.players.map((player) => player.playerId)
            )
          )
        : updatedSession.players;
    const serializedPlayers = players.map((player) => ({
      ...player,
      player: serializeAvatarEntity(player.player),
    }));
    const courts = updatedSession.courts.map((court) => ({
      ...court,
      currentMatch: court.currentMatch
        ? {
            ...court.currentMatch,
            team1Player1: serializeAvatarEntity(court.currentMatch.team1Player1),
            team1Player2: serializeAvatarEntity(court.currentMatch.team1Player2),
            team2Player1: serializeAvatarEntity(court.currentMatch.team2Player1),
            team2Player2: serializeAvatarEntity(court.currentMatch.team2Player2),
          }
        : null,
    }));

    return sportingJson({
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
