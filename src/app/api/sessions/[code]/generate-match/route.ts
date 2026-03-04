import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Helper: Shuffle array
function shuffle<T>(array: T[]): T[] {
  const newArray = [...array];
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
  }
  return newArray;
}

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
    
    if (!(session.user as any).isAdmin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const { code } = await params;
    const body = await request.json().catch(() => ({}));
    const { courtId } = body;

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
    if (sessionData.status !== "ACTIVE") return NextResponse.json({ error: "Session not active" }, { status: 400 });

    // 2. Identify busy players (those currently on court)
    const busyPlayerIds = new Set(
      sessionData.matches
        .filter(m => ["PENDING", "IN_PROGRESS"].includes(m.status))
        .flatMap(m => [m.team1User1Id, m.team1User2Id, m.team2User1Id, m.team2User2Id])
    );

    // 3. Calculate actual match counts
    const playerStats: Record<string, { matchCount: number }> = {};
    sessionData.players.forEach(p => {
      playerStats[p.userId] = { matchCount: 0 };
    });

    sessionData.matches.forEach(m => {
      [m.team1User1Id, m.team1User2Id, m.team2User1Id, m.team2User2Id].forEach(id => {
        if (playerStats[id]) playerStats[id].matchCount++;
      });
    });

    // 4. Calculate Session Average (from active players)
    const activeCounts = Object.values(playerStats).map(s => s.matchCount).filter(c => c > 0);
    const sessionAvg = activeCounts.length > 0 ? activeCounts.reduce((a, b) => a + b, 0) / activeCounts.length : 0;
    const matchFloor = Math.floor(sessionAvg);

    // 5. THE SHUFFLE-POOL SELECTION LOGIC
    // Group available players by their effective match count
    const availablePlayers = sessionData.players
      .filter(p => !busyPlayerIds.has(p.userId) && !p.isPaused)
      .map(p => {
        const actual = playerStats[p.userId].matchCount;
        // INSTANT AVERAGE: Boost late/unpaused players to the current floor
        const effective = Math.max(actual, matchFloor);
        return { ...p, _effectiveCount: effective, _actual: actual };
      });

    if (availablePlayers.length < 4) {
      return NextResponse.json({ error: `Not enough players available (need 4, have ${availablePlayers.length})` }, { status: 400 });
    }

    // Sort by effective count, then shuffle within each count level to ensure mixing
    const sortedByCount = availablePlayers.sort((a, b) => a._effectiveCount - b._effectiveCount);
    
    // We take the group of players at the lowest match count level
    const minCount = sortedByCount[0]._effectiveCount;
    const primaryPool = availablePlayers.filter(p => p._effectiveCount === minCount);
    
    let selected: typeof availablePlayers = [];
    
    if (primaryPool.length >= 4) {
      // If we have enough people at the same level (e.g. 12 people at 4 matches),
      // we shuffle them and pick 4. This GURANTEES mixing of unpaused players.
      selected = shuffle(primaryPool).slice(0, 4);
    } else {
      // If not enough at the lowest level, take all of them and fill from the next level
      selected = [...primaryPool];
      const secondaryPool = availablePlayers
        .filter(p => p._effectiveCount > minCount)
        .sort((a, b) => a._effectiveCount - b._effectiveCount);
      
      const nextLevelCount = secondaryPool[0]?._effectiveCount;
      const fillers = shuffle(secondaryPool.filter(p => p._effectiveCount === nextLevelCount));
      
      selected.push(...fillers.slice(0, 4 - selected.length));
    }

    console.log(`[Matchmaking] Avg: ${sessionAvg.toFixed(1)}, Selected: ${selected.map(p => p.user.name).join(', ')}`);

    const selectedIds = selected.map(p => p.userId);

    // 6. Partition into teams (ELO Balancing)
    const partitions = getDoublesPartitions(selectedIds);
    let bestPartition = partitions[0];
    let bestScore = Infinity;

    for (const partition of partitions) {
      const p1 = selected.find(p => p.userId === partition.team1[0])!;
      const p2 = selected.find(p => p.userId === partition.team1[1])!;
      const p3 = selected.find(p => p.userId === partition.team2[0])!;
      const p4 = selected.find(p => p.userId === partition.team2[1])!;

      const team1AvgElo = (p1.user.elo + p2.user.elo) / 2;
      const team2AvgElo = (p3.user.elo + p4.user.elo) / 2;
      let balanceScore = Math.abs(team1AvgElo - team2AvgElo);

      if (p1.lastPartnerId === p2.userId || p2.lastPartnerId === p1.userId) balanceScore += 1000;
      if (p3.lastPartnerId === p4.userId || p4.lastPartnerId === p3.userId) balanceScore += 1000;

      if (balanceScore < bestScore) {
        bestScore = balanceScore;
        bestPartition = partition;
      }
    }

    // 7. Create Match
    const newMatch = await prisma.$transaction(async (tx) => {
      const match = await tx.match.create({
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

      await tx.court.update({
        where: { id: courtId },
        data: { currentMatchId: match.id },
      });

      return match;
    });

    return NextResponse.json(newMatch);
  } catch (error: any) {
    console.error("Generate match error:", error);
    return NextResponse.json({ error: `Failed to generate match: ${error.message}` }, { status: 500 });
  }
}
