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
      courts: {
        include: {
          currentMatch: {
            include: {
              team1User1: { select: { id: true, name: true } },
              team1User2: { select: { id: true, name: true } },
              team2User1: { select: { id: true, name: true } },
              team2User2: { select: { id: true, name: true } },
            },
          },
        },
      },
      players: {
        include: { user: { select: { id: true, name: true, elo: true } } },
        orderBy: { sessionPoints: "desc" },
      },
      matches: {
        where: { status: { in: [MatchStatus.COMPLETED, MatchStatus.PENDING_APPROVAL] } },
        select: {
          id: true,
          team1User1Id: true,
          team1User2Id: true,
          team2User1Id: true,
          team2User2Id: true,
          winnerTeam: true,
          status: true,
          completedAt: true,
        },
      },
    },
  });

  if (!sessionData) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const isMember = sessionData.players.some((p) => p.userId === session.user.id);
  if (!session.user.isAdmin && !isMember) {
    return NextResponse.json({ error: "Not authorized for this session" }, { status: 403 });
  }

  return NextResponse.json(sessionData);
}
