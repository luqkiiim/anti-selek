import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAuditEvent } from "@/lib/serverAudit";
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
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { id } = await params;

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
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
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
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Community scoped reset error:", error);
    return NextResponse.json({ error: `Failed to reset community: ${message}` }, { status: 500 });
  }
}
