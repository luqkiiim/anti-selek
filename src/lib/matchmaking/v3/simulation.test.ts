import { describe, expect, it } from "vitest";

import { SessionMode, SessionType } from "../../../types/enums";
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
});
