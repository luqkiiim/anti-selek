import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { calculateNoCatchUpMatchmakingCredit } from "@/lib/matchmaking/matchmakingCredit";
import { prisma } from "@/lib/prisma";
import { getSessionOperatorMembership } from "@/lib/sessionCollab";
import { hasQueuedMatchUser } from "@/lib/sessionQueue";
import { isQuickAccessSession } from "@/lib/quickAccess";
import {
  tryRebuildAutomaticQueuedMatchForCode,
  tryRebuildQueuedMatchForCode,
} from "../queue-match/shared";
import { logError, safeErrorResponse } from "@/lib/errors";
import { rateLimit, checkInvalidTargetRateLimit, invalidTargetResponse } from "@/lib/rateLimit";
import { SessionStatus } from "@/types/enums";

export const dynamic = "force-dynamic";

const RESUME_QUEUE_RESET_GUARD_MS = 60 * 1000;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const rateLimitResponse = await rateLimit(request, "api:sessions:code:pause-player:post", { limit: 15, windowMs: 60_000 });
    if (rateLimitResponse) return rateLimitResponse;

    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { code } = await params;

    if (typeof code !== "string" || code.length === 0) {
      return NextResponse.json({ error: "Invalid request parameters" }, { status: 400 });
    }

    const invalidTargetLimitResponse = await checkInvalidTargetRateLimit(request, "api:sessions:code:pause-player");

    if (invalidTargetLimitResponse) return invalidTargetLimitResponse;
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
    const { userId, isPaused } = body as { userId?: unknown; isPaused?: unknown };
    if (typeof userId !== "string" || typeof isPaused !== "boolean") {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const sessionData = await prisma.session.findUnique({
      where: { code },
      select: { id: true, clubId: true, type: true, status: true },
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
    if (!session.user.isAdmin && !operatorMembership && session.user.id !== userId) {
      return invalidTargetResponse(request, "api:sessions:code:pause-player");
    }

    const existingPlayer = await prisma.sessionPlayer.findUnique({
      where: {
        sessionId_userId: {
          sessionId: sessionData.id,
          userId,
        },
      },
      select: {
        pausedAt: true,
        inactiveSeconds: true,
        matchesPlayed: true,
        matchmakingMatchesCredit: true,
      },
    });

    if (!existingPlayer) {
      return invalidTargetResponse(request, "api:sessions:code:pause-player");
    }

    let inactiveSecondsToIncrement = 0;
    let nextMatchmakingMatchesCredit =
      existingPlayer.matchmakingMatchesCredit;
    const now = new Date();
    let shouldResetResumeQueue = false;
    if (!isPaused && existingPlayer.pausedAt) {
      // Transitioning from Paused to Unpaused
      const durationMs = now.getTime() - existingPlayer.pausedAt.getTime();
      const isAccidentalToggle =
        durationMs < RESUME_QUEUE_RESET_GUARD_MS;

      if (!isAccidentalToggle) {
        inactiveSecondsToIncrement = Math.floor(durationMs / 1000);
        shouldResetResumeQueue = true;

        const activePlayers = await prisma.sessionPlayer.findMany({
          where: {
            sessionId: sessionData.id,
            userId: { not: userId },
            isPaused: false,
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
      const nextPlayer = await tx.sessionPlayer.update({
        where: {
          sessionId_userId: {
            sessionId: sessionData.id,
            userId,
          },
        },
        data: {
          isPaused,
          pausedAt: isPaused ? now : null,
          availableSince: shouldResetResumeQueue ? now : undefined,
          ladderEntryAt: shouldResetResumeQueue ? now : undefined,
          arrivalPriorityAt: shouldSetArrivalPriority ? now : undefined,
          inactiveSeconds: { increment: inactiveSecondsToIncrement },
          matchmakingMatchesCredit: nextMatchmakingMatchesCredit,
        },
      });

      let queuedMatchAffected = false;
      if (isPaused) {
        const queuedMatch = await tx.queuedMatch.findUnique({
          where: { sessionId: sessionData.id },
        });

        if (hasQueuedMatchUser(queuedMatch, userId)) {
          await tx.queuedMatch.delete({
            where: { sessionId: sessionData.id },
          });
          queuedMatchAffected = true;
        }
      }

      return { nextPlayer, queuedMatchAffected };
    });

    const queuedMatch = queuedMatchAffected
      ? await tryRebuildQueuedMatchForCode(code)
      : shouldSetArrivalPriority
        ? await tryRebuildAutomaticQueuedMatchForCode(code)
      : null;

    return NextResponse.json({
      ...nextPlayer,
      queuedMatchAffected: queuedMatchAffected || shouldSetArrivalPriority,
      queuedMatch,
    });
  } catch (error) {
    logError("Pause player error", error);
    return safeErrorResponse();
  }
}
