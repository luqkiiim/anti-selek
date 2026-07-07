import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { logError, safeErrorResponse } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { isQuickAccessSession } from "@/lib/quickAccess";
import { checkInvalidTargetRateLimit, invalidTargetResponse, rateLimit } from "@/lib/rateLimit";
import { getSessionOperatorMembership } from "@/lib/sessionCollab";
import { hasQueuedMatchUser } from "@/lib/sessionQueue";
import { consumeSkipNextMatches } from "@/lib/sessionSkipNext";
import { SessionStatus } from "@/types/enums";
import { tryRebuildQueuedMatchForSessionId } from "../../../queue-match/shared";

export const dynamic = "force-dynamic";

interface SkipNextRequestBody {
  skipNextMatch?: unknown;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ code: string; userId: string }> }
) {
  try {
    const rateLimitResponse = await rateLimit(
      request,
      "api:sessions:code:players:userId:skip-next:patch",
      { limit: 15, windowMs: 60_000 }
    );
    if (rateLimitResponse) return rateLimitResponse;

    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    if (isQuickAccessSession(session)) {
      return invalidTargetResponse(
        request,
        "api:sessions:code:players:userId:skip-next"
      );
    }

    const { code, userId } = await params;

    if (
      typeof code !== "string" ||
      code.length === 0 ||
      typeof userId !== "string" ||
      userId.length === 0
    ) {
      return NextResponse.json({ error: "Invalid request parameters" }, { status: 400 });
    }

    const invalidTargetLimitResponse = await checkInvalidTargetRateLimit(
      request,
      "api:sessions:code:players:userId:skip-next"
    );
    if (invalidTargetLimitResponse) return invalidTargetLimitResponse;

    const body = (await request.json().catch(() => null)) as
      | SkipNextRequestBody
      | null;
    if (!body || typeof body.skipNextMatch !== "boolean") {
      return NextResponse.json(
        { error: "skipNextMatch must be true or false" },
        { status: 400 }
      );
    }

    const sessionData = await prisma.session.findUnique({
      where: { code },
      select: {
        id: true,
        clubId: true,
        status: true,
      },
    });

    if (!sessionData) {
      return invalidTargetResponse(
        request,
        "api:sessions:code:players:userId:skip-next"
      );
    }
    if (sessionData.status === SessionStatus.COMPLETED) {
      return NextResponse.json(
        { error: "Completed sessions cannot be edited" },
        { status: 400 }
      );
    }

    const operatorMembership = await getSessionOperatorMembership(prisma, {
      session: sessionData,
      userId: session.user.id,
      acceptedOnly: true,
    });

    if (!session.user.isAdmin && !operatorMembership && session.user.id !== userId) {
      return invalidTargetResponse(
        request,
        "api:sessions:code:players:userId:skip-next"
      );
    }

    const existingPlayer = await prisma.sessionPlayer.findUnique({
      where: {
        sessionId_userId: {
          sessionId: sessionData.id,
          userId,
        },
      },
      select: {
        userId: true,
      },
    });

    if (!existingPlayer) {
      return invalidTargetResponse(
        request,
        "api:sessions:code:players:userId:skip-next"
      );
    }

    const queuedMatchAffected = await prisma.$transaction(async (tx) => {
      const queuedMatch = await tx.queuedMatch.findUnique({
        where: { sessionId: sessionData.id },
      });
      const affectsQueuedMatch =
        body.skipNextMatch === true && hasQueuedMatchUser(queuedMatch, userId);

      await tx.sessionPlayer.update({
        where: {
          sessionId_userId: {
            sessionId: sessionData.id,
            userId,
          },
        },
        data:
          body.skipNextMatch === true
            ? {
                skipNextMatchAt: new Date(),
                skipNextMatchRequestedById: session.user.id,
              }
            : {
                skipNextMatchAt: null,
                skipNextMatchRequestedById: null,
              },
      });

      if (affectsQueuedMatch) {
        await tx.queuedMatch.delete({
          where: { sessionId: sessionData.id },
        });
      }

      return affectsQueuedMatch;
    });

    const queuedMatch = queuedMatchAffected
      ? await tryRebuildQueuedMatchForSessionId(sessionData.id)
      : undefined;

    if (queuedMatchAffected && !queuedMatch) {
      await prisma.$transaction((tx) =>
        consumeSkipNextMatches(tx, {
          sessionId: sessionData.id,
          userIds: [userId],
        })
      );
    }

    const nextPlayer = await prisma.sessionPlayer.findUnique({
      where: {
        sessionId_userId: {
          sessionId: sessionData.id,
          userId,
        },
      },
      select: {
        userId: true,
        skipNextMatchAt: true,
        skipNextMatchRequestedById: true,
      },
    });

    return NextResponse.json({
      ...nextPlayer,
      queuedMatchAffected,
      ...(queuedMatchAffected ? { queuedMatch } : {}),
    });
  } catch (error) {
    logError("Skip next match error", error);
    return safeErrorResponse();
  }
}
