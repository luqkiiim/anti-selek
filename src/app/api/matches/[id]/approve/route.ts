import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCommunityEloByUserId } from "@/lib/communityElo";
import { isValidBadmintonScore } from "@/lib/matchRules";
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
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { id } = await params;

    const match = await prisma.match.findUnique({
      where: { id },
      include: {
        session: {
          select: { communityId: true },
        },
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
    let isCommunityAdmin = false;
    if (match.session.communityId) {
      const membership = await prisma.communityMember.findUnique({
        where: {
          communityId_userId: {
            communityId: match.session.communityId,
            userId: session.user.id,
          },
        },
        select: { role: true },
      });
      isCommunityAdmin = membership?.role === "ADMIN";
    }
    const isAdmin = !!session.user.isAdmin || isCommunityAdmin;
    const isPlayer = [match.team1User1Id, match.team1User2Id, match.team2User1Id, match.team2User2Id].includes(session.user.id);

    if (!isAdmin && !isPlayer) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    // Allow admin to override scores
    const body = await request.json().catch(() => ({}));
    const { team1Score, team2Score } = body as {
      team1Score?: unknown;
      team2Score?: unknown;
    };
    let finalTeam1Score = match.team1Score;
    let finalTeam2Score = match.team2Score;

    if (isAdmin && typeof team1Score === "number" && typeof team2Score === "number") {
      finalTeam1Score = team1Score;
      finalTeam2Score = team2Score;
    }

    if (typeof finalTeam1Score !== "number" || typeof finalTeam2Score !== "number") {
      return NextResponse.json({ error: "Missing match scores" }, { status: 400 });
    }
    if (!isValidBadmintonScore(finalTeam1Score, finalTeam2Score)) {
      return NextResponse.json(
        { error: "Score must be 21+ win by 2, or 30-29 cap" },
        { status: 400 }
      );
    }

    // Calculate points and ELO
    const team1Points = finalTeam1Score;
    const team2Points = finalTeam2Score;
    const winnerTeam = team1Points > team2Points ? 1 : 2;
    const now = new Date();

    const playerIds = [match.team1User1Id, match.team1User2Id, match.team2User1Id, match.team2User2Id];
    const communityEloByUserId =
      match.session.communityId
        ? await getCommunityEloByUserId(match.session.communityId, playerIds)
        : new Map<string, number>();

    const team1User1Elo = communityEloByUserId.get(match.team1User1Id) ?? match.team1User1.elo;
    const team1User2Elo = communityEloByUserId.get(match.team1User2Id) ?? match.team1User2.elo;
    const team2User1Elo = communityEloByUserId.get(match.team2User1Id) ?? match.team2User1.elo;
    const team2User2Elo = communityEloByUserId.get(match.team2User2Id) ?? match.team2User2.elo;

    const team1AvgElo = (team1User1Elo + team1User2Elo) / 2;
    const team2AvgElo = (team2User1Elo + team2User2Elo) / 2;

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
        if (match.session.communityId) {
          await tx.communityMember.updateMany({
            where: {
              communityId: match.session.communityId,
              userId: { in: [match.team1User1Id, match.team1User2Id] },
            },
            data: { elo: { increment: team1EloChange } },
          });
          await tx.communityMember.updateMany({
            where: {
              communityId: match.session.communityId,
              userId: { in: [match.team2User1Id, match.team2User2Id] },
            },
            data: { elo: { increment: team2EloChange } },
          });
        } else {
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
        }

        // Clear current match from court
        await tx.court.update({
          where: { id: match.courtId },
          data: { currentMatchId: null },
        });

        return updatedMatch;
      });

      return NextResponse.json(result);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "";
      if (message === "ALREADY_PROCESSED") {
        return NextResponse.json({ error: "Match already approved or modified." }, { status: 409 });
      }
      throw error;
    }
  } catch (error) {
    console.error("Approve match error:", error);
    return NextResponse.json({ error: "Failed to approve match" }, { status: 500 });
  }
}
