import { sportingJson } from "@/lib/sportingResponse";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { applyPendingPlayerGroupChangesInTransaction } from "@/lib/playerGroupPreferences";
import { prisma } from "@/lib/prisma";
import { getQueuedMatchUserIds, hasQueuedMatchUser } from "@/lib/sessionQueue";
import { deleteEphemeralGuestUsers } from "@/lib/sessionLifecycle";
import { getSessionOperatorMembership } from "@/lib/sessionCollab";
import { MatchStatus, SessionStatus } from "@/types/enums";
import { logError, safeErrorResponse } from "@/lib/errors";
import { rateLimit, checkInvalidTargetRateLimit, invalidTargetResponse } from "@/lib/rateLimit";
import { tryRebuildQueuedMatchForSessionId } from "../../queue-match/shared";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ code: string; userId: string }> }
) {
  try {
    const rateLimitResponse = await rateLimit(request, "api:sessions:code:players:playerId:patch", { limit: 15, windowMs: 60_000 });
    if (rateLimitResponse) return rateLimitResponse;

    const session = await auth();
    if (!session?.user?.id) {
      return sportingJson({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return sportingJson({ error: "Invalid request body" }, { status: 400 });
    }

    const { name } = body as { name?: unknown };
    if (typeof name !== "string" || name.trim().length < 2) {
      return sportingJson(
        { error: "Guest name must be at least 2 characters" },
        { status: 400 }
      );
    }

    const { code, userId: playerId } = await params;

    if (typeof code !== "string" || code.length === 0 || typeof playerId !== "string" || playerId.length === 0) {
      return sportingJson({ error: "Invalid request parameters" }, { status: 400 });
    }

    const invalidTargetLimitResponse = await checkInvalidTargetRateLimit(request, "api:sessions:code:players:playerId");

    if (invalidTargetLimitResponse) return invalidTargetLimitResponse;
    const sessionData = await prisma.session.findUnique({
      where: { code },
      select: {
        id: true,
        clubId: true,
        status: true,
      },
    });

    if (!sessionData) {
      return invalidTargetResponse(request, "api:sessions:code:players:playerId");
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

    if (!session.user.isAdmin && !operatorMembership) {
      return invalidTargetResponse(request, "api:sessions:code:players:playerId");
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
        isGuest: true,
      },
    });

    if (!existingPlayer) {
      return invalidTargetResponse(request, "api:sessions:code:players:playerId");
    }

    if (!existingPlayer.isGuest) {
      return sportingJson(
        { error: "Only guest names can be edited during a live tournament" },
        { status: 400 }
      );
    }

    const updatedUser = await prisma.player.update({
      where: { id: playerId },
      data: {
        name: name.trim(),
      },
      select: {
        id: true,
        name: true,
      },
    });

    return sportingJson({
      playerId: updatedUser.id,
      name: updatedUser.name,
    });
  } catch (error) {
    logError("Rename session guest error", error);
    return safeErrorResponse();
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ code: string; userId: string }> }
) {
  try {
    const rateLimitResponse = await rateLimit(_request, "api:sessions:code:players:playerId:delete", { limit: 15, windowMs: 60_000 });
    if (rateLimitResponse) return rateLimitResponse;

    const session = await auth();
    if (!session?.user?.id) {
      return sportingJson({ error: "Not authenticated" }, { status: 401 });
    }

    const { code, userId: playerId } = await params;

    if (typeof code !== "string" || code.length === 0 || typeof playerId !== "string" || playerId.length === 0) {
      return sportingJson({ error: "Invalid request parameters" }, { status: 400 });
    }

    const invalidTargetLimitResponse = await checkInvalidTargetRateLimit(_request, "api:sessions:code:players:playerId");

    if (invalidTargetLimitResponse) return invalidTargetLimitResponse;
    const sessionData = await prisma.session.findUnique({
      where: { code },
      select: {
        id: true,
        clubId: true,
        status: true,
      },
    });

    if (!sessionData) {
      return invalidTargetResponse(_request, "api:sessions:code:players:playerId");
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

    if (!session.user.isAdmin && !operatorMembership) {
      return invalidTargetResponse(_request, "api:sessions:code:players:playerId");
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
        isGuest: true,
        player: {
          select: { name: true },
        },
      },
    });

    if (!existingPlayer) {
      return invalidTargetResponse(_request, "api:sessions:code:players:playerId");
    }

    const playerMatchWhere = {
      sessionId: sessionData.id,
      OR: [
        { team1Player1Id: playerId },
        { team1Player2Id: playerId },
        { team2Player1Id: playerId },
        { team2Player2Id: playerId },
      ],
    };

    const busyStatuses: string[] = [
      MatchStatus.PENDING,
      MatchStatus.IN_PROGRESS,
      MatchStatus.PENDING_APPROVAL,
    ];
    const busyMatch = await prisma.match.findFirst({
      where: {
        ...playerMatchWhere,
        status: { in: busyStatuses },
      },
      select: {
        status: true,
      },
    });

    if (busyMatch) {
      return sportingJson(
        {
          error:
            "This player is currently assigned to a match. Undo or finish that match first.",
        },
        { status: 409 }
      );
    }

    const relatedMatch = await prisma.match.findFirst({
      where: playerMatchWhere,
      select: {
        status: true,
      },
    });

    if (relatedMatch) {
      return sportingJson(
        {
          error:
            "This player already has recorded match history in this tournament and cannot be removed.",
        },
        { status: 409 }
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      const queuedMatch = await tx.queuedMatch.findUnique({
        where: { sessionId: sessionData.id },
      });

      await tx.sessionPlayer.delete({
        where: {
          sessionId_playerId: {
            sessionId: sessionData.id,
            playerId,
          },
        },
      });

      const deletedGuestUsers = existingPlayer.isGuest
        ? await deleteEphemeralGuestUsers(tx, [playerId])
        : 0;

      const queuedMatchAffected = hasQueuedMatchUser(queuedMatch, playerId);
      if (queuedMatchAffected) {
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

      return {
        removedUserId: playerId,
        removedName: existingPlayer.player.name,
        deletedGuestUsers,
        queuedMatchAffected,
      };
    });

    const queuedMatch = result.queuedMatchAffected
      ? await tryRebuildQueuedMatchForSessionId(sessionData.id)
      : undefined;

    return sportingJson({
      ok: true,
      ...result,
      ...(result.queuedMatchAffected ? { queuedMatch } : {}),
    });
  } catch (error) {
    logError("Remove player from session error", error);
    return safeErrorResponse();
  }
}
