import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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
    const { courtId } = body;

    if (!courtId) {
      return NextResponse.json({ error: "Court ID required" }, { status: 400 });
    }

    // 1. Fetch fresh session data with all players and ALL matches
    const sessionData = await prisma.session.findUnique({
      where: { code },
      include: {
        players: {
          include: { user: { select: { id: true, name: true, elo: true } } },
        },
        matches: true, 
      },
    });

    if (!sessionData) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    if (sessionData.status !== "ACTIVE") {
      return NextResponse.json({ error: "Session not active" }, { status: 400 });
    }

    // 2. Calculate match counts and track the most recently finished players
    const matchCounts: Record<string, number> = {};
    sessionData.players.forEach(p => {
      matchCounts[p.userId] = 0;
    });
    
    // Find the most recently completed match in the entire session
    const lastCompletedMatch = [...sessionData.matches]
      .filter(m => m.status === "COMPLETED")
      .sort((a, b) => {
        const timeA = a.completedAt ? new Date(a.completedAt).getTime() : 0;
        const timeB = b.completedAt ? new Date(b.completedAt).getTime() : 0;
        return timeB - timeA;
      })[0];

    const recentlyFinishedIds = lastCompletedMatch 
      ? new Set([lastCompletedMatch.team1User1Id, lastCompletedMatch.team1User2Id, lastCompletedMatch.team2User1Id, lastCompletedMatch.team2User2Id])
      : new Set();

    sessionData.matches.forEach(m => {
      [m.team1User1Id, m.team1User2Id, m.team2User1Id, m.team2User2Id].forEach(id => {
        if (matchCounts[id] !== undefined) {
          matchCounts[id]++;
        }
      });
    });

    // ... (Step 3 remains same)

    // 4. Filter and Sort available players
    // PRIMARY: REST RULE (Prioritize people who were NOT in the last finished match)
    // SECONDARY: FEWEST matches played (Balance)
    // TERTIARY: Randomize
    const availablePlayers = sessionData.players
      .filter((p) => !activeMatchPlayerIds.has(p.userId) && !p.isPaused)
      .map(p => ({
        ...p,
        _isResting: recentlyFinishedIds.has(p.userId) ? 1 : 0, // 0 = waiting longest, 1 = just finished
        _matchCount: matchCounts[p.userId] || 0,
        _random: Math.random()
      }))
      .sort((a, b) => {
        // Priority 1: Rest those who just played if others are available
        if (a._isResting !== b._isResting) {
          return a._isResting - b._isResting;
        }
        // Priority 2: Balance match counts
        if (a._matchCount !== b._matchCount) {
          return a._matchCount - b._matchCount;
        }
        // Priority 3: Randomize
        return a._random - b._random;
      });

    // Logging for debugging imbalance
    console.log(`[Matchmaking] Session: ${code}, Available: ${availablePlayers.length}`);
    availablePlayers.slice(0, 10).forEach(p => {
      console.log(` - Player: ${p.user.name}, Matches: ${p._matchCount}`);
    });

    if (availablePlayers.length < 4) {
      return NextResponse.json({ error: `Not enough available players (need 4, have ${availablePlayers.length})` }, { status: 400 });
    }

    // 5. Select the 4 players who have played the least
    const selectedPlayers = availablePlayers.slice(0, 4);
    const selectedIds = selectedPlayers.map(p => p.userId);

    // 6. Find the most balanced teams among these 4 based on ELO
    const partitions = getDoublesPartitions(selectedIds);
    let bestPartition = partitions[0];
    let bestScore = Infinity;

    for (const partition of partitions) {
      const p1 = selectedPlayers.find(p => p.userId === partition.team1[0])!;
      const p2 = selectedPlayers.find(p => p.userId === partition.team1[1])!;
      const p3 = selectedPlayers.find(p => p.userId === partition.team2[0])!;
      const p4 = selectedPlayers.find(p => p.userId === partition.team2[1])!;

      const team1AvgElo = (p1.user.elo + p2.user.elo) / 2;
      const team2AvgElo = (p3.user.elo + p4.user.elo) / 2;
      let balanceScore = Math.abs(team1AvgElo - team2AvgElo);

      // Repeat partner penalty
      if (p1.lastPartnerId === p2.userId || p2.lastPartnerId === p1.userId) {
        balanceScore += 1000; // Even heavier penalty to ensure variety
      }
      if (p3.lastPartnerId === p4.userId || p4.lastPartnerId === p3.userId) {
        balanceScore += 1000;
      }

      if (balanceScore < bestScore) {
        bestScore = balanceScore;
        bestPartition = partition;
      }
    }

    // 7. Create the match
    const newMatch = await prisma.match.create({
      data: {
        sessionId: sessionData.id,
        courtId,
        status: "IN_PROGRESS",
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

    // 8. Assign to court
    await prisma.court.update({
      where: { id: courtId },
      data: { currentMatchId: newMatch.id },
    });

    console.log(`[Matchmaking] Created Match: ${newMatch.id} on Court ${courtId}`);
    return NextResponse.json(newMatch);
  } catch (error: any) {
    console.error("Generate match error:", error);
    return NextResponse.json({ error: `Failed to generate match: ${error.message}` }, { status: 500 });
  }
}
