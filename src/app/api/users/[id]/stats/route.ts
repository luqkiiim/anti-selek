import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

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

  // Fetch all completed matches for this user
  const matches = await prisma.match.findMany({
    where: {
      status: "COMPLETED",
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
    };
  });

  const winRate = totalMatches > 0 ? Math.round((wins / totalMatches) * 100) : 0;

  return NextResponse.json({
    user,
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
