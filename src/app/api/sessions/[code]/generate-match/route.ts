import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Helper: get all possible doubles partitions
function getDoublesPartitions(players: string[]): { team1: [string, string]; team2: [string, string] }[] {
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
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { code } = await params;
  const { courtId } = await request.json();

  const sessionData = await prisma.session.findUnique({
    where: { code },
    include: {
      players: {
        include: { user: { select: { id: true, name: true, elo: true } } },
      },
      courts: true,
      matches: {
        where: { status: { in: ["PENDING", "IN_PROGRESS", "PENDING_APPROVAL"] } },
      },
    },
  });

  if (!sessionData) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  if (sessionData.status !== "ACTIVE") {
    return NextResponse.json({ error: "Session not active" }, { status: 400 });
  }

  // Find available players (not in any active match)
  const activeMatchPlayerIds = new Set(
    sessionData.matches.flatMap((m) => [
      m.team1User1Id, m.team1User2Id, m.team2User1Id, m.team2User2Id
    ])
  );

  const availablePlayers = sessionData.players
    .filter((p) => !activeMatchPlayerIds.has(p.userId))
    .sort((a, b) => b.sessionPoints - a.sessionPoints);

  if (availablePlayers.length < 4) {
    return NextResponse.json({ error: "Not enough available players (need 4)" }, { status: 400 });
  }

  // Take top 8 by session points
  const topPlayers = availablePlayers.slice(0, 8).map((p) => p.userId);

  // Find best partition
  const partitions = getDoublesPartitions(topPlayers);
  let bestPartition = partitions[0];
  let bestScore = Infinity;

  for (const partition of partitions) {
    // Get session points for each player
    const p1 = sessionData.players.find((sp) => sp.userId === partition.team1[0])!;
    const p2 = sessionData.players.find((sp) => sp.userId === partition.team1[1])!;
    const p3 = sessionData.players.find((sp) => sp.userId === partition.team2[0])!;
    const p4 = sessionData.players.find((sp) => sp.userId === partition.team2[1])!;

    const team1Points = p1.sessionPoints + p2.sessionPoints;
    const team2Points = p3.sessionPoints + p4.sessionPoints;
    let score = Math.abs(team1Points - team2Points);

    // Apply repeat partner penalty
    const sp1 = sessionData.players.find((sp) => sp.userId === partition.team1[0]);
    const sp2 = sessionData.players.find((sp) => sp.userId === partition.team1[1]);
    const sp3 = sessionData.players.find((sp) => sp.userId === partition.team2[0]);
    const sp4 = sessionData.players.find((sp) => sp.userId === partition.team2[1]);

    if (sp1?.lastPartnerId === partition.team1[1] || sp2?.lastPartnerId === partition.team1[0]) {
      score += 100;
    }
    if (sp3?.lastPartnerId === partition.team2[1] || sp4?.lastPartnerId === partition.team2[0]) {
      score += 100;
    }

    if (score < bestScore) {
      bestScore = score;
      bestPartition = partition;
    }
  }

  // Create match
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

  // Update court to show this as current match
  await prisma.court.update({
    where: { id: courtId },
    data: { currentMatchId: newMatch.id },
  });

  return NextResponse.json(newMatch);
}
