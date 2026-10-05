import { sportingJson } from "@/lib/sportingResponse";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { logError, safeErrorResponse } from "@/lib/errors";
import { applyPendingPlayerGroupChangesInTransaction } from "@/lib/playerGroupPreferences";
import { prisma } from "@/lib/prisma";
import { getOwnedPlayer } from "@/lib/playerIdentity";
import { isQuickAccessSession } from "@/lib/quickAccess";
import { checkInvalidTargetRateLimit, invalidTargetResponse, rateLimit } from "@/lib/rateLimit";
import {
  getAcceptedSessionClubIds,
  getSessionMembership,
  getSessionOperatorMembership,
} from "@/lib/sessionCollab";
import { getQueuedMatchUserIds, hasQueuedMatchUser } from "@/lib/sessionQueue";
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
      "api:sessions:code:players:playerId:skip-next:patch",
      { limit: 15, windowMs: 60_000 }
    );
    if (rateLimitResponse) return rateLimitResponse;

    const session = await auth();
    if (!session?.user?.id) {
      return sportingJson({ error: "Not authenticated" }, { status: 401 });
    }
    if (isQuickAccessSession(session)) {
      return invalidTargetResponse(
        request,
        "api:sessions:code:players:playerId:skip-next"
      );
    }

    const { code, userId: playerId } = await params;

    if (
      typeof code !== "string" ||
      code.length === 0 ||
      typeof playerId !== "string" ||
      playerId.length === 0
    ) {
      return sportingJson({ error: "Invalid request parameters" }, { status: 400 });
    }

    const invalidTargetLimitResponse = await checkInvalidTargetRateLimit(
      request,
      "api:sessions:code:players:playerId:skip-next"
    );
    if (invalidTargetLimitResponse) return invalidTargetLimitResponse;

    const body = (await request.json().catch(() => null)) as
      | SkipNextRequestBody
      | null;
    if (!body || typeof body.skipNextMatch !== "boolean") {
      return sportingJson(
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
        "api:sessions:code:players:playerId:skip-next"
      );
    }
    if (sessionData.status === SessionStatus.COMPLETED) {
      return sportingJson(
        { error: "Completed tournaments cannot be edited" },
        { status: 400 }
      );
    }

    const operatorMembership = await getSessionOperatorMembership(prisma, {
      session: sessionData,
      userId: session.user.id,
      acceptedOnly: true,
    });

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
      return invalidTargetResponse(
        request,
        "api:sessions:code:players:userId:skip-next"
      );
    }

    const existingPlayer = await prisma.sessionPlayer.findUnique({
      where: {
        sessionId_playerId: {
          sessionId: sessionData.id,
          playerId,
        },
      },
      select: {
        playerId: true,
      },
    });

    if (!existingPlayer) {
      return invalidTargetResponse(
        request,
        "api:sessions:code:players:playerId:skip-next"
      );
    }

    const queuedMatchAffected = await prisma.$transaction(async (tx) => {
      const queuedMatch = await tx.queuedMatch.findUnique({
        where: { sessionId: sessionData.id },
      });
      const affectsQueuedMatch =
        body.skipNextMatch === true && hasQueuedMatchUser(queuedMatch, playerId);

      await tx.sessionPlayer.update({
        where: {
          sessionId_playerId: {
            sessionId: sessionData.id,
            playerId,
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
        if (queuedMatch && !queuedMatch.isAutomatic) {
          await applyPendingPlayerGroupChangesInTransaction(tx, {
            sessionId: sessionData.id,
            userIds: getQueuedMatchUserIds(queuedMatch),
          });
        }
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
          userIds: [playerId],
        })
      );
    }

    const nextPlayer = await prisma.sessionPlayer.findUnique({
      where: {
        sessionId_playerId: {
          sessionId: sessionData.id,
          playerId,
        },
      },
      select: {
        playerId: true,
        skipNextMatchAt: true,
        skipNextMatchRequestedById: true,
      },
    });

    return sportingJson({
      ...nextPlayer,
      queuedMatchAffected,
      ...(queuedMatchAffected ? { queuedMatch } : {}),
    });
  } catch (error) {
    logError("Skip next match error", error);
    return safeErrorResponse();
  }
}
