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
    
    // Authorization check
    if (!(session.user as any).isAdmin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const { code } = await params;
    const body = await request.json().catch(() => ({}));
    const { courtId } = body;

    if (!courtId) {
      return NextResponse.json({ error: "Court ID required" }, { status: 400 });
    }

    // 1. Fetch fresh session data with all players, matches and the session start time
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

    // 2. Identify busy players (those currently on court)
    // We treat PENDING and IN_PROGRESS as busy.
    // PENDING_APPROVAL players are technically off-court and could be available for the NEXT court.
    const busyPlayerIds = new Set(
      sessionData.matches
        .filter(m => ["PENDING", "IN_PROGRESS"].includes(m.status))
        .flatMap(m => [m.team1User1Id, m.team1User2Id, m.team2User1Id, m.team2User2Id])
    );

    // 3. Calculate player stats for fair selection
    const playerStats: Record<string, { matchCount: number; lastMatchAt: number }> = {};
    
    sessionData.players.forEach(p => {
      playerStats[p.userId] = {
        matchCount: 0,
        lastMatchAt: sessionData.createdAt.getTime(), // Default to session start
      };
    });

    sessionData.matches.forEach(m => {
      const matchTime = (m.completedAt || m.createdAt).getTime();
      [m.team1User1Id, m.team1User2Id, m.team2User1Id, m.team2User2Id].forEach(id => {
        if (playerStats[id]) {
          playerStats[id].matchCount++;
          if (matchTime > playerStats[id].lastMatchAt) {
            playerStats[id].lastMatchAt = matchTime;
          }
        }
      });
    });

    // 4. Select the 4 available players who have played the least and waited the longest
    const availablePlayers = sessionData.players
      .filter(p => !busyPlayerIds.has(p.userId) && !p.isPaused)
      .map(p => ({
        ...p,
        _matchCount: playerStats[p.userId].matchCount,
        _lastMatchAt: playerStats[p.userId].lastMatchAt,
        _random: Math.random()
      }))
      .sort((a, b) => {
        // Priority 1: Fewest matches played
        if (a._matchCount !== b._matchCount) {
          return a._matchCount - b._matchCount;
        }
        // Priority 2: Waited longest since their last match started
        if (a._lastMatchAt !== b._lastMatchAt) {
          return a._lastMatchAt - b._lastMatchAt;
        }
        // Priority 3: Random tie-breaker
        return a._random - b._random;
      });

    console.log(`[Matchmaking] Court: ${courtId}, Available: ${availablePlayers.length}`);
    availablePlayers.slice(0, 8).forEach(p => {
      console.log(` - ${p.user.name}: matches=${p._matchCount}, lastAt=${new Date(p._lastMatchAt).toLocaleTimeString()}`);
    });

    if (availablePlayers.length < 4) {
      return NextResponse.json({ 
        error: `Not enough players available (need 4, have ${availablePlayers.length})` 
      }, { status: 400 });
    }

    const selectedPlayers = availablePlayers.slice(0, 4);
    const selectedIds = selectedPlayers.map(p => p.userId);

    // 5. Find the most balanced teams among these 4 based on ELO and partner history
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

      // Penalty for repeating recent partners
      if (p1.lastPartnerId === p2.userId || p2.lastPartnerId === p1.userId) {
        balanceScore += 1000;
      }
      if (p3.lastPartnerId === p4.userId || p4.lastPartnerId === p3.userId) {
        balanceScore += 1000;
      }

      if (balanceScore < bestScore) {
        bestScore = balanceScore;
        bestPartition = partition;
      }
    }

    // 6. Transaction to create the match and assign it to the court
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

    console.log(`[Matchmaking] Created Match: ${newMatch.id} on Court ${courtId}`);
    return NextResponse.json(newMatch);
  } catch (error: any) {
    console.error("Generate match error:", error);
    return NextResponse.json({ error: `Failed to generate match: ${error.message}` }, { status: 500 });
  }
}
