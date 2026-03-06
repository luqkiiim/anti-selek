import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCommunityEloByUserId } from "@/lib/communityElo";
import { selectMatchPlayers } from "@/lib/matchmaking/selectPlayers";
import { getBusyPlayerIds } from "@/lib/matchmaking/busyFilter";
import {
  MatchStatus,
  PartnerPreference,
  PlayerGender,
  SessionMode,
  SessionStatus,
} from "@/types/enums";

export const dynamic = "force-dynamic";
const REPEAT_PARTNER_PENALTY = 15;

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

type MixicanoMatchType = "MENS" | "MIXED" | "WOMENS" | "HYBRID";

function inferMixicanoMatchType(
  team1: [{ gender: string }, { gender: string }],
  team2: [{ gender: string }, { gender: string }]
): MixicanoMatchType {
  const femaleCountFor = (team: [{ gender: string }, { gender: string }]) =>
    team.filter((player) => player.gender === PlayerGender.FEMALE).length;

  const team1FemaleCount = femaleCountFor(team1);
  const team2FemaleCount = femaleCountFor(team2);

  if (team1FemaleCount === 2 && team2FemaleCount === 2) return "WOMENS";
  if (team1FemaleCount === 1 && team2FemaleCount === 1) return "MIXED";
  if (team1FemaleCount === 0 && team2FemaleCount === 0) return "MENS";
  return "HYBRID";
}

