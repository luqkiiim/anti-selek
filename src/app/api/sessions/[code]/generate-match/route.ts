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

    // 2. Identify busy players (those on court)
    const busyPlayerIds = new Set(
      sessionData.matches
        .filter(m => ["PENDING", "IN_PROGRESS"].includes(m.status))
        .flatMap(m => [m.team1User1Id, m.team1User2Id, m.team2User1Id, m.team2User2Id])
    );

    // 3. Calculate actual player stats
    const playerStats: Record<string, { matchCount: number; lastMatchAt: number }> = {};
    const sessionStartTime = sessionData.createdAt.getTime();
    
    sessionData.players.forEach(p => {
      playerStats[p.userId] = { matchCount: 0, lastMatchAt: sessionStartTime };
    });

    sessionData.matches.forEach(m => {
      const matchTime = (m.completedAt || m.createdAt).getTime();
      [m.team1User1Id, m.team1User2Id, m.team2User1Id, m.team2User2Id].forEach(id => {
        if (playerStats[id]) {
          playerStats[id].matchCount++;
          if (matchTime > playerStats[id].lastMatchAt) playerStats[id].lastMatchAt = matchTime;
        }
      });
    });

    // 4. Calculate Session Average Floor
    const activeCounts = Object.values(playerStats).map(s => s.matchCount).filter(c => c > 0);
    const sessionAvg = activeCounts.length > 0 ? activeCounts.reduce((a, b) => a + b, 0) / activeCounts.length : 0;
    const matchFloor = Math.floor(sessionAvg);

    // 5. Calculate waiting times for active rotation
    const activeTimes = Object.values(playerStats)
      .filter(s => s.lastMatchAt > sessionStartTime)
      .map(s => s.lastMatchAt);
    
    const now = Date.now();
    const minWait = activeTimes.length > 0 ? Math.min(...activeTimes) : sessionStartTime;
    const maxWait = activeTimes.length > 0 ? Math.max(...activeTimes) : now;

    // 6. Select Available Players
    const availablePlayers = sessionData.players
      .filter(p => !busyPlayerIds.has(p.userId) && !p.isPaused)
      .map(p => {
        const stats = playerStats[p.userId];
        let effectiveCount = stats.matchCount;
        let effectiveLastAt = stats.lastMatchAt;

        // INSTANT AVERAGE & INJECTION:
        // If a player is behind (unpaused or late joiner), they instantly get the floor match count
        // AND are injected into the current rotation's time range to ensure immediate mixing.
        if (stats.matchCount < matchFloor) {
          effectiveCount = matchFloor;
          // Only inject if they haven't played since unpausing/joining
          if (stats.lastMatchAt === sessionStartTime) {
             const jitter = (p.userId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % 100) / 100;
             effectiveLastAt = minWait + (jitter * (maxWait - minWait));
          }
        }

        return { 
          ...p, 
          _effCount: effectiveCount, 
          _effLastAt: effectiveLastAt, 
          _actual: stats.matchCount,
          _random: Math.random() 
        };
      })
      .sort((a, b) => {
        // Priority 1: Match Count (Boosted for unpaused/late joiners)
        if (a._effCount !== b._effCount) return a._effCount - b._effCount;
        // Priority 2: Waiting Time (Injected for unpaused/late joiners)
        if (a._effLastAt !== b._effLastAt) return a._effLastAt - b._effLastAt;
        // Priority 3: Random tie-breaker
        return a._random - b._random;
      });

    console.log(`[Matchmaking] Avg: ${sessionAvg.toFixed(1)}, Available: ${availablePlayers.length}`);

    if (availablePlayers.length < 4) {
      return NextResponse.json({ error: `Not enough players available (need 4, have ${availablePlayers.length})` }, { status: 400 });
    }

    const selected = availablePlayers.slice(0, 4);
    const selectedIds = selected.map(p => p.userId);

    // 7. Partition into teams (ELO & Partner Balancing)
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

    // 8. Create Match
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
