import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const userId = session.user.id;
  const { code } = await params;
  const sessionData = await prisma.session.findUnique({
    where: { code },
    include: { players: true },
  });

  if (!sessionData) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  if (sessionData.status !== "WAITING" && sessionData.status !== "ACTIVE") {
    return NextResponse.json({ error: "Session not joinable" }, { status: 400 });
  }

  // Check if already a player
  const existingPlayer = sessionData.players.find(p => p.userId === userId);
  if (existingPlayer) {
    return NextResponse.json(sessionData);
  }

  // Add player
  const updatedSession = await prisma.session.update({
    where: { code },
    data: {
      players: {
        create: { userId, sessionPoints: 0 },
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
}
