import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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

    const canReset = membership?.role === "ADMIN";
    if (!canReset) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const body = await request.json().catch(() => null);
    const confirmation = body && typeof body === "object" ? (body as { confirmation?: unknown }).confirmation : undefined;
    if (confirmation !== "RESET") {
      return NextResponse.json({ error: "Invalid confirmation text" }, { status: 400 });
    }

    const [sessionRows, memberRows] = await Promise.all([
      prisma.session.findMany({
        where: { communityId: id },
        select: { id: true },
      }),
      prisma.communityMember.findMany({
        where: { communityId: id },
        select: { userId: true },
      }),
    ]);

    const sessionIds = sessionRows.map((s) => s.id);
    const memberIds = Array.from(new Set(memberRows.map((m) => m.userId)));

    await prisma.$transaction(async (tx) => {
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

      if (memberIds.length > 0) {
        await tx.user.updateMany({
          where: { id: { in: memberIds } },
          data: { elo: 1000 },
        });
      }
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Community scoped reset error:", error);
    return NextResponse.json({ error: `Failed to reset community: ${message}` }, { status: 500 });
  }
}
