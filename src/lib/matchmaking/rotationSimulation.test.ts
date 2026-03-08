import { describe, expect, it } from "vitest";

import { SessionMode, SessionType } from "../../types/enums";
import { rankPlayersByFairness } from "./fairness";
import {
  buildRotationHistory,
  findBestFallbackQuartet,
  findBestQuartetInFairnessWindow,
  getPartitionRepeatStats,
  scorePartitionDetailed,
  type MatchHistoryEntry,
  type PartitionCandidate,
} from "./partitioning";
import { selectMatchPlayers } from "./selectPlayers";

type SimPlayer = PartitionCandidate & {
  matchesPlayed: number;
  availableSince: Date;
  joinedAt: Date;
  inactiveSeconds: number;
  isPaused: boolean;
  pausedAtMs: number | null;
};

type PauseWindow = {
  userId: string;
  startRound: number;
  endRound: number;
};

function percentile(values: number[], ratio: number) {
  if (values.length === 0) return 0;

  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(sorted.length * ratio) - 1)
  );

  return sorted[index];
}

const BALANCED_SEARCH_WINDOW = 8;
const MIXICANO_SEARCH_WINDOW = 12;
const FAIRNESS_WINDOW_SLACK = 2;
const MATCH_DURATION_MS = 10 * 60 * 1000;

function buildDescendingElos(count: number, start = 1700, step = 50) {
  return Array.from({ length: count }, (_, index) => start - index * step);
}

function chooseMatch(
  players: SimPlayer[],
  completedMatches: MatchHistoryEntry[],
  now: number,
  sessionMode: SessionMode,
  sessionType: SessionType
) {
  const rankedCandidates = rankPlayersByFairness(
    players.map((player) => ({
      userId: player.userId,
      matchesPlayed: player.matchesPlayed,
      availableSince: player.availableSince,
      joinedAt: player.joinedAt,
      inactiveSeconds: player.inactiveSeconds,
    })),
    {
      now,
      randomFn: () => 0,
    }
  );

  const selected = selectMatchPlayers(
    players.map((player) => ({
      userId: player.userId,
      matchesPlayed: player.matchesPlayed,
      availableSince: player.availableSince,
      joinedAt: player.joinedAt,
      inactiveSeconds: player.inactiveSeconds,
    })),
    { rankedCandidates }
  );

  if (!selected) return null;

  const initialIds = selected.map((player) => player.userId) as [
    string,
    string,
    string,
    string,
  ];
  const playersById = new Map<string, PartitionCandidate>(
    players.map((player) => [
      player.userId,
      {
        userId: player.userId,
        elo: player.elo,
        pointDiff: player.pointDiff,
        lastPartnerId: player.lastPartnerId,
        gender: player.gender,
        partnerPreference: player.partnerPreference,
      },
    ])
  );
  const rotationHistory = buildRotationHistory(completedMatches);
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
      ? initialIds.filter((id) => lowestCohortUserIds.has(id)).length
      : undefined;

  let selection = findBestQuartetInFairnessWindow(
    rankedCandidates,
    playersById,
    sessionMode,
    sessionType,
    rotationHistory,
    {
      baselineIds: initialIds,
      fairnessSlack: FAIRNESS_WINDOW_SLACK,
      lowestCohortUserIds,
      maxLowestCohortPlayers,
      maxCandidates:
        sessionMode === SessionMode.MIXICANO
          ? MIXICANO_SEARCH_WINDOW
          : BALANCED_SEARCH_WINDOW,
    }
  );

  if (!selection && sessionMode === SessionMode.MIXICANO) {
    selection = findBestFallbackQuartet(
      rankedCandidates,
      playersById,
      sessionMode,
      sessionType,
      rotationHistory,
      MIXICANO_SEARCH_WINDOW
    );
  }

  if (!selection) {
    throw new Error("No valid match selection found in simulation");
  }

  const scoreDetails = scorePartitionDetailed(
    selection.partition,
    playersById,
    sessionMode,
    sessionType,
    rotationHistory
  );
  if (!scoreDetails) {
    throw new Error("No partition score details found in simulation");
  }

  return {
    ...selection,
    scoreDetails,
    repeatStats: getPartitionRepeatStats(selection.partition, rotationHistory),
  };
}

