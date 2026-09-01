import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAuditEvent } from "@/lib/serverAudit";
import { logError, safeErrorResponse } from "@/lib/errors";
import { rateLimit, checkInvalidTargetRateLimit, invalidTargetResponse } from "@/lib/rateLimit";
import {
  collectGuestUserIds,
  deleteEphemeralGuestUsers,
  reverseSessionEloChanges,
} from "@/lib/sessionLifecycle";
import { SessionStatus } from "@/types/enums";

export const dynamic = "force-dynamic";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const rateLimitResponse = await rateLimit(request, "api:sessions:code:delete:delete", { limit: 15, windowMs: 60_000 });
    if (rateLimitResponse) return rateLimitResponse;

    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { code } = await params;

    if (typeof code !== "string" || code.length === 0) {
      return NextResponse.json({ error: "Invalid request parameters" }, { status: 400 });
    }

    const invalidTargetLimitResponse = await checkInvalidTargetRateLimit(request, "api:sessions:code:delete");

    if (invalidTargetLimitResponse) return invalidTargetLimitResponse;
    const targetSession = await prisma.session.findUnique({
      where: { code },
      select: {
        id: true,
        code: true,
        clubId: true,
        isTest: true,
        status: true,
      },
    });

    if (!targetSession) {
      return invalidTargetResponse(request, "api:sessions:code:delete");
    }

    let isClubAdmin = false;
    if (targetSession.clubId) {
      const membership = await prisma.clubMember.findUnique({
        where: {
          clubId_userId: {
            clubId: targetSession.clubId,
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

    if (
      !targetSession.isTest &&
      targetSession.status === SessionStatus.COMPLETED
    ) {
      return NextResponse.json(
        {
          error: "Completed tournaments must be rolled back from club history",
        },
        { status: 400 }
      );
    }

    await prisma.$transaction(async (tx) => {
      const sessionPlayers = await tx.sessionPlayer.findMany({
        where: { sessionId: targetSession.id },
        select: { userId: true, isGuest: true },
      });
      const guestUserIds = collectGuestUserIds(sessionPlayers);

      if (!targetSession.isTest) {
        await reverseSessionEloChanges(tx, {
          sessionId: targetSession.id,
          clubId: targetSession.clubId,
        });
      }

      await tx.court.updateMany({
        where: { sessionId: targetSession.id },
        data: { currentMatchId: null },
      });
      await tx.match.deleteMany({
        where: { sessionId: targetSession.id },
      });
      await tx.sessionPlayer.deleteMany({
        where: { sessionId: targetSession.id },
      });
      await tx.session.delete({
        where: { id: targetSession.id },
      });
      await deleteEphemeralGuestUsers(tx, guestUserIds);
    });

    logAuditEvent({
      action: targetSession.isTest ? "session.delete_test" : "session.cancel",
      actor: {
        email: session.user.email ?? null,
        isGlobalAdmin: !!session.user.isAdmin,
        userId: session.user.id,
      },
      outcome: "success",
      request,
      scope: {
        clubId: targetSession.clubId ?? undefined,
        route: "/api/sessions/[code]/delete",
        sessionCode: targetSession.code,
      },
      target: {
        id: targetSession.code,
        type: "session",
      },
    });

    return NextResponse.json({
      success: true,
      code: targetSession.code,
      clubId: targetSession.clubId,
    });
  } catch (error) {
    logError("Delete session error", error);
    return safeErrorResponse();
  }
}
