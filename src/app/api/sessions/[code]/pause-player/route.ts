import { sportingJson } from "@/lib/sportingResponse";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { calculateNoCatchUpMatchmakingCredit } from "@/lib/matchmaking/matchmakingCredit";
import { applyPendingPlayerGroupChangesInTransaction } from "@/lib/playerGroupPreferences";
import { prisma } from "@/lib/prisma";
import { getOwnedPlayer } from "@/lib/playerIdentity";
import {
  getAcceptedSessionClubIds,
  getSessionMembership,
  getSessionOperatorMembership,
} from "@/lib/sessionCollab";
import { getQueuedMatchUserIds, hasQueuedMatchUser } from "@/lib/sessionQueue";
import { isQuickAccessSession } from "@/lib/quickAccess";
import {
  tryRebuildAutomaticQueuedMatchForCode,
  tryRebuildQueuedMatchForCode,
} from "../queue-match/shared";
import { logError, safeErrorResponse } from "@/lib/errors";
import { rateLimit, checkInvalidTargetRateLimit, invalidTargetResponse } from "@/lib/rateLimit";
import { MatchStatus, SessionStatus } from "@/types/enums";

export const dynamic = "force-dynamic";

class CourtPauseConflictError extends Error {}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const rateLimitResponse = await rateLimit(request, "api:sessions:code:pause-player:post", { limit: 120, windowMs: 60_000 });
    if (rateLimitResponse) return rateLimitResponse;

    const session = await auth();
    if (!session?.user?.id) {
      return sportingJson({ error: "Not authenticated" }, { status: 401 });
    }

    const { code } = await params;

    if (typeof code !== "string" || code.length === 0) {
      return sportingJson({ error: "Invalid request parameters" }, { status: 400 });
    }

    const invalidTargetLimitResponse = await checkInvalidTargetRateLimit(request, "api:sessions:code:pause-player");

    if (invalidTargetLimitResponse) return invalidTargetLimitResponse;
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return sportingJson({ error: "Invalid request body" }, { status: 400 });
    }
    const { playerId, isPaused, courtId, currentMatchId } = body as {
      playerId?: unknown;
      isPaused?: unknown;
      courtId?: unknown;
      currentMatchId?: unknown;
    };
    if (typeof playerId !== "string" || typeof isPaused !== "boolean") {
      return sportingJson({ error: "Invalid payload" }, { status: 400 });
    }
    const isCourtPause = courtId !== undefined || currentMatchId !== undefined;
    if (
      isCourtPause &&
      (!isPaused || typeof courtId !== "string" || typeof currentMatchId !== "string")
    ) {
      return sportingJson({ error: "Invalid court pause request" }, { status: 400 });
    }

    const sessionData = await prisma.session.findUnique({
      where: { code },
      select: { id: true, clubId: true, type: true, status: true, poolsEnabled: true },
    });

    if (!sessionData) {
      return invalidTargetResponse(request, "api:sessions:code:pause-player");
    }
    if (isQuickAccessSession(session)) {
      return invalidTargetResponse(request, "api:sessions:code:pause-player");
    }

    const operatorMembership = await getSessionOperatorMembership(prisma, {
      session: sessionData,
      userId: session.user.id,
      acceptedOnly: true,
    });

    // Check if the requester is a manager or the player themselves
    const ownedTarget = await getOwnedPlayer(prisma, {
      userId: session.user.id,
      playerId,
    });
    const [acceptedClubIds, requesterMembership] = ownedTarget
      ? await Promise.all([
          getAcceptedSessionClubIds(prisma, sessionData),
          getSessionMembership(prisma, {
            session: sessionData,
            userId: session.user.id,
            acceptedOnly: true,
          }),
        ])
      : [[], null];
    const canManageOwnedTarget =
      !!ownedTarget &&
      (acceptedClubIds.length === 0 || !!requesterMembership);
    if (!session.user.isAdmin && !operatorMembership && !canManageOwnedTarget) {
      return invalidTargetResponse(request, "api:sessions:code:pause-player");
    }
    if (isCourtPause && !session.user.isAdmin && !operatorMembership) {
      return invalidTargetResponse(request, "api:sessions:code:pause-player");
    }

    if (sessionData.status === SessionStatus.COMPLETED) {
      return sportingJson({ error: "Tournament already ended" }, { status: 400 });
    }
    if (isCourtPause && sessionData.status !== SessionStatus.ACTIVE) {
      return sportingJson({ error: "Tournament not active" }, { status: 400 });
    }

    const existingPlayer = await prisma.sessionPlayer.findUnique({
      where: {
        sessionId_playerId: {
          sessionId: sessionData.id,
          playerId,
        },
      },
      select: {
        pausedAt: true,
        inactiveSeconds: true,
        matchesPlayed: true,
        matchmakingMatchesCredit: true,
        pool: true,
      },
    });

    if (!existingPlayer) {
      return invalidTargetResponse(request, "api:sessions:code:pause-player");
    }

    const courtPauseTarget = isCourtPause
      ? { courtId: courtId as string, currentMatchId: currentMatchId as string }
      : null;
    let courtMatchUserIds: string[] = [];
    if (courtPauseTarget) {
      const liveMatch = await prisma.match.findFirst({
        where: {
          id: courtPauseTarget.currentMatchId,
          sessionId: sessionData.id,
          courtId: courtPauseTarget.courtId,
          status: { in: [MatchStatus.PENDING, MatchStatus.IN_PROGRESS] },
          OR: [
            { team1Player1Id: playerId },
            { team1Player2Id: playerId },
            { team2Player1Id: playerId },
            { team2Player2Id: playerId },
          ],
        },
        select: {
          id: true,
          team1Player1Id: true,
          team1Player2Id: true,
          team2Player1Id: true,
          team2Player2Id: true,
        },
      });
      if (!liveMatch) {
        return sportingJson(
          { error: "This court match has changed. Refresh and try again." },
          { status: 409 }
        );
      }
      courtMatchUserIds = [
        liveMatch.team1Player1Id,
        liveMatch.team1Player2Id,
        liveMatch.team2Player1Id,
        liveMatch.team2Player2Id,
      ];
    }

    let inactiveSecondsToIncrement = 0;
    let nextMatchmakingMatchesCredit =
      existingPlayer.matchmakingMatchesCredit;
    const now = new Date();
    let shouldResetResumeQueue = false;
    if (!isPaused && existingPlayer.pausedAt) {
      // Transitioning from Paused to Unpaused
      const durationMs = now.getTime() - existingPlayer.pausedAt.getTime();
      inactiveSecondsToIncrement = Math.max(
        0,
        Math.floor(durationMs / 1000)
      );

      const completedMatchWhilePaused = await prisma.match.findFirst({
        where: {
          sessionId: sessionData.id,
          status: MatchStatus.COMPLETED,
          OR: [
            { completedAt: { gt: existingPlayer.pausedAt } },
            {
              completedAt: null,
              createdAt: { gt: existingPlayer.pausedAt },
            },
          ],
          NOT: {
            OR: [
              { team1Player1Id: playerId },
              { team1Player2Id: playerId },
              { team2Player1Id: playerId },
              { team2Player2Id: playerId },
            ],
          },
        },
        select: { id: true },
      });

      if (completedMatchWhilePaused) {
        shouldResetResumeQueue = true;

        const activePlayers = await prisma.sessionPlayer.findMany({
          where: {
            sessionId: sessionData.id,
            playerId: { not: playerId },
            isPaused: false,
            ...(sessionData.poolsEnabled ? { pool: existingPlayer.pool } : {}),
          },
          select: {
            matchesPlayed: true,
            matchmakingMatchesCredit: true,
          },
        });

        nextMatchmakingMatchesCredit = calculateNoCatchUpMatchmakingCredit({
          player: existingPlayer,
          activePlayers,
        });
      }
    }
    const shouldSetArrivalPriority =
      shouldResetResumeQueue && sessionData.status === SessionStatus.ACTIVE;

    const { nextPlayer, queuedMatchAffected } = await prisma.$transaction(async (tx) => {
      if (courtPauseTarget) {
        const clearedCourt = await tx.court.updateMany({
          where: {
            id: courtPauseTarget.courtId,
            sessionId: sessionData.id,
            currentMatchId: courtPauseTarget.currentMatchId,
          },
          data: { currentMatchId: null },
        });
        if (clearedCourt.count === 0) {
          throw new CourtPauseConflictError(
            "This court match has changed. Refresh and try again."
          );
        }

        const deletedMatch = await tx.match.deleteMany({
          where: {
            id: courtPauseTarget.currentMatchId,
            sessionId: sessionData.id,
            courtId: courtPauseTarget.courtId,
            status: { in: [MatchStatus.PENDING, MatchStatus.IN_PROGRESS] },
            OR: [
              { team1Player1Id: playerId },
              { team1Player2Id: playerId },
              { team2Player1Id: playerId },
              { team2Player2Id: playerId },
            ],
          },
        });
        if (deletedMatch.count === 0) {
          throw new CourtPauseConflictError(
            "This court match has changed. Refresh and try again."
          );
        }
      }

      const nextPlayer = await tx.sessionPlayer.update({
        where: {
          sessionId_playerId: {
            sessionId: sessionData.id,
            playerId,
          },
        },
        data: {
          isPaused,
          pausedAt: isPaused ? now : null,
          skipNextMatchAt: isPaused ? null : undefined,
          skipNextMatchRequestedById: isPaused ? null : undefined,
          availableSince: shouldResetResumeQueue ? now : undefined,
          ladderEntryAt: shouldResetResumeQueue ? now : undefined,
          arrivalPriorityAt: shouldSetArrivalPriority ? now : undefined,
          inactiveSeconds: { increment: inactiveSecondsToIncrement },
          matchmakingMatchesCredit: nextMatchmakingMatchesCredit,
        },
      });

      let queuedMatchAffected = false;
      if (isPaused && !courtPauseTarget) {
        const queuedMatch = await tx.queuedMatch.findUnique({
          where: { sessionId: sessionData.id },
        });

        if (hasQueuedMatchUser(queuedMatch, playerId)) {
          await tx.queuedMatch.delete({
            where: { sessionId: sessionData.id },
          });
          if (queuedMatch && !queuedMatch.isAutomatic) {
            await applyPendingPlayerGroupChangesInTransaction(tx, {
              sessionId: sessionData.id,
              userIds: getQueuedMatchUserIds(queuedMatch),
            });
          }
          queuedMatchAffected = true;
        }
      }

      if (courtPauseTarget) {
        await applyPendingPlayerGroupChangesInTransaction(tx, {
          sessionId: sessionData.id,
          userIds: courtMatchUserIds,
        });
      }

      return { nextPlayer, queuedMatchAffected };
    });

    const queuedMatch = queuedMatchAffected
      ? await tryRebuildQueuedMatchForCode(code)
      : shouldSetArrivalPriority
        ? await tryRebuildAutomaticQueuedMatchForCode(code)
      : null;

    return sportingJson({
      ...nextPlayer,
      queuedMatchAffected: queuedMatchAffected || shouldSetArrivalPriority,
      queuedMatch,
    });
  } catch (error) {
    if (error instanceof CourtPauseConflictError) {
      return sportingJson({ error: error.message }, { status: 409 });
    }
    logError("Pause player error", error);
    return safeErrorResponse();
  }
}
