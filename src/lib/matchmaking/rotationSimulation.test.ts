import { describe, expect, it } from "vitest";

import { SessionMode, SessionType } from "../../types/enums";
import { rankPlayersByFairness } from "./fairness";
import {
  calculateNoCatchUpMatchmakingCredit,
  getEffectiveActiveTimeBonusMs,
  getEffectiveMatchesPlayed,
} from "./matchmakingCredit";
import {
  buildRotationHistory,
  getPartitionRepeatStats,
  scorePartitionDetailed,
  type MatchHistoryEntry,
  type PartitionCandidate,
} from "./partitioning";
import { findBestAutoMatchSelection } from "./autoMatch";

type SimPlayer = PartitionCandidate & {
  matchesPlayed: number;
  matchmakingMatchesCredit: number;
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

const MATCH_DURATION_MS = 10 * 60 * 1000;
const K_FACTOR = 32;

function buildDescendingElos(count: number, start = 1700, step = 50) {
  return Array.from({ length: count }, (_, index) => start - index * step);
}

function calculateEloChange(
  winnerElo: number,
  loserElo: number,
  winnerScore: number,
  loserScore: number
) {
  const expectedWinner = 1 / (1 + Math.pow(10, (loserElo - winnerElo) / 400));
  const scoreDiff = winnerScore - loserScore;
  const marginMultiplier = 1 + (scoreDiff - 2) * 0.05;

  return Math.round(K_FACTOR * (1 - expectedWinner) * marginMultiplier);
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
      matchesPlayed: getEffectiveMatchesPlayed(player),
      availableSince: player.availableSince,
      joinedAt: player.joinedAt,
      inactiveSeconds: player.inactiveSeconds,
      activeMsBonus: getEffectiveActiveTimeBonusMs(player),
    })),
    {
      now,
      randomFn: () => 0,
    }
  );
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
  const selection = findBestAutoMatchSelection(
    rankedCandidates,
    playersById,
    sessionMode,
    sessionType,
    rotationHistory,
    { now }
  );

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
    matchmakingMatchesCredit: 0,
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
        player.matchmakingMatchesCredit = calculateNoCatchUpMatchmakingCredit({
          player,
          activePlayers: players.filter(
            (candidate) => candidate.userId !== player.userId && !candidate.isPaused
          ),
        });
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

