import { describe, expect, it } from "vitest";

import {
  buildActivePlayers,
  buildFairnessBands,
  buildRestTurnTieZone,
  getEffectiveMatchCount,
} from "./fairness";
import type { MatchmakerV3Player } from "./types";

function createPlayer(
  userId: string,
  overrides: Partial<MatchmakerV3Player> = {}
): MatchmakerV3Player {
  return {
    userId,
    matchesPlayed: 0,
    matchmakingBaseline: 0,
    availableSince: new Date("2026-03-18T00:00:00Z"),
    strength: 1000,
    isBusy: false,
    isPaused: false,
    ...overrides,
  };
}

describe("matchmaking v3 fairness", () => {
  it("uses the higher of real matches and matchmaking baseline", () => {
    expect(
      getEffectiveMatchCount({
        matchesPlayed: 2,
        matchmakingBaseline: 5,
      })
    ).toBe(5);

    expect(
      getEffectiveMatchCount({
        matchesPlayed: 6,
        matchmakingBaseline: 4,
      })
    ).toBe(6);
  });

  it("filters paused and busy players before ranking", () => {
    const ranked = buildActivePlayers(
      [
        createPlayer("A"),
        createPlayer("B", { isPaused: true }),
        createPlayer("C", { isBusy: true }),
      ],
      { randomFn: () => 0 }
    );

    expect(ranked.map((player) => player.userId)).toEqual(["A"]);
  });

  it("ranks by effective match count before rest turns", () => {
    const ranked = buildActivePlayers(
      [
        createPlayer("A", {
          matchesPlayed: 3,
          restTurns: 5,
        }),
        createPlayer("B", {
          matchesPlayed: 2,
          restTurns: 0,
        }),
        createPlayer("C", {
          matchesPlayed: 3,
          restTurns: 2,
        }),
      ],
      { randomFn: () => 0 }
    );

    expect(ranked.map((player) => player.userId)).toEqual(["B", "A", "C"]);
    expect(ranked.map((player) => player.rank)).toEqual([0, 1, 2]);
  });

  it("uses rest turns before randomness inside the same effective-match band", () => {
    const randomValues = [0.5, 0.9, 0.1];
    let randomIndex = 0;
    const ranked = buildActivePlayers(
      [
        createPlayer("LowerMatchCount", {
          matchesPlayed: 0,
          restTurns: 0,
        }),
        createPlayer("SameRestLowerRandom", {
          matchesPlayed: 1,
          restTurns: 2,
        }),
        createPlayer("HigherRest", {
          matchesPlayed: 1,
          restTurns: 3,
        }),
      ],
      {
        randomFn: () => randomValues[randomIndex++] ?? 0,
      }
    );

    expect(ranked.map((player) => player.userId)).toEqual([
      "LowerMatchCount",
      "HigherRest",
      "SameRestLowerRandom",
    ]);
  });

  it("does not let neutral resume credit outrank lower effective-match players", () => {
    const ranked = buildActivePlayers(
      [
        createPlayer("Resumed", {
          matchesPlayed: 0,
          matchmakingBaseline: 2,
          restTurns: 0,
        }),
        createPlayer("Behind", {
          matchesPlayed: 1,
          restTurns: 0,
        }),
        createPlayer("Current", {
          matchesPlayed: 2,
          restTurns: 4,
        }),
      ],
      { randomFn: () => 0 }
    );

    expect(ranked.map((player) => player.userId)).toEqual([
      "Behind",
      "Current",
      "Resumed",
    ]);
  });

  it("groups ranked players into strict effective-match bands", () => {
    const activePlayers = buildActivePlayers(
      [
        createPlayer("A", { matchesPlayed: 2 }),
        createPlayer("B", { matchesPlayed: 2 }),
        createPlayer("C", { matchesPlayed: 3 }),
        createPlayer("D", { matchesPlayed: 5, matchmakingBaseline: 6 }),
      ],
      { randomFn: () => 0 }
    );

    const bands = buildFairnessBands(activePlayers);

    expect(
      bands.map((band) => ({
        count: band.effectiveMatchCount,
        users: band.players.map((player) => player.userId),
      }))
    ).toEqual([
      { count: 2, users: ["A", "B"] },
      { count: 3, users: ["C"] },
      { count: 6, users: ["D"] },
    ]);
  });

  it("expands the rest-turn tie zone to players tied at the cutoff", () => {
    const players = buildActivePlayers(
      [
        createPlayer("A", {
          restTurns: 5,
        }),
        createPlayer("B", {
          restTurns: 4,
        }),
        createPlayer("C", {
          restTurns: 4,
        }),
        createPlayer("D", {
          restTurns: 3,
        }),
      ],
      { randomFn: () => 0 }
    );

    const tieZone = buildRestTurnTieZone(players, 2);

    expect(tieZone).toMatchObject({
      requiredSlots: 2,
      cutoffRestTurns: 4,
    });
    expect(tieZone?.players.map((player) => player.userId)).toEqual([
      "A",
      "B",
      "C",
    ]);
  });

  it("does not create a tie zone when the band already fits all required slots", () => {
    const players = buildActivePlayers(
      [createPlayer("A"), createPlayer("B"), createPlayer("C")],
      { randomFn: () => 0 }
    );

    expect(buildRestTurnTieZone(players, 3)).toBeNull();
  });
});
