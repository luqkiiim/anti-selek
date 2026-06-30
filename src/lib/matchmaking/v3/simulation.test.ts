import { describe, expect, it } from "vitest";

import { SessionMode, SessionType } from "../../../types/enums";
import { buildConsecutivePlayHistory } from "./consecutive";
import {
  addLateJoiner,
  createSimulationPlayers,
  createSimulationState,
  getCourtGroupCounts,
  getMatchCounts,
  pausePlayers,
  playRound,
  resumePlayers,
} from "./simulation";
import type { V3SimulationPlayer } from "./simulation";

const LONG_SIMULATION_TIMEOUT_MS = 20_000;

function createLateJoiner(userId: string): V3SimulationPlayer {
  return {
    userId,
    matchesPlayed: 0,
    matchmakingBaseline: 0,
    availableSince: new Date("2026-03-18T00:00:00Z"),
    strength: 1030,
    isBusy: false,
    isPaused: false,
    gender: "MALE",
    partnerPreference: "OPEN",
    lastPartnerId: null,
    joinedAt: new Date("2026-03-18T00:00:00Z"),
  };
}

function getPairKey(playerA: string, playerB: string) {
  return [playerA, playerB].sort().join("|");
}

function getSharedCourtPairCounts(
  matches: Array<{ team1: [string, string]; team2: [string, string] }>
) {
  const counts = new Map<string, number>();

  for (const match of matches) {
    const players = [...match.team1, ...match.team2];

    for (let left = 0; left < players.length - 1; left += 1) {
      for (let right = left + 1; right < players.length; right += 1) {
        const key = getPairKey(players[left], players[right]);
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
  }

  return counts;
}

function getUnseenSharedCourtPairs(
  players: Array<{ userId: string }>,
  matches: Array<{ team1: [string, string]; team2: [string, string] }>
) {
  const coveredPairs = getSharedCourtPairCounts(matches);
  let unseenPairs = 0;

  for (let left = 0; left < players.length - 1; left += 1) {
    for (let right = left + 1; right < players.length; right += 1) {
      if (!coveredPairs.has(getPairKey(players[left].userId, players[right].userId))) {
        unseenPairs += 1;
      }
    }
  }

  return unseenPairs;
}

function getMaximumConsecutiveMatches(
  matches: Array<{ team1: [string, string]; team2: [string, string] }>
) {
  const currentStreakByUserId = new Map<string, number>();
  let maximumStreak = 0;

  for (const match of matches) {
    const playerIds = new Set([...match.team1, ...match.team2]);

    for (const userId of currentStreakByUserId.keys()) {
      if (!playerIds.has(userId)) {
        currentStreakByUserId.set(userId, 0);
      }
    }

    for (const userId of playerIds) {
      const nextStreak = (currentStreakByUserId.get(userId) ?? 0) + 1;
      currentStreakByUserId.set(userId, nextStreak);
      maximumStreak = Math.max(maximumStreak, nextStreak);
    }
  }

  return maximumStreak;
}

describe("matchmaking v3 simulation", () => {
  it("keeps one-court seven-player rotation within a one-match spread", () => {
    const state = createSimulationState(createSimulationPlayers(7), {
      matchDurationMs: 10 * 60 * 1000,
    });

    for (let round = 0; round < 14; round++) {
      playRound(state, {
        courtCount: 1,
        sessionMode: SessionMode.MEXICANO,
        sessionType: SessionType.ELO,
        randomFn: () => 0,
      });
    }

    const matchCounts = Object.values(getMatchCounts(state.players));

    expect(Math.max(...matchCounts) - Math.min(...matchCounts)).toBeLessThanOrEqual(1);
  });

  it("avoids three straight matches in one-court seven-player balanced points", () => {
    const state = createSimulationState(
      createSimulationPlayers(7, { strengthStep: 0 }),
      {
        matchDurationMs: 10 * 60 * 1000,
      }
    );

    for (let round = 0; round < 14; round++) {
      playRound(state, {
        courtCount: 1,
        sessionMode: SessionMode.MEXICANO,
        sessionType: SessionType.POINTS,
        randomFn: () => 0,
      });
    }

    expect(getMaximumConsecutiveMatches(state.completedMatches)).toBeLessThanOrEqual(
      2
    );
  });

  it("spreads one-court seven-player social mix back-to-back burden before repeating a stayer", () => {
    const state = createSimulationState(
      createSimulationPlayers(7, { strengthStep: 0 }),
      {
        matchDurationMs: 10 * 60 * 1000,
      }
    );

    for (let round = 0; round < 8; round++) {
      playRound(state, {
        courtCount: 1,
        sessionMode: SessionMode.MEXICANO,
        sessionType: SessionType.SOCIAL_MIX,
        randomFn: () => 0,
      });
    }

    const history = buildConsecutivePlayHistory(state.completedMatches);
    const burdens = state.players.map(
      (player) => history.burdenByUserId.get(player.userId) ?? 0
    );

    expect(Math.min(...burdens)).toBe(1);
    expect(Math.max(...burdens)).toBe(1);
  });

  it("assigns a neutral baseline to late joiners in the live simulation state", () => {
    const state = createSimulationState(createSimulationPlayers(8), {
      matchDurationMs: 10 * 60 * 1000,
    });

    for (let round = 0; round < 4; round++) {
      playRound(state, {
        courtCount: 2,
        sessionMode: SessionMode.MEXICANO,
        sessionType: SessionType.ELO,
        randomFn: () => 0,
      });
    }

    addLateJoiner(state, createLateJoiner("Late"), {
      randomFn: () => 0,
    });

    const lateJoiner = state.players.find((player) => player.userId === "Late");

    expect(lateJoiner?.matchmakingBaseline).toBe(4);
    expect(lateJoiner?.availableSince).toEqual(new Date(state.now));
    expect(lateJoiner?.restTurns).toBe(0);
  });

  it("prioritizes a late joiner once and preserves the real match gap", () => {
    const state = createSimulationState(createSimulationPlayers(6), {
      matchDurationMs: 10 * 60 * 1000,
    });

    for (let round = 0; round < 6; round++) {
      playRound(state, {
        courtCount: 1,
        sessionMode: SessionMode.MEXICANO,
        sessionType: SessionType.POINTS,
        randomFn: () => 0,
      });
    }

    addLateJoiner(state, createLateJoiner("Late"), {
      randomFn: () => 0,
    });

    const firstRoundAfterArrival = playRound(state, {
      courtCount: 1,
      sessionMode: SessionMode.MEXICANO,
      sessionType: SessionType.POINTS,
      randomFn: () => 0,
    });

    expect(firstRoundAfterArrival.selections[0]?.ids).toContain("Late");
    expect(
      state.players.find((player) => player.userId === "Late")?.arrivalPriorityAt
    ).toBeNull();

    for (let round = 0; round < 6; round++) {
      playRound(state, {
        courtCount: 1,
        sessionMode: SessionMode.MEXICANO,
        sessionType: SessionType.POINTS,
        randomFn: () => 0,
      });
    }

    const matchCounts = getMatchCounts(state.players);
    const lateCount = matchCounts.Late;
    const onTimeCounts = Object.entries(matchCounts)
      .filter(([userId]) => userId !== "Late")
      .map(([, count]) => count);

    expect(Math.min(...onTimeCounts) - lateCount).toBeGreaterThanOrEqual(3);
    expect(Math.max(...onTimeCounts) - lateCount).toBeLessThanOrEqual(5);
  });

  it("keeps a resumed late player behind with instant score submissions", () => {
    const state = createSimulationState(createSimulationPlayers(7), {
      matchDurationMs: 0,
    });

    pausePlayers(state, ["P7"]);

    for (let round = 0; round < 6; round++) {
      playRound(state, {
        courtCount: 1,
        sessionMode: SessionMode.MEXICANO,
        sessionType: SessionType.POINTS,
        randomFn: () => 0,
      });
    }

    expect(
      Object.entries(getMatchCounts(state.players))
        .filter(([userId]) => userId !== "P7")
        .map(([, count]) => count)
    ).toEqual([4, 4, 4, 4, 4, 4]);

    resumePlayers(state, ["P7"], {
      randomFn: () => 0,
    });

    const firstRoundAfterResume = playRound(state, {
      courtCount: 1,
      sessionMode: SessionMode.MEXICANO,
      sessionType: SessionType.POINTS,
      randomFn: () => 0,
    });

    expect(firstRoundAfterResume.selections[0]?.ids).toContain("P7");

    for (let round = 0; round < 6; round++) {
      playRound(state, {
        courtCount: 1,
        sessionMode: SessionMode.MEXICANO,
        sessionType: SessionType.POINTS,
        randomFn: () => 0,
      });
    }

    const matchCounts = getMatchCounts(state.players);
    const lateCount = matchCounts.P7;
    const onTimeCounts = Object.entries(matchCounts)
      .filter(([userId]) => userId !== "P7")
      .map(([, count]) => count);

    expect(Math.min(...onTimeCounts) - lateCount).toBeGreaterThanOrEqual(3);
    expect(Math.max(...onTimeCounts) - lateCount).toBeLessThanOrEqual(5);
  });

  it("assigns a neutral baseline to resumed players in the live simulation state", () => {
    const state = createSimulationState(createSimulationPlayers(7), {
      matchDurationMs: 10 * 60 * 1000,
    });

    pausePlayers(state, ["P1"]);

    for (let round = 0; round < 6; round++) {
      playRound(state, {
        courtCount: 1,
        sessionMode: SessionMode.MEXICANO,
        sessionType: SessionType.ELO,
        randomFn: () => 0,
      });
    }

    resumePlayers(state, ["P1"], {
      randomFn: () => 0,
    });

    const resumedPlayer = state.players.find((player) => player.userId === "P1");

    expect(resumedPlayer?.matchmakingBaseline).toBe(4);
    expect(resumedPlayer?.availableSince).toEqual(new Date(state.now));
    expect(resumedPlayer?.restTurns).toBe(0);
  });

  it("captures resumed-quartet court grouping in a deterministic 12-player batch", () => {
    const players = createSimulationPlayers(12).map((player, index) => ({
      ...player,
      matchesPlayed: index < 4 ? 0 : 5,
      matchmakingBaseline: index < 4 ? 5 : 5,
      availableSince:
        index < 4
          ? new Date("2026-03-18T00:50:00Z")
          : new Date("2026-03-18T00:40:00Z"),
    }));
    const state = createSimulationState(players, {
      matchDurationMs: 10 * 60 * 1000,
      now: new Date("2026-03-18T01:00:00Z").getTime(),
    });

    const nextRound = playRound(state, {
      courtCount: 3,
      sessionMode: SessionMode.MEXICANO,
      sessionType: SessionType.ELO,
      randomFn: () => 0,
    });
    const resumedCounts = getCourtGroupCounts(nextRound.selections, [
      "P1",
      "P2",
      "P3",
      "P4",
    ]);

    expect([...resumedCounts].sort((left, right) => left - right)).toEqual([
      0,
      0,
      4,
    ]);
  });

  it("keeps a two-court ten-player points rotation varied while preserving fair turns", () => {
    const state = createSimulationState(
      createSimulationPlayers(10, { strengthStep: 0 }),
      {
        matchDurationMs: 10 * 60 * 1000,
      }
    );

    for (let round = 0; round < 8; round++) {
      playRound(state, {
        courtCount: 2,
        sessionMode: SessionMode.MEXICANO,
        sessionType: SessionType.POINTS,
        randomFn: () => 0,
      });
    }

    const matchCounts = Object.values(getMatchCounts(state.players));
    expect(Math.max(...matchCounts) - Math.min(...matchCounts)).toBeLessThanOrEqual(1);
    expect(Math.min(...matchCounts)).toBe(6);
    expect(Math.max(...matchCounts)).toBe(7);
    expect(getUnseenSharedCourtPairs(state.players, state.completedMatches)).toBe(0);
  });

  it(
    "drives points sessions toward shared-court coverage while preserving fair turns",
    () => {
      const state = createSimulationState(
        createSimulationPlayers(13, { strengthStep: 0 }),
        {
          matchDurationMs: 10 * 60 * 1000,
        }
      );

      for (let round = 0; round < 10; round += 1) {
        playRound(state, {
          courtCount: 2,
          sessionMode: SessionMode.MEXICANO,
          sessionType: SessionType.POINTS,
          randomFn: () => 0,
        });
      }

      const matchCounts = Object.values(getMatchCounts(state.players));

      expect(Math.max(...matchCounts) - Math.min(...matchCounts)).toBeLessThanOrEqual(1);
      expect(
        getUnseenSharedCourtPairs(state.players, state.completedMatches)
      ).toBeLessThanOrEqual(2);
    },
    LONG_SIMULATION_TIMEOUT_MS
  );

  it(
    "can reach full shared-court coverage in an ideal 13-player social mix run",
    () => {
      const state = createSimulationState(
        createSimulationPlayers(13, { strengthStep: 0 }),
        {
          matchDurationMs: 10 * 60 * 1000,
        }
      );

      for (let round = 0; round < 10; round += 1) {
        playRound(state, {
          courtCount: 2,
          sessionMode: SessionMode.MEXICANO,
          sessionType: SessionType.SOCIAL_MIX,
          randomFn: () => 0,
        });
      }

      expect(getUnseenSharedCourtPairs(state.players, state.completedMatches)).toBe(0);
    },
    LONG_SIMULATION_TIMEOUT_MS
  );
});
