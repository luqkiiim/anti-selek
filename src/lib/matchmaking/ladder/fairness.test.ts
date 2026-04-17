import { describe, expect, it } from "vitest";

import {
  buildActivePlayers,
  buildFairnessBands,
  buildWaitingTimeTieZone,
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
    const now = new Date("2026-03-18T01:00:00Z").getTime();
    const ranked = buildActivePlayers(
      [
        createPlayer("A"),
        createPlayer("B", { isPaused: true }),
        createPlayer("C", { isBusy: true }),
      ],
      { now, randomFn: () => 0 }
    );

    expect(ranked.map((player) => player.userId)).toEqual(["A"]);
  });

  it("ranks by effective match count before waiting time", () => {
    const now = new Date("2026-03-18T01:00:00Z").getTime();
    const ranked = buildActivePlayers(
      [
        createPlayer("A", {
          matchesPlayed: 3,
          availableSince: new Date("2026-03-18T00:00:00Z"),
        }),
        createPlayer("B", {
          matchesPlayed: 2,
          availableSince: new Date("2026-03-18T00:30:00Z"),
        }),
        createPlayer("C", {
          matchesPlayed: 3,
          availableSince: new Date("2026-03-18T00:15:00Z"),
        }),
      ],
      { now, randomFn: () => 0 }
    );

    expect(ranked.map((player) => player.userId)).toEqual(["B", "A", "C"]);
    expect(ranked.map((player) => player.rank)).toEqual([0, 1, 2]);
  });

  it("derives ladder score from wins and losses while keeping fairness order independent", () => {
    const now = new Date("2026-03-18T01:00:00Z").getTime();
    const ranked = buildActivePlayers(
      [
        createPlayer("A", { matchesPlayed: 4, wins: 4, losses: 0 }),
        createPlayer("B", { matchesPlayed: 4, wins: 1, losses: 3 }),
      ],
      { now, randomFn: () => 0 }
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
    const now = new Date("2026-03-18T01:00:00Z").getTime();
    const activePlayers = buildActivePlayers(
      [
        createPlayer("A", { matchesPlayed: 2 }),
        createPlayer("B", { matchesPlayed: 2 }),
        createPlayer("C", { matchesPlayed: 3 }),
        createPlayer("D", { matchesPlayed: 5, matchmakingBaseline: 6 }),
      ],
      { now, randomFn: () => 0 }
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

  it("expands the waiting-time tie zone within one match duration of the cutoff", () => {
    const now = new Date("2026-03-18T01:00:00Z").getTime();
    const players = buildActivePlayers(
      [
        createPlayer("A", {
          availableSince: new Date("2026-03-18T00:10:00Z"),
        }),
        createPlayer("B", {
          availableSince: new Date("2026-03-18T00:18:00Z"),
        }),
        createPlayer("C", {
          availableSince: new Date("2026-03-18T00:24:00Z"),
        }),
        createPlayer("D", {
          availableSince: new Date("2026-03-18T00:46:00Z"),
        }),
      ],
      { now, randomFn: () => 0 }
    );

    const tieZone = buildWaitingTimeTieZone(players, 2);

    expect(tieZone).toMatchObject({
      requiredSlots: 2,
      cutoffWaitMs: 42 * 60 * 1000,
      minimumIncludedWaitMs: 27 * 60 * 1000,
    });
    expect(tieZone?.players.map((player) => player.userId)).toEqual([
      "A",
      "B",
      "C",
    ]);
  });
});
