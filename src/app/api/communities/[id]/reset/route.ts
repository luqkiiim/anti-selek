import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getQuickAccessDeniedMessage, isQuickAccessSession } from "@/lib/quickAccess";
import { logAuditEvent } from "@/lib/serverAudit";
import { logError, safeErrorResponse } from "@/lib/errors";
import { rateLimit, checkInvalidTargetRateLimit, invalidTargetResponse } from "@/lib/rateLimit";
import { resetTutorialPlayground } from "@/lib/tutorialPlayground";
import {
  collectGuestUserIds,
  deleteEphemeralGuestUsers,
} from "@/lib/sessionLifecycle";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const rateLimitResponse = await rateLimit(request, "api:communities:id:reset:post", { limit: 15, windowMs: 60_000 });
    if (rateLimitResponse) return rateLimitResponse;

    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    if (isQuickAccessSession(session)) {
      return NextResponse.json(
        { error: getQuickAccessDeniedMessage() },
        { status: 403 }
      );
    }

    const { id } = await params;

    if (typeof id !== "string" || id.length === 0) {
      return NextResponse.json({ error: "Invalid request parameters" }, { status: 400 });
    }

    const invalidTargetLimitResponse = await checkInvalidTargetRateLimit(request, "api:communities:id:reset");

    if (invalidTargetLimitResponse) return invalidTargetLimitResponse;

    const membership = await prisma.communityMember.findUnique({
      where: {
        communityId_userId: {
          communityId: id,
          userId: session.user.id,
        },
      },
      select: { role: true },
    });

    const canReset = membership?.role === "ADMIN" || session.user.isAdmin;
    if (!canReset) {
      return invalidTargetResponse(request, "api:communities:id:reset");
    }

    const targetCommunity = await prisma.community.findUnique({
      where: { id },
      select: { isTutorial: true, tutorialOwnerId: true },
    });
    if (targetCommunity?.isTutorial) {
      if (targetCommunity.tutorialOwnerId !== session.user.id) {
        return invalidTargetResponse(request, "api:communities:id:reset");
      }

      await resetTutorialPlayground(session.user.id);
      return NextResponse.json({ success: true });
    }

    const body = await request.json().catch(() => null);
    const confirmation = body && typeof body === "object" ? (body as { confirmation?: unknown }).confirmation : undefined;
    if (confirmation !== "RESET") {
      return NextResponse.json({ error: "Invalid confirmation text" }, { status: 400 });
    }

    await prisma.$transaction(async (tx) => {
      const sessionRows = await tx.session.findMany({
        where: { communityId: id },
        select: { id: true },
      });
      const sessionIds = sessionRows.map((row) => row.id);
      const guestUserIds =
        sessionIds.length === 0
          ? []
          : collectGuestUserIds(
              await tx.sessionPlayer.findMany({
                where: {
                  sessionId: { in: sessionIds },
                  isGuest: true,
                },
                select: {
                  userId: true,
                  isGuest: true,
                },
              })
            );

      if (sessionIds.length > 0) {
        await tx.court.updateMany({
          where: { sessionId: { in: sessionIds } },
          data: { currentMatchId: null },
        });
        await tx.match.deleteMany({
          where: { sessionId: { in: sessionIds } },
        });
        await tx.sessionPlayer.deleteMany({
          where: { sessionId: { in: sessionIds } },
        });
        await tx.session.deleteMany({
          where: { id: { in: sessionIds } },
        });
      }

      await deleteEphemeralGuestUsers(tx, guestUserIds);

      await tx.communityMember.updateMany({
        where: { communityId: id },
        data: { elo: 1000 },
      });
    });

    logAuditEvent({
      action: "community.reset",
      actor: {
        email: session.user.email ?? null,
        isGlobalAdmin: !!session.user.isAdmin,
        userId: session.user.id,
      },
      outcome: "success",
      request,
      scope: {
        communityId: id,
        route: "/api/communities/[id]/reset",
      },
      target: {
        id,
        type: "community",
      },
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    logError("Community scoped reset error", error);
    return safeErrorResponse();
  }
}
