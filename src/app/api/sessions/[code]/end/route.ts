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
    const sessionData = await prisma.session.findUnique({ where: { code } });

    if (!sessionData) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
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
      return NextResponse.json({ error: "Admin only" }, { status: 403 });
    }

    const updated = await prisma.session.update({
      where: { code },
      data: { status: SessionStatus.COMPLETED, endedAt: new Date() },
      include: {
        courts: { include: { currentMatch: true } },
        players: {
          include: { user: { select: { id: true, name: true, elo: true } } },
        },
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("End session error:", error);
    return NextResponse.json({ error: "Failed to end session" }, { status: 500 });
  }
}
