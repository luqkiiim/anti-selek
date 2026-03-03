import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const K_FACTOR = 32;

function calculateEloChange(winnerElo: number, loserElo: number): number {
  const expectedWinner = 1 / (1 + Math.pow(10, (loserElo - winnerElo) / 400));
  return Math.round(K_FACTOR * (1 - expectedWinner));
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

  if (match.status !== "PENDING_APPROVAL") {
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

  const team1AvgElo = (match.team1User1.elo + match.team1User2.elo) / 2;
  const team2AvgElo = (match.team2User1.elo + match.team2User2.elo) / 2;
  const eloDelta = calculateEloChange(team1AvgElo, team2AvgElo);

  const winnerEloChange = winnerTeam === 1 ? eloDelta : -eloDelta;
  const loserEloChange = -eloDelta;

  // Transaction: update match, points, ELO, clear court
  const result = await prisma.$transaction(async (tx) => {
    // Update match
    const updatedMatch = await tx.match.update({
      where: { id },
      data: {
        team1Score: finalTeam1Score,
        team2Score: finalTeam2Score,
        winnerTeam,
        status: "COMPLETED",
        completedAt: new Date(),
      },
    });

    // Update session points: team 1 gets team1Points, team 2 gets team2Points
    await tx.sessionPlayer.updateMany({
      where: {
        sessionId: match.sessionId,
        userId: { in: [match.team1User1Id, match.team1User2Id] },
      },
      data: {
        sessionPoints: {
          increment: team1Points,
        },
      },
    });

    await tx.sessionPlayer.updateMany({
      where: {
        sessionId: match.sessionId,
        userId: { in: [match.team2User1Id, match.team2User2Id] },
      },
      data: {
        sessionPoints: {
          increment: team2Points,
        },
      },
    });

    // Update last partner for each player
    const sp1 = await tx.sessionPlayer.findUnique({
      where: { sessionId_userId: { sessionId: match.sessionId, userId: match.team1User1Id } }
    });
    const sp2 = await tx.sessionPlayer.findUnique({
      where: { sessionId_userId: { sessionId: match.sessionId, userId: match.team1User2Id } }
    });
    const sp3 = await tx.sessionPlayer.findUnique({
      where: { sessionId_userId: { sessionId: match.sessionId, userId: match.team2User1Id } }
    });
    const sp4 = await tx.sessionPlayer.findUnique({
      where: { sessionId_userId: { sessionId: match.sessionId, userId: match.team2User2Id } }
    });

    if (sp1) await tx.sessionPlayer.update({
      where: { id: sp1.id },
      data: { lastPartnerId: match.team1User2Id },
    });
    if (sp2) await tx.sessionPlayer.update({
      where: { id: sp2.id },
      data: { lastPartnerId: match.team1User1Id },
    });
    if (sp3) await tx.sessionPlayer.update({
      where: { id: sp3.id },
      data: { lastPartnerId: match.team2User2Id },
    });
    if (sp4) await tx.sessionPlayer.update({
      where: { id: sp4.id },
      data: { lastPartnerId: match.team2User1Id },
    });

    // Update ELO for all 4 players
    await tx.user.update({
      where: { id: match.team1User1Id },
      data: { elo: { increment: winnerTeam === 1 ? winnerEloChange : loserEloChange } },
    });
    await tx.user.update({
      where: { id: match.team1User2Id },
      data: { elo: { increment: winnerTeam === 1 ? winnerEloChange : loserEloChange } },
    });
    await tx.user.update({
      where: { id: match.team2User1Id },
      data: { elo: { increment: winnerTeam === 2 ? winnerEloChange : loserEloChange } },
    });
    await tx.user.update({
      where: { id: match.team2User2Id },
      data: { elo: { increment: winnerTeam === 2 ? winnerEloChange : loserEloChange } },
    });

    // Clear current match from court
    await tx.court.update({
      where: { id: match.courtId },
      data: { currentMatchId: null },
    });

    return updatedMatch;
  });

  return NextResponse.json(result);
}
