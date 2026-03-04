import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { MatchStatus } from "@/types/enums";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await params;
  const { team1Score, team2Score } = await request.json();

  const match = await prisma.match.findUnique({
    where: { id },
    include: { court: true },
  });

  if (!match) {
    return NextResponse.json({ error: "Match not found" }, { status: 404 });
  }

  // Validate score format
  if (
    typeof team1Score !== "number" ||
    typeof team2Score !== "number" ||
    team1Score < 0 ||
    team2Score < 0
  ) {
    return NextResponse.json({ error: "Invalid score" }, { status: 400 });
  }

  // Validate: 21+ win by 2, OR cap at 30
  const maxScore = Math.max(team1Score, team2Score);
  const minScore = Math.min(team1Score, team2Score);
  
  const isWinBy2 = maxScore >= 21 && maxScore - minScore >= 2;
  const isCapAt30 = maxScore === 30 && maxScore - minScore === 1; // 30-29 specifically

  if (!isWinBy2 && !isCapAt30) {
    return NextResponse.json(
      { error: "Score must be 21+ win by 2, or 30-29 cap" },
      { status: 400 }
    );
  }

  const winnerTeam = team1Score > team2Score ? 1 : 2;

  // Update match with pending approval status using atomic updateMany
  const updatedResult = await prisma.match.updateMany({
    where: { id, status: MatchStatus.IN_PROGRESS },
    data: {
      team1Score,
      team2Score,
      winnerTeam,
      status: MatchStatus.PENDING_APPROVAL,
      completedAt: new Date(),
    },
  });

  if (updatedResult.count === 0) {
    // Re-fetch to see current status for better error message
    const currentMatch = await prisma.match.findUnique({ where: { id } });
    return NextResponse.json(
      { 
        error: `Cannot submit score. Match is currently ${currentMatch?.status || 'unknown'}. Expected ${MatchStatus.IN_PROGRESS}.`,
        status: currentMatch?.status 
      },
      { status: 409 }
    );
  }

  // Fetch updated match for the response
  const updated = await prisma.match.findUnique({
    where: { id },
    include: {
      team1User1: { select: { id: true, name: true } },
      team1User2: { select: { id: true, name: true } },
      team2User1: { select: { id: true, name: true } },
      team2User2: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json(updated);
}
