import { describe, expect, it } from "vitest";

import { SessionMode, SessionType } from "../../../types/enums";
import {
  buildRotationHistory,
  type MatchHistoryEntry,
  type PartitionCandidate,
} from "../partitioning";
import { calculateNoCatchUpMatchmakingCredit } from "../matchmakingCredit";
import {
  findBestAutoMatchSelectionV2,
  findBestBatchAutoMatchSelectionV2,
  rankPlayersByRotationLoad,
} from "./index";

type SimPlayer = PartitionCandidate & {
  matchesPlayed: number;
  matchmakingMatchesCredit: number;
  availableSince: Date;
  isPaused: boolean;
  pausedAtMs: number | null;
  inactiveSeconds: number;
  joinedAt: Date;
};

const MATCH_DURATION_MS = 10 * 60 * 1000;

function createPlayers(count: number, baseElo = 1000) {
  const joinedAt = new Date("2026-03-07T00:00:00Z");

  return Array.from({ length: count }, (_, index) => ({
    userId: `P${index + 1}`,
    elo: baseElo + (count - index) * 5,
    pointDiff: 0,
    lastPartnerId: null,
    gender: "MALE",
    partnerPreference: "OPEN",
    matchesPlayed: 0,
    matchmakingMatchesCredit: 0,
    availableSince: joinedAt,
    isPaused: false,
    pausedAtMs: null,
    inactiveSeconds: 0,
    joinedAt,
  }));
}

function buildContext(players: SimPlayer[], matches: MatchHistoryEntry[]) {
  return {
    playersById: new Map<string, PartitionCandidate>(
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
    ),
    rotationHistory: buildRotationHistory(matches),
  };
}

function rankPlayers(players: SimPlayer[], now: number) {
  return rankPlayersByRotationLoad(
    players
      .filter((player) => !player.isPaused)
      .map((player) => ({
        userId: player.userId,
        matchesPlayed: player.matchesPlayed,
        matchmakingMatchesCredit: player.matchmakingMatchesCredit,
        availableSince: player.availableSince,
      })),
    { now, randomFn: () => 0 }
  );
}

function chooseMatches(players: SimPlayer[], matches: MatchHistoryEntry[], courts: number, now: number) {
  const ranked = rankPlayers(players, now);
  const context = buildContext(players, matches);

  if (courts === 1) {
    const selection = findBestAutoMatchSelectionV2(
      ranked,
      context,
      SessionMode.MEXICANO,
      SessionType.ELO
    );

    return selection ? [selection] : [];
  }

  const batch = findBestBatchAutoMatchSelectionV2(
    ranked,
    context,
    SessionMode.MEXICANO,
    SessionType.ELO,
    courts
  );

  return batch?.selections ?? [];
}

function applySelections(players: SimPlayer[], selections: Array<{ partition: { team1: [string, string]; team2: [string, string] } }>, now: number) {
  const roundEnd = new Date(now + MATCH_DURATION_MS);

  for (const selection of selections) {
    const updates: Array<[string, string]> = [
      [selection.partition.team1[0], selection.partition.team1[1]],
      [selection.partition.team1[1], selection.partition.team1[0]],
      [selection.partition.team2[0], selection.partition.team2[1]],
      [selection.partition.team2[1], selection.partition.team2[0]],
    ];

    for (const [userId, partnerId] of updates) {
      const player = players.find((entry) => entry.userId === userId);

      if (!player) {
        continue;
      }

      player.matchesPlayed += 1;
      player.availableSince = roundEnd;
      player.lastPartnerId = partnerId;
    }
  }

  return roundEnd;
}

function pauseWindowTick(
  players: SimPlayer[],
  now: number,
  pauseWindows: Array<{ userId: string; startRound: number; endRound: number }>,
  round: number
) {
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
}

