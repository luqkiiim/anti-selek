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
    
    // If admin is trying to add someone else
    if (targetUserId && targetUserId !== session.user.id) {
      const adminEmails = process.env.ADMIN_EMAILS?.split(",").map(e => e.trim()) || [];
      const isAdmin = session.user.email && adminEmails.includes(session.user.email);
      if (!isAdmin) {
        return NextResponse.json({ error: "Unauthorized: Only admins can add other players" }, { status: 403 });
      }
      userIdToJoin = targetUserId;
    }

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
  } catch (error: any) {
    console.error("Join session error:", error);
    return NextResponse.json({ error: `Failed to join session: ${error.message}` }, { status: 500 });
  }
}
