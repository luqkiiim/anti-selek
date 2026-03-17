import { describe, expect, it } from "vitest";

import { SessionMode } from "../../../types/enums";
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
import type { LadderSimulationPlayer } from "./simulation";

function createLateJoiner(userId: string): LadderSimulationPlayer {
  return {
    userId,
    matchesPlayed: 0,
    matchmakingBaseline: 0,
    availableSince: new Date("2026-03-18T00:00:00Z"),
    strength: 1030,
    wins: 3,
    losses: 1,
    pointDiff: 14,
    ladderScore: 2,
    isBusy: false,
    isPaused: false,
    gender: "MALE",
    partnerPreference: "OPEN",
    lastPartnerId: null,
    joinedAt: new Date("2026-03-18T00:00:00Z"),
  };
}

describe("ladder simulation", () => {
  it("keeps one-court seven-player rotation within a one-match spread", () => {
    const state = createSimulationState(createSimulationPlayers(7), {
      matchDurationMs: 10 * 60 * 1000,
    });

    for (let round = 0; round < 14; round++) {
      playRound(state, {
        courtCount: 1,
        sessionMode: SessionMode.MEXICANO,
        randomFn: () => 0,
      });
    }

    const matchCounts = Object.values(getMatchCounts(state.players));

    expect(Math.max(...matchCounts) - Math.min(...matchCounts)).toBeLessThanOrEqual(1);
  });

  it("assigns a neutral baseline and resets ladder standing for late joiners", () => {
    const state = createSimulationState(createSimulationPlayers(8), {
      matchDurationMs: 10 * 60 * 1000,
    });

    for (let round = 0; round < 4; round++) {
      playRound(state, {
        courtCount: 2,
        sessionMode: SessionMode.MEXICANO,
        randomFn: () => 0,
      });
    }

    addLateJoiner(state, createLateJoiner("Late"), {
      randomFn: () => 0,
    });

    const lateJoiner = state.players.find((player) => player.userId === "Late");

    expect(lateJoiner?.matchmakingBaseline).toBe(4);
    expect(lateJoiner?.availableSince).toEqual(new Date(state.now));
    expect(lateJoiner?.wins).toBe(0);
    expect(lateJoiner?.losses).toBe(0);
    expect(lateJoiner?.pointDiff).toBe(0);
    expect(lateJoiner?.ladderScore).toBe(0);
  });

  it("assigns a neutral baseline and resets ladder standing for resumed players", () => {
    const state = createSimulationState(createSimulationPlayers(7), {
      matchDurationMs: 10 * 60 * 1000,
    });

    pausePlayers(state, ["P1"]);

    for (let round = 0; round < 6; round++) {
      playRound(state, {
        courtCount: 1,
        sessionMode: SessionMode.MEXICANO,
        randomFn: () => 0,
      });
    }

    state.players = state.players.map((player) =>
      player.userId === "P1"
        ? {
            ...player,
            wins: 2,
            losses: 1,
            pointDiff: 11,
            ladderScore: 1,
          }
        : player
    );

    resumePlayers(state, ["P1"], {
      randomFn: () => 0,
    });

    const resumedPlayer = state.players.find((player) => player.userId === "P1");

    expect(resumedPlayer?.matchmakingBaseline).toBe(4);
    expect(resumedPlayer?.availableSince).toEqual(new Date(state.now));
    expect(resumedPlayer?.wins).toBe(0);
    expect(resumedPlayer?.losses).toBe(0);
    expect(resumedPlayer?.pointDiff).toBe(0);
    expect(resumedPlayer?.ladderScore).toBe(0);
  });

  it("clusters nearby ladder scores in a deterministic 8-player batch", () => {
    const players = createSimulationPlayers(8).map((player, index) => {
      const wins = Math.max(0, 4 - index);
      const losses = index < 4 ? 0 : index - 3;

      return {
        ...player,
        matchesPlayed: 5,
        matchmakingBaseline: 5,
        wins,
        losses,
        pointDiff: 18 - index * 4,
        ladderScore: wins - losses,
      };
    });
    const state = createSimulationState(players, {
      matchDurationMs: 10 * 60 * 1000,
      now: new Date("2026-03-18T01:00:00Z").getTime(),
    });

    const nextRound = playRound(state, {
      courtCount: 2,
      sessionMode: SessionMode.MEXICANO,
      randomFn: () => 0,
    });
    const topCounts = getCourtGroupCounts(nextRound.selections, [
      "P1",
      "P2",
      "P3",
      "P4",
    ]);

    expect([...topCounts].sort((left, right) => left - right)).toEqual([0, 4]);
  });
});
