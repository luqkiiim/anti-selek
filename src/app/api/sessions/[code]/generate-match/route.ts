import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCommunityEloByUserId } from "@/lib/communityElo";
import { selectMatchPlayers } from "@/lib/matchmaking/selectPlayers";
import { getBusyPlayerIds } from "@/lib/matchmaking/busyFilter";
import { MatchStatus, SessionStatus } from "@/types/enums";

export const dynamic = "force-dynamic";

// Helper: get all possible doubles partitions for exactly 4 players
function getDoublesPartitions(players: string[]): { team1: [string, string]; team2: [string, string] }[] {
  if (players.length < 4) return [];
  const [a, b, c, d] = players;
  return [
    { team1: [a, b], team2: [c, d] },
    { team1: [a, c], team2: [b, d] },
    { team1: [a, d], team2: [b, c] },
  ];
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { code } = await params;
    const body = await request.json().catch(() => ({}));
    const { courtId, forceReshuffle = false } = body;

    if (!courtId) {
      return NextResponse.json({ error: "Court ID required" }, { status: 400 });
    }

    // 1. Fetch fresh session data
    const sessionData = await prisma.session.findUnique({
      where: { code },
      include: {
        players: {
          include: { user: { select: { id: true, name: true, elo: true } } },
        },
        matches: true, 
      },
    });

    if (!sessionData) return NextResponse.json({ error: "Session not found" }, { status: 404 });
    if (sessionData.status !== SessionStatus.ACTIVE) return NextResponse.json({ error: "Session not active" }, { status: 400 });

    let isCommunityAdmin = false;
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
      isCommunityAdmin = membership?.role === "ADMIN";
    }
    if (!session.user.isAdmin && !isCommunityAdmin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const targetCourt = await prisma.court.findFirst({
      where: { id: courtId, sessionId: sessionData.id },
      include: { currentMatch: true },
    });
    if (!targetCourt) {
      return NextResponse.json({ error: "Court not found in this session" }, { status: 404 });
    }

    // 2. Handle Reshuffle: Delete existing match if requested
    if (forceReshuffle && targetCourt.currentMatch) {
      // Only allow reshuffle if match isn't approved/completed
      const allowedStatuses = [MatchStatus.PENDING, MatchStatus.IN_PROGRESS];
      if (!allowedStatuses.includes(targetCourt.currentMatch.status as any)) {
        return NextResponse.json({ error: "Cannot reshuffle a match that is already scored or completed." }, { status: 400 });
      }

      await prisma.$transaction([
        prisma.match.delete({ where: { id: targetCourt.currentMatch.id } }),
        prisma.court.update({
          where: { id: courtId },
          data: { currentMatchId: null },
        }),
      ]);
    }

    // 2. Identify busy players (those on court)
    const busyPlayerIds = getBusyPlayerIds(sessionData.matches);

    // 3. Select Available Players
    const availableCandidates = sessionData.players
      .filter(p => !busyPlayerIds.has(p.userId) && !p.isPaused)
      .map(p => ({
        userId: p.userId,
        matchesPlayed: p.matchesPlayed,
        availableSince: p.availableSince,
        joinedAt: p.joinedAt,
        inactiveSeconds: p.inactiveSeconds,
      }));

    const selected = selectMatchPlayers(availableCandidates);

    if (!selected) {
      return NextResponse.json({ error: `Not enough players available (need 4, have ${availableCandidates.length})` }, { status: 400 });
    }

    const selectedIds = selected.map(p => p.userId);

    const communityEloByUserId =
      sessionData.communityId && sessionData.players.length > 0
        ? await getCommunityEloByUserId(
            sessionData.communityId,
            sessionData.players.map((p) => p.userId)
          )
        : new Map<string, number>();

    const getPlayerElo = (player: (typeof sessionData.players)[number]) =>
      communityEloByUserId.get(player.userId) ?? player.user.elo;

    // 6. Partition into teams (ELO & Partner Balancing)
    const partitions = getDoublesPartitions(selectedIds);
    let bestPartition = partitions[0];
    let bestScore = Infinity;

    for (const partition of partitions) {
      const p1 = sessionData.players.find(p => p.userId === partition.team1[0])!;
      const p2 = sessionData.players.find(p => p.userId === partition.team1[1])!;
      const p3 = sessionData.players.find(p => p.userId === partition.team2[0])!;
      const p4 = sessionData.players.find(p => p.userId === partition.team2[1])!;

      const team1AvgElo = (getPlayerElo(p1) + getPlayerElo(p2)) / 2;
      const team2AvgElo = (getPlayerElo(p3) + getPlayerElo(p4)) / 2;
      let balanceScore = Math.abs(team1AvgElo - team2AvgElo);

      if (p1.lastPartnerId === p2.userId || p2.lastPartnerId === p1.userId) balanceScore += 1000;
      if (p3.lastPartnerId === p4.userId || p4.lastPartnerId === p3.userId) balanceScore += 1000;

      if (balanceScore < bestScore) {
        bestScore = balanceScore;
        bestPartition = partition;
      }
    }

    // 8. Create Match
    const newMatch = await prisma.$transaction(async (tx) => {
      // 8a. RE-CHECK: Ensure selected players didn't become busy since we last checked
      const concurrentBusyMatches = await tx.match.findMany({
        where: {
          sessionId: sessionData.id,
          status: { in: [MatchStatus.PENDING, MatchStatus.IN_PROGRESS, MatchStatus.PENDING_APPROVAL] },
          OR: [
            { team1User1Id: { in: selectedIds } },
            { team1User2Id: { in: selectedIds } },
            { team2User1Id: { in: selectedIds } },
            { team2User2Id: { in: selectedIds } },
          ],
        },
      });

      if (concurrentBusyMatches.length > 0) {
        throw new Error("PLAYERS_BUSY");
      }

      // 8b. Create the match
      const match = await tx.match.create({
        data: {
          sessionId: sessionData.id,
          courtId,
          status: MatchStatus.IN_PROGRESS,
          team1User1Id: bestPartition.team1[0],
          team1User2Id: bestPartition.team1[1],
          team2User1Id: bestPartition.team2[0],
          team2User2Id: bestPartition.team2[1],
        },
        include: {
          team1User1: { select: { id: true, name: true } },
          team1User2: { select: { id: true, name: true } },
          team2User1: { select: { id: true, name: true } },
          team2User2: { select: { id: true, name: true } },
        },
      });

      // 8c. RE-CHECK: Ensure court is still free using atomic updateMany
      const updatedCourt = await tx.court.updateMany({
        where: { id: courtId, currentMatchId: null },
        data: { currentMatchId: match.id },
      });

      if (updatedCourt.count === 0) {
        throw new Error("COURT_BUSY");
      }

      return match;
    });

    return NextResponse.json(newMatch);
  } catch (error: any) {
    if (error.message === "PLAYERS_BUSY") {
      return NextResponse.json({ error: "One or more selected players just started another match. Please retry." }, { status: 409 });
    }
    if (error.message === "COURT_BUSY") {
      return NextResponse.json({ error: "This court already has a match in progress." }, { status: 409 });
    }
    console.error("Generate match error:", error);
    return NextResponse.json({ error: "Failed to generate match" }, { status: 500 });
  }
}
