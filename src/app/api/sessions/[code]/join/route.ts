import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SessionStatus } from "@/types/enums";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { code } = await params;
    const body = await request.json().catch(() => ({}));
    const { userId: targetUserId } = body;

    // Determine who is joining
    let userIdToJoin = session.user.id;

    const sessionData = await prisma.session.findUnique({
      where: { code },
      include: { players: true },
    });

    if (!sessionData) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    if (sessionData.status === SessionStatus.COMPLETED) {
      return NextResponse.json({ error: "Session already ended" }, { status: 400 });
    }

    let requesterCommunityRole: string | null = null;
    if (sessionData.communityId) {
      const requesterMembership = await prisma.communityMember.findUnique({
        where: {
          communityId_userId: {
            communityId: sessionData.communityId,
            userId: session.user.id,
          },
        },
        select: { role: true },
      });
      requesterCommunityRole = requesterMembership?.role ?? null;
      if (!requesterCommunityRole && !session.user.isAdmin) {
        return NextResponse.json({ error: "Not a member of this community" }, { status: 403 });
      }
    }

    // If admin is trying to add someone else
    if (targetUserId && targetUserId !== session.user.id) {
      const isCommunityAdmin = requesterCommunityRole === "ADMIN";
      if (!session.user.isAdmin && !isCommunityAdmin) {
        return NextResponse.json({ error: "Only community admins can add other players" }, { status: 403 });
      }
      userIdToJoin = targetUserId;
    }

    if (sessionData.communityId) {
      const targetMembership = await prisma.communityMember.findUnique({
        where: {
          communityId_userId: {
            communityId: sessionData.communityId,
            userId: userIdToJoin,
          },
        },
      });
      if (!targetMembership) {
        return NextResponse.json({ error: "Target player is not a member of this community" }, { status: 400 });
      }
    }

    // Check if already in session
    const existing = await prisma.sessionPlayer.findUnique({
      where: {
        sessionId_userId: {
          sessionId: sessionData.id,
          userId: userIdToJoin,
        },
      },
    });

    if (existing) {
      return NextResponse.json(sessionData);
    }

    const updatedSession = await prisma.session.update({
      where: { id: sessionData.id },
      data: {
        players: {
          create: {
            userId: userIdToJoin,
            sessionPoints: 0,
            joinedAt: new Date(),
            availableSince: new Date(),
          },
        },
      },
      include: {
        courts: { include: { currentMatch: true } },
        players: {
          include: { user: { select: { id: true, name: true, elo: true } } },
        },
      },
    });

    return NextResponse.json(updatedSession);
  } catch (error) {
    console.error("Join session error:", error);
    return NextResponse.json({ error: "Failed to join session" }, { status: 500 });
  }
}
