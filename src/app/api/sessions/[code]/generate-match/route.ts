import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCommunityEloByUserId } from "@/lib/communityElo";
import { rankPlayersByFairness } from "@/lib/matchmaking/fairness";
import {
  getManualMatchPlayerIds,
  hasDuplicateManualMatchPlayers,
  isValidManualMatchPartition,
  type ManualMatchTeams,
} from "@/lib/matchmaking/manualMatch";
import {
  buildRotationHistory,
  evaluateBestPartition,
  findAlternativeQuartetForReshuffle,
  findBestQuartetInFairnessWindow,
  findBestFallbackQuartet,
  getPartitionKey,
  getQuartetKey,
  PartitionCandidate,
} from "@/lib/matchmaking/partitioning";
import { selectMatchPlayers } from "@/lib/matchmaking/selectPlayers";
import { getBusyPlayerIds } from "@/lib/matchmaking/busyFilter";
import {
  MatchStatus,
  SessionMode,
  SessionStatus,
} from "@/types/enums";

export const dynamic = "force-dynamic";
const BALANCED_SEARCH_WINDOW = 8;
const MIXICANO_SEARCH_WINDOW = 12;
const FAIRNESS_WINDOW_SLACK = 2;

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
      manualTeams,
    } = body as {
      courtId?: string;
      forceReshuffle?: boolean;
      undoCurrentMatch?: boolean;
      manualTeams?: unknown;
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
    if (manualTeams && (forceReshuffle || undoCurrentMatch)) {
      return NextResponse.json(
        { error: "Manual match creation cannot be combined with reshuffle or undo." },
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

    const reshuffleSource =
      forceReshuffle && targetCourt.currentMatch
        ? {
            ids: [
              targetCourt.currentMatch.team1User1Id,
              targetCourt.currentMatch.team1User2Id,
              targetCourt.currentMatch.team2User1Id,
              targetCourt.currentMatch.team2User2Id,
            ] as [string, string, string, string],
            partition: {
              team1: [
                targetCourt.currentMatch.team1User1Id,
                targetCourt.currentMatch.team1User2Id,
              ] as [string, string],
              team2: [
                targetCourt.currentMatch.team2User1Id,
                targetCourt.currentMatch.team2User2Id,
              ] as [string, string],
            },
          }
        : null;

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

    const communityEloByUserId =
      sessionData.communityId && sessionData.players.length > 0
        ? await getCommunityEloByUserId(
            sessionData.communityId,
            sessionData.players.map((p) => p.userId)
          )
        : new Map<string, number>();

    const getPlayerElo = (player: (typeof sessionData.players)[number]) =>
      communityEloByUserId.get(player.userId) ?? player.user.elo;

    const playersById = new Map<string, PartitionCandidate>(
      sessionData.players.map((player) => [
        player.userId,
        {
          userId: player.userId,
          elo: getPlayerElo(player),
          lastPartnerId: player.lastPartnerId,
          gender: player.gender,
          partnerPreference: player.partnerPreference,
        },
      ])
    );
    const rotationHistory = buildRotationHistory(
      sessionData.matches
        .filter((match) => match.status === MatchStatus.COMPLETED)
        .sort((matchA, matchB) => {
          const timeA =
            matchA.completedAt?.getTime() ?? matchA.createdAt.getTime();
          const timeB =
            matchB.completedAt?.getTime() ?? matchB.createdAt.getTime();

          return timeA - timeB;
        })
    );

    const createMatch = async (
      selectedIds: string[],
      partition: ManualMatchTeams
    ) =>
      prisma.$transaction(async (tx) => {
        const concurrentBusyMatches = await tx.match.findMany({
          where: {
            sessionId: sessionData.id,
            status: {
              in: [
                MatchStatus.PENDING,
                MatchStatus.IN_PROGRESS,
                MatchStatus.PENDING_APPROVAL,
              ],
            },
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

        const match = await tx.match.create({
          data: {
            sessionId: sessionData.id,
            courtId,
            status: MatchStatus.IN_PROGRESS,
            team1User1Id: partition.team1[0],
            team1User2Id: partition.team1[1],
            team2User1Id: partition.team2[0],
            team2User2Id: partition.team2[1],
          },
          include: {
            team1User1: { select: { id: true, name: true } },
            team1User2: { select: { id: true, name: true } },
            team2User1: { select: { id: true, name: true } },
            team2User2: { select: { id: true, name: true } },
          },
        });

        const updatedCourt = await tx.court.updateMany({
          where: { id: courtId, currentMatchId: null },
          data: { currentMatchId: match.id },
        });

        if (updatedCourt.count === 0) {
          throw new Error("COURT_BUSY");
        }

        return match;
      });

    if (manualTeams) {
      if (targetCourt.currentMatch) {
        return NextResponse.json(
          { error: "This court already has a match. Undo it first to create a manual match." },
          { status: 409 }
        );
      }

      const parsedTeams = (() => {
        if (typeof manualTeams !== "object" || manualTeams === null) return null;
        const candidate = manualTeams as {
          team1?: unknown;
          team2?: unknown;
        };
        if (
          !Array.isArray(candidate.team1) ||
          !Array.isArray(candidate.team2) ||
          candidate.team1.length !== 2 ||
          candidate.team2.length !== 2 ||
          candidate.team1.some((id) => typeof id !== "string") ||
          candidate.team2.some((id) => typeof id !== "string")
        ) {
          return null;
        }

        return {
          team1: [candidate.team1[0], candidate.team1[1]],
          team2: [candidate.team2[0], candidate.team2[1]],
        } as ManualMatchTeams;
      })();

      if (!parsedTeams) {
        return NextResponse.json({ error: "Invalid manual team selection." }, { status: 400 });
      }

      if (hasDuplicateManualMatchPlayers(parsedTeams)) {
        return NextResponse.json(
          { error: "Manual matches require 4 different players." },
          { status: 400 }
        );
      }

      const selectedIds = getManualMatchPlayerIds(parsedTeams);
      const selectedPlayers = selectedIds.map((id) => sessionData.players.find((player) => player.userId === id));

      if (selectedPlayers.some((player) => !player)) {
        return NextResponse.json(
          { error: "Every manual match player must already be in this session." },
          { status: 400 }
        );
      }

      if (selectedPlayers.some((player) => player?.isPaused)) {
        return NextResponse.json(
          { error: "Paused players cannot be added to a manual match." },
          { status: 400 }
        );
      }

      const busyManualIds = selectedIds.filter((id) => busyPlayerIds.has(id));
      if (busyManualIds.length > 0) {
        return NextResponse.json(
          { error: "One or more selected players are already busy on another court." },
          { status: 409 }
        );
      }

      if (
        !isValidManualMatchPartition(
          parsedTeams,
          playersById,
          sessionData.mode as SessionMode,
          rotationHistory
        )
      ) {
        return NextResponse.json(
          {
            error:
              sessionData.mode === SessionMode.MIXICANO
                ? "That manual pairing is invalid for current MIXICANO preferences."
                : "Invalid manual pairing.",
          },
          { status: 400 }
        );
      }

      const createdMatch = await createMatch(selectedIds, parsedTeams);
      return NextResponse.json(createdMatch);
    }

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

    const rankedCandidates = rankPlayersByFairness(availableCandidates);
    const selected = selectMatchPlayers(availableCandidates, { rankedCandidates });

    if (!selected) {
      return NextResponse.json({ error: `Not enough players available (need 4, have ${availableCandidates.length})` }, { status: 400 });
    }

    let selectedIds = selected.map((p) => p.userId);
    const actualCounts = rankedCandidates.map((candidate) => candidate.matchesPlayed);
    const minActual = Math.min(...actualCounts);
    const maxActual = Math.max(...actualCounts);
    const lowestCohortUserIds =
      maxActual > minActual
        ? new Set(
            rankedCandidates
              .filter((candidate) => candidate.matchesPlayed === minActual)
              .map((candidate) => candidate.userId)
          )
        : undefined;
    const maxLowestCohortPlayers =
      lowestCohortUserIds && lowestCohortUserIds.size > 0
        ? selectedIds.filter((id) => lowestCohortUserIds.has(id)).length
        : undefined;

    let bestSelection = findBestQuartetInFairnessWindow(
      rankedCandidates,
      playersById,
      sessionData.mode as SessionMode,
      rotationHistory,
      {
        baselineIds: selectedIds as [string, string, string, string],
        fairnessSlack: FAIRNESS_WINDOW_SLACK,
        lowestCohortUserIds,
        maxLowestCohortPlayers,
        maxCandidates:
          sessionData.mode === SessionMode.MIXICANO
            ? MIXICANO_SEARCH_WINDOW
            : BALANCED_SEARCH_WINDOW,
      }
    );

    // If the fairness window cannot satisfy MIXICANO constraints,
    // broaden the search to the fairest valid quartet in the larger pool.
    if (!bestSelection && sessionData.mode === SessionMode.MIXICANO) {
      const fallback = findBestFallbackQuartet(
        rankedCandidates,
        playersById,
        sessionData.mode as SessionMode,
        rotationHistory,
        MIXICANO_SEARCH_WINDOW
      );

      if (fallback) {
        bestSelection = fallback;
      }
    }

    if (!bestSelection) {
      return NextResponse.json(
        { error: "No valid pairing found for current MIXICANO preferences. Try changing player preferences." },
        { status: 400 }
      );
    }

    if (reshuffleSource) {
      const previousQuartetKey = getQuartetKey(reshuffleSource.ids);
      const previousPartitionKey = getPartitionKey(reshuffleSource.partition);
      const selectedQuartetKey = getQuartetKey(bestSelection.ids);
      const selectedPartitionKey = getPartitionKey(bestSelection.partition);

      if (selectedQuartetKey === previousQuartetKey) {
        const alternativeQuartet = findAlternativeQuartetForReshuffle(
          rankedCandidates,
          playersById,
          sessionData.mode as SessionMode,
          rotationHistory,
          {
            baselineIds: selectedIds as [string, string, string, string],
            fairnessSlack: FAIRNESS_WINDOW_SLACK,
            lowestCohortUserIds,
            maxLowestCohortPlayers,
            maxCandidates:
              sessionData.mode === SessionMode.MIXICANO
                ? MIXICANO_SEARCH_WINDOW
                : BALANCED_SEARCH_WINDOW,
            excludedQuartetKey: previousQuartetKey,
          }
        );

        if (alternativeQuartet) {
          bestSelection = alternativeQuartet;
        } else if (selectedPartitionKey === previousPartitionKey) {
          const alternativePartition = evaluateBestPartition(
            bestSelection.ids,
            playersById,
            sessionData.mode as SessionMode,
            rotationHistory,
            {
              excludedPartitionKey: previousPartitionKey,
            }
          );

          if (alternativePartition) {
            bestSelection = {
              ...bestSelection,
              partition: alternativePartition.partition,
              score: alternativePartition.score,
            };
          } else {
            return NextResponse.json(
              {
                error:
                  "No alternative reshuffle was available. Undo this match if you want the same players returned to the pool.",
              },
              { status: 409 }
            );
          }
        }
      }
    }

    selectedIds = [...bestSelection.ids];
    const bestPartition = bestSelection.partition;

    // 8. Create Match
    const newMatch = await createMatch(selectedIds, bestPartition);

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
