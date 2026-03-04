import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { MatchStatus } from "@/types/enums";

export const dynamic = "force-dynamic";

const K_FACTOR = 32;

function calculateEloChange(winnerElo: number, loserElo: number, winnerScore: number, loserScore: number): number {
  const expectedWinner = 1 / (1 + Math.pow(10, (loserElo - winnerElo) / 400));
  const scoreDiff = winnerScore - loserScore;
  
  // Margin of victory multiplier
  // Minimal win (diff of 2): multiplier = 1.0
  // Close win (30-29): multiplier = 0.95
  // Large win (e.g., 21-5, diff of 16): multiplier = 1 + (16-2)*0.05 = 1.7
  const marginMultiplier = 1 + (scoreDiff - 2) * 0.05;
  
  return Math.round(K_FACTOR * (1 - expectedWinner) * marginMultiplier);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await params;

  const match = await prisma.match.findUnique({
    where: { id },
    include: {
      court: true,
      team1User1: { select: { id: true, name: true, elo: true } },
      team1User2: { select: { id: true, name: true, elo: true } },
      team2User1: { select: { id: true, name: true, elo: true } },
      team2User2: { select: { id: true, name: true, elo: true } },
    },
  });

  if (!match) {
    return NextResponse.json({ error: "Match not found" }, { status: 404 });
  }

  if (match.status !== MatchStatus.PENDING_APPROVAL) {
    return NextResponse.json({ error: "Match not pending approval" }, { status: 400 });
  }

  // Check if admin or one of the players
  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  const adminEmails = process.env.ADMIN_EMAILS?.split(",").map(e => e.trim()) || [];
  const isAdmin = user?.email && adminEmails.includes(user.email);
  const isPlayer = [match.team1User1Id, match.team1User2Id, match.team2User1Id, match.team2User2Id].includes(session.user.id);

  if (!isAdmin && !isPlayer) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  // Allow admin to override scores
  const { team1Score, team2Score } = await request.json();
  let finalTeam1Score = match.team1Score;
  let finalTeam2Score = match.team2Score;

  if (isAdmin && typeof team1Score === "number" && typeof team2Score === "number") {
    finalTeam1Score = team1Score;
    finalTeam2Score = team2Score;
  }

  // Calculate points and ELO
  const team1Points = finalTeam1Score!;
  const team2Points = finalTeam2Score!;
  const winnerTeam = team1Points > team2Points ? 1 : 2;
  const now = new Date();

  const team1AvgElo = (match.team1User1.elo + match.team1User2.elo) / 2;
  const team2AvgElo = (match.team2User1.elo + match.team2User2.elo) / 2;
  
  let team1EloChange: number;
  let team2EloChange: number;

  if (winnerTeam === 1) {
    const delta = calculateEloChange(team1AvgElo, team2AvgElo, team1Points, team2Points);
    team1EloChange = delta;
    team2EloChange = -delta;
  } else {
    const delta = calculateEloChange(team2AvgElo, team1AvgElo, team2Points, team1Points);
    team1EloChange = -delta;
    team2EloChange = delta;
  }

  // Transaction: update match, points, ELO, clear court
  try {
    const result = await prisma.$transaction(async (tx) => {
      // 1. ATOMIC UPDATE: Only update if still PENDING_APPROVAL
      const updatedMatchResult = await tx.match.updateMany({
        where: { id, status: MatchStatus.PENDING_APPROVAL },
        data: {
          team1Score: finalTeam1Score,
          team2Score: finalTeam2Score,
          winnerTeam,
          team1EloChange: team1EloChange,
          team2EloChange: team2EloChange,
          status: MatchStatus.COMPLETED,
          completedAt: now,
        },
      });

      if (updatedMatchResult.count === 0) {
        throw new Error("ALREADY_PROCESSED");
      }

      // 2. Fetch the match again to confirm state (since updateMany doesn't return the object)
      const updatedMatch = await tx.match.findUnique({
        where: { id },
      });

      // Update session points and matchmaking state
      await tx.sessionPlayer.updateMany({
        where: {
          sessionId: match.sessionId,
          userId: { in: [match.team1User1Id, match.team1User2Id] },
        },
        data: {
          sessionPoints: { increment: team1Points },
          matchesPlayed: { increment: 1 },
          lastPlayedAt: now,
          availableSince: now,
        },
      });

      await tx.sessionPlayer.updateMany({
        where: {
          sessionId: match.sessionId,
          userId: { in: [match.team2User1Id, match.team2User2Id] },
        },
        data: {
          sessionPoints: { increment: team2Points },
          matchesPlayed: { increment: 1 },
          lastPlayedAt: now,
          availableSince: now,
        },
      });

      // Update last partner for each player
      await tx.sessionPlayer.update({
        where: { sessionId_userId: { sessionId: match.sessionId, userId: match.team1User1Id } },
        data: { lastPartnerId: match.team1User2Id },
      });
      await tx.sessionPlayer.update({
        where: { sessionId_userId: { sessionId: match.sessionId, userId: match.team1User2Id } },
        data: { lastPartnerId: match.team1User1Id },
      });
      await tx.sessionPlayer.update({
        where: { sessionId_userId: { sessionId: match.sessionId, userId: match.team2User1Id } },
        data: { lastPartnerId: match.team2User2Id },
      });
      await tx.sessionPlayer.update({
        where: { sessionId_userId: { sessionId: match.sessionId, userId: match.team2User2Id } },
        data: { lastPartnerId: match.team2User1Id },
      });

      // Update ELO for all 4 players
      await tx.user.update({
        where: { id: match.team1User1Id },
        data: { elo: { increment: team1EloChange } },
      });
      await tx.user.update({
        where: { id: match.team1User2Id },
        data: { elo: { increment: team1EloChange } },
      });
      await tx.user.update({
        where: { id: match.team2User1Id },
        data: { elo: { increment: team2EloChange } },
      });
      await tx.user.update({
        where: { id: match.team2User2Id },
        data: { elo: { increment: team2EloChange } },
      });

      // Clear current match from court
      await tx.court.update({
        where: { id: match.courtId },
        data: { currentMatchId: null },
      });

      return updatedMatch;
    });

    return NextResponse.json(result);
  } catch (error: any) {
    if (error.message === "ALREADY_PROCESSED") {
      return NextResponse.json({ error: "Match already approved or modified." }, { status: 409 });
    }
    throw error;
  }
}