function isValidMixicanoPartition(
  team1: [{ gender: string; partnerPreference: string }, { gender: string; partnerPreference: string }],
  team2: [{ gender: string; partnerPreference: string }, { gender: string; partnerPreference: string }]
) {
  const players = [...team1, ...team2];

  // MIXICANO only works with concrete binary gender for now.
  const hasInvalidGender = players.some(
    (player) =>
      ![PlayerGender.MALE, PlayerGender.FEMALE].includes(player.gender as PlayerGender)
  );
  if (hasInvalidGender) return false;

  const matchType = inferMixicanoMatchType(team1, team2);

  // Women marked FEMALE_FLEX can only play mixed doubles or women's doubles.
  const violatesFemaleFlex = players.some((player) => {
    const gender = player.gender as PlayerGender;
    const preference = player.partnerPreference as PartnerPreference;
    return (
      gender === PlayerGender.FEMALE &&
      preference === PartnerPreference.FEMALE_FLEX &&
      !["MIXED", "WOMENS"].includes(matchType)
    );
  });

  return !violatesFemaleFlex;
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
    const {
      courtId,
      forceReshuffle = false,
      undoCurrentMatch = false,
    } = body as {
      courtId?: string;
      forceReshuffle?: boolean;
      undoCurrentMatch?: boolean;
    };

    if (!courtId) {
      return NextResponse.json({ error: "Court ID required" }, { status: 400 });
    }
    if (forceReshuffle && undoCurrentMatch) {
      return NextResponse.json(
        { error: "Choose either reshuffle or undo, not both." },
        { status: 400 }
      );
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

    // 2. Handle Undo: Remove existing match and return players to pool.
    if (undoCurrentMatch) {
      if (!targetCourt.currentMatch) {
        return NextResponse.json({ error: "No active match to undo." }, { status: 400 });
      }

      const undoableStatuses: string[] = [MatchStatus.PENDING, MatchStatus.IN_PROGRESS];
      if (!undoableStatuses.includes(targetCourt.currentMatch.status)) {
        return NextResponse.json(
          { error: "Only unscored matches can be undone." },
          { status: 400 }
        );
      }

      await prisma.$transaction([
        prisma.match.delete({ where: { id: targetCourt.currentMatch.id } }),
        prisma.court.update({
          where: { id: courtId },
          data: { currentMatchId: null },
        }),
      ]);

      return NextResponse.json({ ok: true, undoneMatchId: targetCourt.currentMatch.id });
    }

    // 3. Handle Reshuffle: Delete existing match if requested
    if (forceReshuffle && targetCourt.currentMatch) {
      // Only allow reshuffle if match isn't approved/completed
      const allowedStatuses: string[] = [MatchStatus.PENDING, MatchStatus.IN_PROGRESS];
      if (!allowedStatuses.includes(targetCourt.currentMatch.status)) {
        return NextResponse.json({ error: "Cannot reshuffle a match that is already scored or completed." }, { status: 400 });
      }

      await prisma.$transaction([
        prisma.match.delete({ where: { id: targetCourt.currentMatch.id } }),
        prisma.court.update({
          where: { id: courtId },
          data: { currentMatchId: null },
        }),
      ]);

      // Keep busy-player computation in sync with deleted reshuffle match.
      sessionData.matches = sessionData.matches.filter((m) => m.id !== targetCourt.currentMatch!.id);
    }

    // 4. Identify busy players (those on court)
    const busyPlayerIds = getBusyPlayerIds(sessionData.matches);

    // 5. Select Available Players
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

    let selectedIds = selected.map((p) => p.userId);

    const communityEloByUserId =
      sessionData.communityId && sessionData.players.length > 0
        ? await getCommunityEloByUserId(
            sessionData.communityId,
            sessionData.players.map((p) => p.userId)
          )
        : new Map<string, number>();

    const getPlayerElo = (player: (typeof sessionData.players)[number]) =>
      communityEloByUserId.get(player.userId) ?? player.user.elo;

    const playersById = new Map(sessionData.players.map((player) => [player.userId, player]));

    const evaluateBestPartition = (candidateIds: string[]) => {
      const partitions = getDoublesPartitions(candidateIds);
      let bestPartition: { team1: [string, string]; team2: [string, string] } | null = null;
      let bestScore = Infinity;

      for (const partition of partitions) {
        const p1 = playersById.get(partition.team1[0]);
        const p2 = playersById.get(partition.team1[1]);
        const p3 = playersById.get(partition.team2[0]);
        const p4 = playersById.get(partition.team2[1]);
        if (!p1 || !p2 || !p3 || !p4) continue;

        if (sessionData.mode === SessionMode.MIXICANO) {
          const isValid = isValidMixicanoPartition(
            [
              { gender: p1.gender, partnerPreference: p1.partnerPreference },
              { gender: p2.gender, partnerPreference: p2.partnerPreference },
            ],
            [
              { gender: p3.gender, partnerPreference: p3.partnerPreference },
              { gender: p4.gender, partnerPreference: p4.partnerPreference },
            ]
          );
          if (!isValid) continue;
        }

        const team1AvgElo = (getPlayerElo(p1) + getPlayerElo(p2)) / 2;
        const team2AvgElo = (getPlayerElo(p3) + getPlayerElo(p4)) / 2;
        let balanceScore = Math.abs(team1AvgElo - team2AvgElo);

        if (p1.lastPartnerId === p2.userId || p2.lastPartnerId === p1.userId) {
          balanceScore += REPEAT_PARTNER_PENALTY;
        }
        if (p3.lastPartnerId === p4.userId || p4.lastPartnerId === p3.userId) {
          balanceScore += REPEAT_PARTNER_PENALTY;
        }

        if (balanceScore < bestScore) {
          bestScore = balanceScore;
          bestPartition = partition;
        }
      }

      return bestPartition && bestScore < Infinity
        ? { partition: bestPartition, score: bestScore }
        : null;
    };

    let bestEvaluation = evaluateBestPartition(selectedIds);

    // If top-4 fairness pick cannot satisfy MIXICANO constraints,
    // search the top pool for the fairest valid quartet.
    if (!bestEvaluation && sessionData.mode === SessionMode.MIXICANO) {
      const rankedCandidates = [...availableCandidates].sort((a, b) => {
        if (a.matchesPlayed !== b.matchesPlayed) return a.matchesPlayed - b.matchesPlayed;
        const availableGap = a.availableSince.getTime() - b.availableSince.getTime();
        if (availableGap !== 0) return availableGap;
        return a.joinedAt.getTime() - b.joinedAt.getTime();
      });

      const fallbackPool = rankedCandidates.slice(0, Math.min(12, rankedCandidates.length));
      const rankByUserId = new Map(fallbackPool.map((candidate, index) => [candidate.userId, index]));

      let fallback:
        | {
            ids: [string, string, string, string];
            partition: { team1: [string, string]; team2: [string, string] };
            fairnessScore: number;
            score: number;
          }
        | null = null;

      for (let i = 0; i < fallbackPool.length - 3; i++) {
        for (let j = i + 1; j < fallbackPool.length - 2; j++) {
          for (let k = j + 1; k < fallbackPool.length - 1; k++) {
            for (let l = k + 1; l < fallbackPool.length; l++) {
              const ids: [string, string, string, string] = [
                fallbackPool[i].userId,
                fallbackPool[j].userId,
                fallbackPool[k].userId,
                fallbackPool[l].userId,
              ];
              const evaluation = evaluateBestPartition(ids);
              if (!evaluation) continue;

              const fairnessScore = ids.reduce(
                (sum, id) => sum + (rankByUserId.get(id) ?? fallbackPool.length),
                0
              );

              if (
                !fallback ||
                fairnessScore < fallback.fairnessScore ||
                (fairnessScore === fallback.fairnessScore && evaluation.score < fallback.score)
              ) {
                fallback = {
                  ids,
                  partition: evaluation.partition,
                  fairnessScore,
                  score: evaluation.score,
                };
              }
            }
          }
        }
      }

      if (fallback) {
        selectedIds = [...fallback.ids];
        bestEvaluation = { partition: fallback.partition, score: fallback.score };
      }
    }

    if (!bestEvaluation) {
      return NextResponse.json(
        { error: "No valid pairing found for current MIXICANO preferences. Try changing player preferences." },
        { status: 400 }
      );
    }

    const bestPartition = bestEvaluation.partition;

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
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "";
    if (message === "PLAYERS_BUSY") {
      return NextResponse.json({ error: "One or more selected players just started another match. Please retry." }, { status: 409 });
    }
    if (message === "COURT_BUSY") {
      return NextResponse.json({ error: "This court already has a match in progress." }, { status: 409 });
    }
    console.error("Generate match error:", error);
    return NextResponse.json({ error: "Failed to generate match" }, { status: 500 });
  }
}
