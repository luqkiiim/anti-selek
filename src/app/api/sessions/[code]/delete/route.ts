import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  collectGuestUserIds,
  deleteEphemeralGuestUsers,
} from "@/lib/sessionLifecycle";

export const dynamic = "force-dynamic";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { code } = await params;
    const targetSession = await prisma.session.findUnique({
      where: { code },
      select: {
        id: true,
        code: true,
        communityId: true,
        isTest: true,
      },
    });

    if (!targetSession) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    let isCommunityAdmin = false;
    if (targetSession.communityId) {
      const membership = await prisma.communityMember.findUnique({
        where: {
          communityId_userId: {
            communityId: targetSession.communityId,
            userId: session.user.id,
          },
        },
        select: { role: true },
      });
      isCommunityAdmin = membership?.role === "ADMIN";
    }

    if (!session.user.isAdmin && !isCommunityAdmin) {
      return NextResponse.json({ error: "Admin only" }, { status: 403 });
    }

    if (!targetSession.isTest) {
      return NextResponse.json(
        { error: "Only test sessions can be deleted here" },
        { status: 400 }
      );
    }

    await prisma.$transaction(async (tx) => {
      const sessionPlayers = await tx.sessionPlayer.findMany({
        where: { sessionId: targetSession.id },
        select: { userId: true, isGuest: true },
      });
      const guestUserIds = collectGuestUserIds(sessionPlayers);

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

    return NextResponse.json({
      success: true,
      code: targetSession.code,
      communityId: targetSession.communityId,
    });
  } catch (error) {
    console.error("Delete test session error:", error);
    return NextResponse.json(
      { error: "Failed to delete test session" },
      { status: 500 }
    );
  }
}
