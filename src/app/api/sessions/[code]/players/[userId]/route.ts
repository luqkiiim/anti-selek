import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasQueuedMatchUser } from "@/lib/sessionQueue";
import { deleteEphemeralGuestUsers } from "@/lib/sessionLifecycle";
import { getSessionOperatorMembership } from "@/lib/sessionCollab";
import { MatchStatus, SessionStatus } from "@/types/enums";
import { logError, safeErrorResponse } from "@/lib/errors";
import { rateLimit, checkInvalidTargetRateLimit, invalidTargetResponse } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ code: string; userId: string }> }
) {
  try {
    const rateLimitResponse = await rateLimit(request, "api:sessions:code:players:userId:patch", { limit: 15, windowMs: 60_000 });
    if (rateLimitResponse) return rateLimitResponse;

    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { name } = body as { name?: unknown };
    if (typeof name !== "string" || name.trim().length < 2) {
      return NextResponse.json(
        { error: "Guest name must be at least 2 characters" },
        { status: 400 }
      );
    }

    const { code, userId } = await params;

    if (typeof code !== "string" || code.length === 0 || typeof userId !== "string" || userId.length === 0) {
      return NextResponse.json({ error: "Invalid request parameters" }, { status: 400 });
    }

    const invalidTargetLimitResponse = await checkInvalidTargetRateLimit(request, "api:sessions:code:players:userId");

    if (invalidTargetLimitResponse) return invalidTargetLimitResponse;
    const sessionData = await prisma.session.findUnique({
      where: { code },
      select: {
        id: true,
        communityId: true,
        status: true,
      },
    });

    if (!sessionData) {
      return invalidTargetResponse(request, "api:sessions:code:players:userId");
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

    if (!session.user.isAdmin && !operatorMembership) {
      return invalidTargetResponse(request, "api:sessions:code:players:userId");
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
        isGuest: true,
      },
    });

    if (!existingPlayer) {
      return invalidTargetResponse(request, "api:sessions:code:players:userId");
    }

    if (!existingPlayer.isGuest) {
      return NextResponse.json(
        { error: "Only guest names can be edited during a live session" },
        { status: 400 }
      );
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        name: name.trim(),
      },
      select: {
        id: true,
        name: true,
      },
    });

    return NextResponse.json({
      userId: updatedUser.id,
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
    const rateLimitResponse = await rateLimit(_request, "api:sessions:code:players:userId:delete", { limit: 15, windowMs: 60_000 });
    if (rateLimitResponse) return rateLimitResponse;

    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { code, userId } = await params;

    if (typeof code !== "string" || code.length === 0 || typeof userId !== "string" || userId.length === 0) {
      return NextResponse.json({ error: "Invalid request parameters" }, { status: 400 });
    }

    const invalidTargetLimitResponse = await checkInvalidTargetRateLimit(_request, "api:sessions:code:players:userId");

    if (invalidTargetLimitResponse) return invalidTargetLimitResponse;
    const sessionData = await prisma.session.findUnique({
      where: { code },
      select: {
        id: true,
        communityId: true,
        status: true,
      },
    });

    if (!sessionData) {
      return invalidTargetResponse(_request, "api:sessions:code:players:userId");
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

    if (!session.user.isAdmin && !operatorMembership) {
      return invalidTargetResponse(_request, "api:sessions:code:players:userId");
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
        isGuest: true,
        user: {
          select: { name: true },
        },
      },
    });

    if (!existingPlayer) {
      return invalidTargetResponse(_request, "api:sessions:code:players:userId");
    }

    const playerMatchWhere = {
      sessionId: sessionData.id,
      OR: [
        { team1User1Id: userId },
        { team1User2Id: userId },
        { team2User1Id: userId },
        { team2User2Id: userId },
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
      return NextResponse.json(
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
      return NextResponse.json(
        {
          error:
            "This player already has recorded match history in this session and cannot be removed.",
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
          sessionId_userId: {
            sessionId: sessionData.id,
            userId,
          },
        },
      });

      const deletedGuestUsers = existingPlayer.isGuest
        ? await deleteEphemeralGuestUsers(tx, [userId])
        : 0;

      if (hasQueuedMatchUser(queuedMatch, userId)) {
        await tx.queuedMatch.delete({
          where: { sessionId: sessionData.id },
        });
      }

      return {
        removedUserId: userId,
        removedName: existingPlayer.user.name,
        deletedGuestUsers,
      };
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    logError("Remove player from session error", error);
    return safeErrorResponse();
  }
}
