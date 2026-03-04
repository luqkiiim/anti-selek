import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { MatchStatus } from "@/types/enums";

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
      matches: {
        where: { status: { in: [MatchStatus.COMPLETED, MatchStatus.PENDING_APPROVAL] } },
        select: {
          team1User1Id: true,
          team1User2Id: true,
          team2User1Id: true,
          team2User2Id: true,
        }
      }
    },
  });

  if (!sessionData) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  let communityRole: string | null = null;
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
    communityRole = membership?.role ?? null;
  }

  const isSessionPlayer = sessionData.players.some((p) => p.userId === session.user.id);
  const canView = session.user.isAdmin || !!communityRole || isSessionPlayer;
  if (!canView) {
    return NextResponse.json({ error: "Not authorized for this session" }, { status: 403 });
  }

  // Calculate match counts
  const matchCounts: Record<string, number> = {};
  sessionData.matches.forEach(m => {
    [m.team1User1Id, m.team1User2Id, m.team2User1Id, m.team2User2Id].forEach(id => {
      matchCounts[id] = (matchCounts[id] || 0) + 1;
    });
  });

  // Session points leaderboard
  const sessionPointsLeaderboard = sessionData.players
    .map((p) => ({
      userId: p.userId,
      name: p.user.name,
      sessionPoints: p.sessionPoints,
      elo: p.user.elo,
      matchesPlayed: matchCounts[p.userId] || 0,
    }))
    .sort((a, b) => b.sessionPoints - a.sessionPoints);

  // ELO leaderboard
  const eloLeaderboard = sessionData.players
    .map((p) => ({
      userId: p.userId,
      name: p.user.name,
      sessionPoints: p.sessionPoints,
      elo: p.user.elo,
      matchesPlayed: matchCounts[p.userId] || 0,
    }))
    .sort((a, b) => b.elo - a.elo);

  return NextResponse.json({
    sessionPointsLeaderboard,
    eloLeaderboard,
  });
}
