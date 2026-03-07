import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { deleteEphemeralGuestUsers } from "@/lib/sessionLifecycle";
import { MatchStatus, SessionStatus } from "@/types/enums";

export const dynamic = "force-dynamic";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ code: string; userId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { code, userId } = await params;
    const sessionData = await prisma.session.findUnique({
      where: { code },
      select: {
        id: true,
        communityId: true,
        status: true,
      },
    });

    if (!sessionData) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    if (sessionData.status === SessionStatus.COMPLETED) {
      return NextResponse.json(
        { error: "Completed sessions cannot be edited" },
        { status: 400 }
      );
    }

    let isCommunityAdmin = false;
    if (sessionData.communityId) {
      const membership = await prisma.communityMember.findUnique({
        where: {
          communityId_userId: {
            communityId: sessionData.communityId,
            userId: session.user.id,
          },
        },
        select: { role: true },
      });
      isCommunityAdmin = membership?.role === "ADMIN";
    }

    if (!session.user.isAdmin && !isCommunityAdmin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
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
      return NextResponse.json(
        { error: "Player not found in session" },
        { status: 404 }
      );
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

      return {
        removedUserId: userId,
        removedName: existingPlayer.user.name,
        deletedGuestUsers,
      };
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("Remove player from session error:", error);
    return NextResponse.json(
      { error: "Failed to remove player from session" },
      { status: 500 }
    );
  }
}