describe("matchmaking v2 engine", () => {
  it("keeps fairness ahead of better balance from higher-load players", () => {
    const now = new Date("2026-03-10T10:30:00Z").getTime();
    const players = [
      { userId: "A", matchesPlayed: 0, matchmakingMatchesCredit: 0, availableSince: new Date("2026-03-10T10:00:00Z") },
      { userId: "B", matchesPlayed: 0, matchmakingMatchesCredit: 0, availableSince: new Date("2026-03-10T10:01:00Z") },
      { userId: "C", matchesPlayed: 0, matchmakingMatchesCredit: 0, availableSince: new Date("2026-03-10T10:02:00Z") },
      { userId: "D", matchesPlayed: 0, matchmakingMatchesCredit: 0, availableSince: new Date("2026-03-10T10:03:00Z") },
      { userId: "E", matchesPlayed: 1, matchmakingMatchesCredit: 0, availableSince: new Date("2026-03-10T10:00:00Z") },
      { userId: "F", matchesPlayed: 1, matchmakingMatchesCredit: 0, availableSince: new Date("2026-03-10T10:00:00Z") },
      { userId: "G", matchesPlayed: 1, matchmakingMatchesCredit: 0, availableSince: new Date("2026-03-10T10:00:00Z") },
      { userId: "H", matchesPlayed: 1, matchmakingMatchesCredit: 0, availableSince: new Date("2026-03-10T10:00:00Z") },
    ];
    const ranked = rankPlayersByRotationLoad(players, { now, randomFn: () => 0 });
    const context = {
      playersById: new Map<string, PartitionCandidate>([
        ["A", { userId: "A", elo: 1600, pointDiff: 0, lastPartnerId: null, gender: "MALE", partnerPreference: "OPEN" }],
        ["B", { userId: "B", elo: 1200, pointDiff: 0, lastPartnerId: null, gender: "MALE", partnerPreference: "OPEN" }],
        ["C", { userId: "C", elo: 1590, pointDiff: 0, lastPartnerId: null, gender: "MALE", partnerPreference: "OPEN" }],
        ["D", { userId: "D", elo: 1210, pointDiff: 0, lastPartnerId: null, gender: "MALE", partnerPreference: "OPEN" }],
        ["E", { userId: "E", elo: 1400, pointDiff: 0, lastPartnerId: null, gender: "MALE", partnerPreference: "OPEN" }],
        ["F", { userId: "F", elo: 1390, pointDiff: 0, lastPartnerId: null, gender: "MALE", partnerPreference: "OPEN" }],
        ["G", { userId: "G", elo: 1410, pointDiff: 0, lastPartnerId: null, gender: "MALE", partnerPreference: "OPEN" }],
        ["H", { userId: "H", elo: 1405, pointDiff: 0, lastPartnerId: null, gender: "MALE", partnerPreference: "OPEN" }],
      ]),
      rotationHistory: buildRotationHistory([]),
    };

    const selection = findBestAutoMatchSelectionV2(
      ranked,
      context,
      SessionMode.MEXICANO,
      SessionType.ELO
    );

    expect(selection?.ids).toEqual(["A", "B", "C", "D"]);
  });

  it("keeps a resumed player behind instead of catching up immediately", () => {
    const players = createPlayers(7);
    const matches: MatchHistoryEntry[] = [];
    let now = new Date("2026-03-07T00:00:00Z").getTime();
    const snapshots: Record<number, Record<string, number>> = {};

    for (let round = 0; round < 24; round++) {
      pauseWindowTick(
        players,
        now,
        [{ userId: "P1", startRound: 0, endRound: 8 }],
        round
      );

      if ([8, 12, 16, 20].includes(round)) {
        snapshots[round] = Object.fromEntries(
          players.map((player) => [player.userId, player.matchesPlayed])
        );
      }

      const selections = chooseMatches(players, matches, 1, now);
      const roundEnd = applySelections(players, selections, now);

      matches.push(
        ...selections.map((selection) => ({
          team1User1Id: selection.partition.team1[0],
          team1User2Id: selection.partition.team1[1],
          team2User1Id: selection.partition.team2[0],
          team2User2Id: selection.partition.team2[1],
          completedAt: roundEnd,
        }))
      );

      now += MATCH_DURATION_MS;
    }

    const getGapToAverage = (round: number) => {
      const counts = snapshots[round];
      const resumedMatches = counts.P1;
      const activeAverage =
        (counts.P2 + counts.P3 + counts.P4 + counts.P5 + counts.P6 + counts.P7) / 6;

      return activeAverage - resumedMatches;
    };

    expect(getGapToAverage(8)).toBeGreaterThanOrEqual(5);
    expect(getGapToAverage(12)).toBeGreaterThanOrEqual(4);
    expect(getGapToAverage(16)).toBeGreaterThanOrEqual(4);
    expect(getGapToAverage(20)).toBeGreaterThanOrEqual(4);
  });

  it("does not lock four resumed players into a single-court bubble", () => {
    const players = createPlayers(16);
    const matches: MatchHistoryEntry[] = [];
    let now = new Date("2026-03-07T00:00:00Z").getTime();

    for (let round = 0; round < 6; round++) {
      pauseWindowTick(
        players,
        now,
        [
          { userId: "P1", startRound: 0, endRound: 5 },
          { userId: "P2", startRound: 0, endRound: 5 },
          { userId: "P3", startRound: 0, endRound: 5 },
          { userId: "P4", startRound: 0, endRound: 5 },
        ],
        round
      );

      const selections = chooseMatches(players, matches, 3, now);
      const roundEnd = applySelections(players, selections, now);

      matches.push(
        ...selections.map((selection) => ({
          team1User1Id: selection.partition.team1[0],
          team1User2Id: selection.partition.team1[1],
          team2User1Id: selection.partition.team2[0],
          team2User2Id: selection.partition.team2[1],
          completedAt: roundEnd,
        }))
      );

      now += MATCH_DURATION_MS;
    }

    pauseWindowTick(
      players,
      now,
      [
        { userId: "P1", startRound: 0, endRound: 5 },
        { userId: "P2", startRound: 0, endRound: 5 },
        { userId: "P3", startRound: 0, endRound: 5 },
        { userId: "P4", startRound: 0, endRound: 5 },
      ],
      5
    );

    const firstBatchAfterResume = chooseMatches(players, matches, 3, now);
    const resumedCounts = firstBatchAfterResume.map((selection) =>
      selection.ids.filter((id) => ["P1", "P2", "P3", "P4"].includes(id)).length
    );

    expect(Math.max(...resumedCounts)).toBeLessThanOrEqual(2);
  });
});
