import { describe, expect, it } from "vitest";

import {
  buildActivePlayers,
  buildFairnessBands,
  buildRestTurnTieZone,
  getEffectiveMatchCount,
} from "./fairness";
import type { MatchmakerLadderPlayer } from "./types";

function createPlayer(
  userId: string,
  overrides: Partial<MatchmakerLadderPlayer> = {}
): MatchmakerLadderPlayer {
  return {
    userId,
    matchesPlayed: 0,
    matchmakingBaseline: 0,
    availableSince: new Date("2026-03-18T00:00:00Z"),
    strength: 1000,
    wins: 0,
    losses: 0,
    pointDiff: 0,
    isBusy: false,
    isPaused: false,
    ...overrides,
  } as MatchmakerLadderPlayer;
}

describe("ladder fairness", () => {
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

  it("derives ladder score from wins and losses while keeping fairness order independent", () => {
    const ranked = buildActivePlayers(
      [
        createPlayer("A", { matchesPlayed: 4, wins: 4, losses: 0 }),
        createPlayer("B", { matchesPlayed: 4, wins: 1, losses: 3 }),
      ],
      { randomFn: () => 0 }
    );

    expect(ranked.map((player) => ({
      userId: player.userId,
      ladderScore: player.ladderScore,
    }))).toEqual([
      { userId: "A", ladderScore: 4 },
      { userId: "B", ladderScore: -2 },
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
});