function runSimulation({
  playerElos,
  rounds,
  courts,
  sessionMode = SessionMode.MEXICANO,
  pauseWindows = [],
  snapshotRounds = [],
  sessionType = SessionType.ELO,
}: {
  playerElos: number[];
  rounds: number;
  courts: number;
  sessionMode?: SessionMode;
  pauseWindows?: PauseWindow[];
  snapshotRounds?: number[];
  sessionType?: SessionType;
}) {
  const sessionStart = new Date("2026-03-07T00:00:00Z");
  let now = sessionStart.getTime();
  const snapshotRoundSet = new Set(snapshotRounds);
  const players: SimPlayer[] = playerElos.map((elo, index) => ({
    userId: `P${index + 1}`,
    elo,
    pointDiff: 0,
    lastPartnerId: null,
    gender: "MALE",
    partnerPreference: "OPEN",
    matchesPlayed: 0,
    availableSince: sessionStart,
    joinedAt: sessionStart,
    inactiveSeconds: 0,
    isPaused: false,
    pausedAtMs: null,
  }));
  const completedMatches: MatchHistoryEntry[] = [];
  const snapshots: Record<number, Record<string, number>> = {};
  const teamBalanceGaps: number[] = [];
  let repeatedPartnerTeams = 0;
  let repeatedOpponentPairs = 0;
  let repeatedPods = 0;
  let totalMatches = 0;
  let totalTeams = 0;
  let totalOpponentPairs = 0;

  for (let round = 0; round < rounds; round++) {
    for (const player of players) {
      const shouldBePaused = pauseWindows.some(
        (window) =>
          window.userId === player.userId &&
          round >= window.startRound &&
          round < window.endRound
      );

      if (shouldBePaused && !player.isPaused) {
        player.isPaused = true;
        player.pausedAtMs = now;
        continue;
      }

      if (!shouldBePaused && player.isPaused) {
        player.isPaused = false;
        player.inactiveSeconds += Math.floor((now - (player.pausedAtMs ?? now)) / 1000);
        player.pausedAtMs = null;
        player.availableSince = new Date(now);
      }
    }

    if (snapshotRoundSet.has(round)) {
      snapshots[round] = Object.fromEntries(
        players.map((player) => [player.userId, player.matchesPlayed])
      );
    }

    const busyIds = new Set<string>();
    const matchesThisRound: MatchHistoryEntry[] = [];

    for (let court = 0; court < courts; court++) {
      const availablePlayers = players.filter(
        (player) => !player.isPaused && !busyIds.has(player.userId)
      );
      const selection = chooseMatch(
        availablePlayers,
        completedMatches,
        now,
        sessionMode,
        sessionType
      );

      if (!selection) break;

      selection.ids.forEach((id) => busyIds.add(id));
      teamBalanceGaps.push(selection.scoreDetails.teamBalanceGap);
      repeatedPartnerTeams += selection.repeatStats.repeatedPartnerTeams;
      repeatedOpponentPairs += selection.repeatStats.repeatedOpponentPairs;
      repeatedPods += Number(selection.repeatStats.repeatedPod);
      totalMatches += 1;
      totalTeams += 2;
      totalOpponentPairs += 4;

      matchesThisRound.push({
        team1User1Id: selection.partition.team1[0],
        team1User2Id: selection.partition.team1[1],
        team2User1Id: selection.partition.team2[0],
        team2User2Id: selection.partition.team2[1],
      });
    }

    now += MATCH_DURATION_MS;
    const roundEnd = new Date(now);

    for (const match of matchesThisRound) {
      const updates: Array<[string, string]> = [
        [match.team1User1Id, match.team1User2Id],
        [match.team1User2Id, match.team1User1Id],
        [match.team2User1Id, match.team2User2Id],
        [match.team2User2Id, match.team2User1Id],
      ];

      for (const [userId, partnerId] of updates) {
        const player = players.find((entry) => entry.userId === userId);
        if (!player) continue;

        player.matchesPlayed += 1;
        player.availableSince = roundEnd;
        player.lastPartnerId = partnerId;
      }
    }

    completedMatches.push(...matchesThisRound);
  }

  const counts = players.map((player) => player.matchesPlayed);
  const sortedCounts = [...counts].sort((a, b) => a - b);

  return {
    countsByUserId: Object.fromEntries(
      players.map((player) => [player.userId, player.matchesPlayed])
    ),
    min: sortedCounts[0],
    max: sortedCounts[sortedCounts.length - 1],
    spread: sortedCounts[sortedCounts.length - 1] - sortedCounts[0],
    avgTeamEloGap:
      teamBalanceGaps.reduce((sum, gap) => sum + gap, 0) / Math.max(teamBalanceGaps.length, 1),
    p90TeamEloGap: percentile(teamBalanceGaps, 0.9),
    repeatPartnerRate: repeatedPartnerTeams / Math.max(totalTeams, 1),
    repeatOpponentRate: repeatedOpponentPairs / Math.max(totalOpponentPairs, 1),
    repeatPodRate: repeatedPods / Math.max(totalMatches, 1),
    snapshots,
  };
}

