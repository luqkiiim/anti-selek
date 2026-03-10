import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { MatchStatus } from "@/types/enums";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { code } = await params;

  const sessionData = await prisma.session.findUnique({
    where: { code },
    select: {
      id: true,
      code: true,
      communityId: true,
      name: true,
      status: true,
      type: true,
      mode: true,
      createdAt: true,
      endedAt: true,
      players: {
        select: {
          userId: true,
        },
      },
      matches: {
        where: {
          status: {
            in: [MatchStatus.COMPLETED, MatchStatus.PENDING_APPROVAL],
          },
        },
        orderBy: [{ completedAt: "desc" }, { createdAt: "desc" }],
        select: {
          id: true,
          status: true,
          createdAt: true,
          completedAt: true,
          winnerTeam: true,
          team1Score: true,
          team2Score: true,
          team1EloChange: true,
          team2EloChange: true,
          court: {
            select: {
              courtNumber: true,
            },
          },
          team1User1: { select: { id: true, name: true } },
          team1User2: { select: { id: true, name: true } },
          team2User1: { select: { id: true, name: true } },
          team2User2: { select: { id: true, name: true } },
        },
      },
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

  const isSessionPlayer = sessionData.players.some((player) => player.userId === session.user.id);
  const canView = session.user.isAdmin || !!communityRole || isSessionPlayer;
  if (!canView) {
    return NextResponse.json({ error: "Not authorized for this session" }, { status: 403 });
  }

  return NextResponse.json({
    session: {
      id: sessionData.id,
      code: sessionData.code,
      communityId: sessionData.communityId,
      name: sessionData.name,
      status: sessionData.status,
      type: sessionData.type,
      mode: sessionData.mode,
      createdAt: sessionData.createdAt,
      endedAt: sessionData.endedAt,
    },
    matches: sessionData.matches,
  });
}
