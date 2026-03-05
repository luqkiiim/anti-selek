import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { MatchStatus } from "@/types/enums";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await params;
  const url = new URL(request.url);
  const communityId = url.searchParams.get("communityId");

  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      elo: true,
      createdAt: true,
    },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  let effectiveElo = user.elo;

  if (communityId) {
    const [requesterMembership, targetMembership] = await Promise.all([
      prisma.communityMember.findUnique({
        where: {
          communityId_userId: {
            communityId,
            userId: session.user.id,
          },
        },
        select: { role: true },
      }),
      prisma.communityMember.findUnique({
        where: {
          communityId_userId: {
            communityId,
            userId: id,
          },
        },
        select: { elo: true },
      }),
    ]);

    if (!requesterMembership) {
      return NextResponse.json({ error: "Not authorized for this community" }, { status: 403 });
    }

    if (!targetMembership) {
      return NextResponse.json({ error: "Player is not in this community" }, { status: 404 });
    }

    effectiveElo = targetMembership.elo;
  }

  // Fetch all completed matches for this user
  const matches = await prisma.match.findMany({
    where: {
      status: MatchStatus.COMPLETED,
      ...(communityId ? { session: { communityId } } : {}),
      OR: [
        { team1User1Id: id },
        { team1User2Id: id },
        { team2User1Id: id },
        { team2User2Id: id },
      ],
    },
    orderBy: { completedAt: "desc" },
    include: {
      team1User1: { select: { id: true, name: true } },
      team1User2: { select: { id: true, name: true } },
      team2User1: { select: { id: true, name: true } },
      team2User2: { select: { id: true, name: true } },
      session: { select: { name: true, code: true } },
    },
  });

  const totalMatches = matches.length;
  let wins = 0;
  let pointsScored = 0;
  let pointsConceded = 0;

  const matchHistory = matches.map((match) => {
    const isTeam1 =
      match.team1User1Id === id || match.team1User2Id === id;

    const myTeam = isTeam1 ? 1 : 2;
    const isWinner = match.winnerTeam === myTeam;

    if (isWinner) wins++;

    const myScore = isTeam1 ? match.team1Score : match.team2Score;
    const opponentScore = isTeam1 ? match.team2Score : match.team1Score;
    const myEloChange = isTeam1 ? match.team1EloChange : match.team2EloChange;

    pointsScored += myScore || 0;
    pointsConceded += opponentScore || 0;

    return {
      id: match.id,
      date: match.completedAt,
      sessionName: match.session.name,
      partner: isTeam1
        ? match.team1User1Id === id
          ? match.team1User2
          : match.team1User1
        : match.team2User1Id === id
        ? match.team2User2
        : match.team2User1,
      opponents: isTeam1
        ? [match.team2User1, match.team2User2]
        : [match.team1User1, match.team1User2],
      score: `${myScore} - ${opponentScore}`,
      result: isWinner ? "WIN" : "LOSS",
      eloChange: myEloChange,
    };
  });

  const winRate = totalMatches > 0 ? Math.round((wins / totalMatches) * 100) : 0;

  return NextResponse.json({
    user: {
      ...user,
      elo: effectiveElo,
    },
    context: communityId ? { communityId } : null,
    stats: {
      totalMatches,
      wins,
      losses: totalMatches - wins,
      winRate,
      pointsScored,
      pointsConceded,
    },
    matchHistory,
  });
}