function runOutcomeDrivenSimulation({
  playerElos,
  rounds,
  forcedLoserId,
  sessionType,
}: {
  playerElos: number[];
  rounds: number;
  forcedLoserId: string;
  sessionType: SessionType;
}) {
  const sessionStart = new Date("2026-03-07T00:00:00Z");
  let now = sessionStart.getTime();
  const players: SimPlayer[] = playerElos.map((elo, index) => ({
    userId: `P${index + 1}`,
    elo,
    pointDiff: 0,
    lastPartnerId: null,
    gender: "MALE",
    partnerPreference: "OPEN",
    matchesPlayed: 0,
    matchmakingMatchesCredit: 0,
    availableSince: sessionStart,
    joinedAt: sessionStart,
    inactiveSeconds: 0,
    isPaused: false,
    pausedAtMs: null,
  }));
  const completedMatches: Array<
    MatchHistoryEntry & {
      team1Score: number;
      team2Score: number;
      winnerTeam: 1 | 2;
    }
  > = [];

  for (let round = 0; round < rounds; round++) {
    const selection = chooseMatch(
      players,
      completedMatches,
      now,
      SessionMode.MEXICANO,
      sessionType
    );

    const team1 = selection.partition.team1;
    const team2 = selection.partition.team2;
    const team1HasForcedLoser = team1.includes(forcedLoserId);
    const team2HasForcedLoser = team2.includes(forcedLoserId);

    const winnerTeam =
      team1HasForcedLoser && !team2HasForcedLoser
        ? (2 as const)
        : team2HasForcedLoser && !team1HasForcedLoser
          ? (1 as const)
          : 1;

    const score =
      winnerTeam === 1
        ? { team1Score: 21, team2Score: 0 }
        : { team1Score: 0, team2Score: 21 };

    now += MATCH_DURATION_MS;
    const roundEnd = new Date(now);

    const [team1A, team1B] = team1.map((id) => players.find((player) => player.userId === id)!);
    const [team2A, team2B] = team2.map((id) => players.find((player) => player.userId === id)!);

    for (const player of [team1A, team1B, team2A, team2B]) {
      player.matchesPlayed += 1;
      player.availableSince = roundEnd;
    }

    team1A.lastPartnerId = team1B.userId;
    team1B.lastPartnerId = team1A.userId;
    team2A.lastPartnerId = team2B.userId;
    team2B.lastPartnerId = team2A.userId;

    const team1Diff = score.team1Score - score.team2Score;
    const team2Diff = score.team2Score - score.team1Score;

    team1A.pointDiff += team1Diff;
    team1B.pointDiff += team1Diff;
    team2A.pointDiff += team2Diff;
    team2B.pointDiff += team2Diff;

    if (winnerTeam === 1) {
      team1A.elo +=
        sessionType === SessionType.ELO
          ? calculateEloChange(
              (team1A.elo + team1B.elo) / 2,
              (team2A.elo + team2B.elo) / 2,
              score.team1Score,
              score.team2Score
            )
          : 0;
      team1B.elo = team1A.elo;
      team2A.elo -=
        sessionType === SessionType.ELO
          ? calculateEloChange(
              (team1A.elo + team1B.elo) / 2,
              (team2A.elo + team2B.elo) / 2,
              score.team1Score,
              score.team2Score
            )
          : 0;
      team2B.elo = team2A.elo;
    } else if (sessionType === SessionType.ELO) {
      const delta = calculateEloChange(
        (team2A.elo + team2B.elo) / 2,
        (team1A.elo + team1B.elo) / 2,
        score.team2Score,
        score.team1Score
      );
      team1A.elo -= delta;
      team1B.elo -= delta;
      team2A.elo += delta;
      team2B.elo += delta;
    }

    completedMatches.push({
      team1User1Id: team1[0],
      team1User2Id: team1[1],
      team2User1Id: team2[0],
      team2User2Id: team2[1],
      team1Score: score.team1Score,
      team2Score: score.team2Score,
      winnerTeam,
      completedAt: roundEnd,
    });
  }

  const counts = players.map((player) => player.matchesPlayed);

  return {
    countsByUserId: Object.fromEntries(
      players.map((player) => [player.userId, player.matchesPlayed])
    ),
    spread: Math.max(...counts) - Math.min(...counts),
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

  it("re-enters unpaused players back into the normal rotation", () => {
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

    expect(resumedPostUnpauseGains.every((gain) => gain > 0)).toBe(true);
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

  it("keeps a resumed player from getting catch-up priority after a long pause in a 7-player, 1-court rotation", () => {
    const result = runSimulation({
      playerElos: [1000, 1000, 1000, 1000, 1000, 1000, 1000],
      rounds: 24,
      courts: 1,
      pauseWindows: [{ userId: "P1", startRound: 0, endRound: 8 }],
      snapshotRounds: [8, 12, 16, 20],
    });

    const getGapToAverage = (round: number) => {
      const counts = result.snapshots[round];
      const resumedMatches = counts.P1;
      const activeAverage =
        (counts.P2 + counts.P3 + counts.P4 + counts.P5 + counts.P6 + counts.P7) /
        6;

      return activeAverage - resumedMatches;
    };

    const gapAtResume = getGapToAverage(8);
    const gapAfter4Rounds = getGapToAverage(12);
    const gapAfter8Rounds = getGapToAverage(16);
    const gapAfter12Rounds = getGapToAverage(20);

    expect(gapAtResume).toBeGreaterThanOrEqual(5);
    expect(gapAtResume).toBeLessThanOrEqual(6);
    expect(gapAfter4Rounds).toBeGreaterThanOrEqual(4);
    expect(gapAfter8Rounds).toBeGreaterThanOrEqual(4);
    expect(gapAfter12Rounds).toBeGreaterThanOrEqual(4);
    expect(result.spread).toBeGreaterThanOrEqual(4);
  });

  it("keeps Elo gaps tight for 13 players across 2 courts", () => {
    const result = runSimulation({
      playerElos: buildDescendingElos(13),
      rounds: 90,
      courts: 2,
    });

    expect(result.spread).toBeLessThanOrEqual(2);
    expect(result.avgTeamEloGap).toBeLessThanOrEqual(30);
    expect(result.p90TeamEloGap).toBeLessThanOrEqual(125);
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

  it("keeps the live spread within 2 in a steady 10-player, 2-court rotation", () => {
    const result = runSimulation({
      playerElos: [1700, 1600, 1500, 1400, 1300, 1200, 1100, 1000, 900, 800],
      rounds: 80,
      courts: 2,
    });
    expect(result.spread).toBeLessThanOrEqual(2);
  });

  it("does not starve an always-losing player in a 7-player, 1-court points session", () => {
    const result = runOutcomeDrivenSimulation({
      playerElos: [1000, 1000, 1000, 1000, 1000, 1000, 1000],
      rounds: 70,
      forcedLoserId: "P1",
      sessionType: SessionType.POINTS,
    });

    expect(result.spread).toBeLessThanOrEqual(1);
  });

  it("does not starve an always-losing player in a 7-player, 1-court ratings session", () => {
    const result = runOutcomeDrivenSimulation({
      playerElos: [1000, 1000, 1000, 1000, 1000, 1000, 1000],
      rounds: 70,
      forcedLoserId: "P1",
      sessionType: SessionType.ELO,
    });

    expect(result.spread).toBeLessThanOrEqual(1);
  });
});
