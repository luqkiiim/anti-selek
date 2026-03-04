import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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
    const { userId, isPaused } = await request.json();

    // Check if the requester is an admin or the player themselves
    const adminEmails = process.env.ADMIN_EMAILS?.split(",").map(e => e.trim()) || [];
    const isAdmin = session.user.email && adminEmails.includes(session.user.email);
    
    if (!isAdmin && session.user.id !== userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const sessionData = await prisma.session.findUnique({
      where: { code },
      select: { id: true },
    });

    if (!sessionData) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const existingPlayer = await prisma.sessionPlayer.findUnique({
      where: {
        sessionId_userId: {
          sessionId: sessionData.id,
          userId,
        },
      },
      select: { pausedAt: true, inactiveSeconds: true },
    });

    if (!existingPlayer) {
      return NextResponse.json({ error: "Player not found in session" }, { status: 404 });
    }

    let inactiveSecondsToIncrement = 0;
    if (!isPaused && existingPlayer.pausedAt) {
      // Transitioning from Paused to Unpaused
      const durationMs = Date.now() - existingPlayer.pausedAt.getTime();
      inactiveSecondsToIncrement = Math.floor(durationMs / 1000);
    }

    const updated = await prisma.sessionPlayer.update({
      where: {
        sessionId_userId: {
          sessionId: sessionData.id,
          userId,
        },
      },
      data: { 
        isPaused,
        pausedAt: isPaused ? new Date() : null,
        availableSince: isPaused ? undefined : new Date(), 
        inactiveSeconds: { increment: inactiveSecondsToIncrement },
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Pause player error:", error);
    return NextResponse.json({ error: "Failed to update player status" }, { status: 500 });
  }
}
