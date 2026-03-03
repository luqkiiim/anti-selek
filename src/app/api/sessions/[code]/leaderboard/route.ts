import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { code } = await params;
  const sessionData = await prisma.session.findUnique({
    where: { code },
    include: {
      players: {
        include: { user: { select: { id: true, name: true, elo: true } } },
      },
    },
  });

  if (!sessionData) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  // Session points leaderboard
  const sessionPointsLeaderboard = sessionData.players
    .map((p) => ({
      userId: p.userId,
      name: p.user.name,
      sessionPoints: p.sessionPoints,
      elo: p.user.elo,
    }))
    .sort((a, b) => b.sessionPoints - a.sessionPoints);

  // ELO leaderboard
  const eloLeaderboard = sessionData.players
    .map((p) => ({
      userId: p.userId,
      name: p.user.name,
      sessionPoints: p.sessionPoints,
      elo: p.user.elo,
    }))
    .sort((a, b) => b.elo - a.elo);

  return NextResponse.json({
    sessionPointsLeaderboard,
    eloLeaderboard,
  });
}