describe("rotation simulation", () => {
  it("keeps rotation spread within 2 for 10 players across 2 courts under balance pressure", () => {
    const result = runSimulation({
      playerElos: [1700, 1600, 1500, 1400, 1300, 1200, 1100, 1000, 900, 800],
      rounds: 80,
      courts: 2,
    });

    expect(result.spread).toBeLessThanOrEqual(2);
  });

  it("does not starve players in a larger 12-player pool", () => {
    const result = runSimulation({
      playerElos: [1700, 1625, 1550, 1475, 1400, 1325, 1250, 1175, 1100, 1025, 950, 875],
      rounds: 90,
      courts: 2,
    });

    expect(result.spread).toBeLessThanOrEqual(2);
  });

  it("re-enters unpaused players without giving them catch-up priority", () => {
    const result = runSimulation({
      playerElos: [1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000],
      rounds: 40,
      courts: 2,
      pauseWindows: [
        { userId: "P1", startRound: 10, endRound: 20 },
        { userId: "P2", startRound: 10, endRound: 20 },
      ],
      snapshotRounds: [20],
    });

    const resumedPlayers = ["P1", "P2"];
    const alwaysActivePlayers = ["P3", "P4", "P5", "P6", "P7", "P8", "P9", "P10"];
    const countsAtResume = result.snapshots[20];

    const resumedPostUnpauseGains = resumedPlayers.map(
      (userId) => result.countsByUserId[userId] - countsAtResume[userId]
    );
    const activePostUnpauseGains = alwaysActivePlayers.map(
      (userId) => result.countsByUserId[userId] - countsAtResume[userId]
    );

    expect(Math.max(...resumedPostUnpauseGains)).toBeLessThanOrEqual(
      Math.max(...activePostUnpauseGains)
    );
    expect(
      resumedPlayers.every(
        (userId) =>
          result.countsByUserId[userId] <
          alwaysActivePlayers.reduce(
            (sum, activeUserId) => sum + result.countsByUserId[activeUserId],
            0
          ) / alwaysActivePlayers.length
      )
    ).toBe(true);
  });

  it("keeps Elo gaps tight for 13 players across 2 courts", () => {
    const result = runSimulation({
      playerElos: buildDescendingElos(13),
      rounds: 90,
      courts: 2,
    });

    expect(result.spread).toBeLessThanOrEqual(2);
    expect(result.avgTeamEloGap).toBeLessThanOrEqual(25);
    expect(result.p90TeamEloGap).toBeLessThanOrEqual(75);
  });

  it("keeps Elo gaps tight for 24 players across 3 courts", () => {
    const result = runSimulation({
      playerElos: buildDescendingElos(24),
      rounds: 120,
      courts: 3,
    });

    expect(result.spread).toBeLessThanOrEqual(2);
    expect(result.avgTeamEloGap).toBeLessThanOrEqual(65);
    expect(result.p90TeamEloGap).toBeLessThanOrEqual(250);
  });
});
