import { describe, expect, it } from "vitest";

import { buildCandidatePool } from "./candidatePool";
import type { MatchmakerV3Player } from "./types";

function createPlayer(
  userId: string,
  {
    matchesPlayed = 0,
    matchmakingBaseline = matchesPlayed,
    availableSince = new Date("2026-03-18T00:00:00Z"),
    restTurns = 0,
  }: Partial<
    Pick<
      MatchmakerV3Player,
      "matchesPlayed" | "matchmakingBaseline" | "availableSince" | "restTurns"
    >
  > = {}
): MatchmakerV3Player {
  return {
    userId,
    matchesPlayed,
    matchmakingBaseline,
    availableSince,
    restTurns,
    strength: 1000,
    isBusy: false,
    isPaused: false,
  };
}

describe("matchmaking v3 candidate pool", () => {
  it("keeps selection inside the lowest band when that band can fill the batch", () => {
    const pool = buildCandidatePool(
      [
        createPlayer("A", { matchesPlayed: 4 }),
        createPlayer("B", { matchesPlayed: 4 }),
        createPlayer("C", { matchesPlayed: 4 }),
        createPlayer("D", { matchesPlayed: 4 }),
        createPlayer("E", { matchesPlayed: 5 }),
        createPlayer("F", { matchesPlayed: 5 }),
      ],
      {
        requiredPlayerCount: 4,
        randomFn: () => 0,
      }
    );

    expect(pool.widened).toBe(false);
    expect(pool.includedBandValues).toEqual([4]);
    expect(pool.candidatePlayers.map((player) => player.userId)).toEqual([
      "A",
      "B",
      "C",
      "D",
    ]);
  });

  it("locks lower-band players before selecting from the next band", () => {
    const pool = buildCandidatePool(
      [
        createPlayer("A", { matchesPlayed: 4 }),
        createPlayer("B", { matchesPlayed: 4 }),
        createPlayer("C", { matchesPlayed: 4 }),
        createPlayer("D", {
          matchesPlayed: 5,
          restTurns: 2,
        }),
        createPlayer("E", {
          matchesPlayed: 5,
          restTurns: 1,
        }),
        createPlayer("F", {
          matchesPlayed: 5,
          restTurns: 0,
        }),
      ],
      {
        requiredPlayerCount: 4,
        randomFn: () => 0,
      }
    );

    expect(pool.widened).toBe(true);
    expect(pool.includedBandValues).toEqual([4, 5]);
    expect(pool.lockedPlayers.map((player) => player.userId)).toEqual([
      "A",
      "B",
      "C",
    ]);
    expect(pool.requiredSelectableCount).toBe(1);
    expect(pool.selectionBandEffectiveMatchCount).toBe(5);
  });

  it("widens sequentially and never skips a band", () => {
    const pool = buildCandidatePool(
      [
        createPlayer("A", { matchesPlayed: 3 }),
        createPlayer("B", { matchesPlayed: 3 }),
        createPlayer("C", { matchesPlayed: 4 }),
        createPlayer("D", { matchesPlayed: 5 }),
        createPlayer("E", { matchesPlayed: 5 }),
        createPlayer("F", { matchesPlayed: 5 }),
        createPlayer("G", { matchesPlayed: 5 }),
      ],
      {
        requiredPlayerCount: 5,
        randomFn: () => 0,
      }
    );

    expect(pool.includedBandValues).toEqual([3, 4, 5]);
    expect(pool.lockedPlayers.map((player) => player.userId)).toEqual([
      "A",
      "B",
      "C",
    ]);
  });

  it("expands the final selection band by rest-turn tie zone", () => {
    const pool = buildCandidatePool(
      [
        createPlayer("A", { matchesPlayed: 4 }),
        createPlayer("B", { matchesPlayed: 4 }),
        createPlayer("C", {
          matchesPlayed: 5,
          restTurns: 5,
        }),
        createPlayer("D", {
          matchesPlayed: 5,
          restTurns: 4,
        }),
        createPlayer("E", {
          matchesPlayed: 5,
          restTurns: 4,
        }),
        createPlayer("F", {
          matchesPlayed: 5,
          restTurns: 3,
        }),
      ],
      {
        requiredPlayerCount: 4,
        randomFn: () => 0,
      }
    );

    expect(pool.requiredSelectableCount).toBe(2);
    expect(pool.tieZone?.players.map((player) => player.userId)).toEqual([
      "C",
      "D",
      "E",
    ]);
    expect(pool.candidatePlayers.map((player) => player.userId)).toEqual([
      "A",
      "B",
      "C",
      "D",
      "E",
    ]);
  });

  it("uses the full final selection band when respect player rest is off", () => {
    const pool = buildCandidatePool(
      [
        createPlayer("A", { matchesPlayed: 4 }),
        createPlayer("B", { matchesPlayed: 4 }),
        createPlayer("C", {
          matchesPlayed: 5,
          restTurns: 5,
        }),
        createPlayer("D", {
          matchesPlayed: 5,
          restTurns: 4,
        }),
        createPlayer("E", {
          matchesPlayed: 5,
          restTurns: 4,
        }),
        createPlayer("F", {
          matchesPlayed: 5,
          restTurns: 3,
        }),
      ],
      {
        requiredPlayerCount: 4,
        randomFn: () => 0,
        respectPlayerRest: false,
      }
    );

    expect(pool.requiredSelectableCount).toBe(2);
    expect(pool.tieZone).toBeNull();
    expect(pool.candidatePlayers.map((player) => player.userId)).toEqual([
      "A",
      "B",
      "C",
      "D",
      "E",
      "F",
    ]);
  });

  it("ignores rest turns for active player ordering when respect player rest is off", () => {
    const randomValues = [0.6, 0.1, 0.4];
    let index = 0;
    const pool = buildCandidatePool(
      [
        createPlayer("HighRest", {
          matchesPlayed: 4,
          restTurns: 10,
        }),
        createPlayer("LowRest", {
          matchesPlayed: 4,
          restTurns: 0,
        }),
        createPlayer("MidRest", {
          matchesPlayed: 4,
          restTurns: 5,
        }),
      ],
      {
        requiredPlayerCount: 2,
        randomFn: () => randomValues[index++] ?? 0,
        respectPlayerRest: false,
      }
    );

    expect(pool.activePlayers.map((player) => player.userId)).toEqual([
      "LowRest",
      "MidRest",
      "HighRest",
    ]);
  });

  it("uses the matchmaking baseline for neutral late-join and resume positioning", () => {
    const pool = buildCandidatePool(
      [
        createPlayer("Front1", { matchesPlayed: 4 }),
        createPlayer("Front2", { matchesPlayed: 4 }),
        createPlayer("Front3", { matchesPlayed: 4 }),
        createPlayer("LateJoiner", {
          matchesPlayed: 1,
          matchmakingBaseline: 4,
        }),
        createPlayer("Behind", {
          matchesPlayed: 1,
          matchmakingBaseline: 1,
        }),
      ],
      {
        requiredPlayerCount: 4,
        randomFn: () => 0,
      }
    );

    expect(pool.lowestBand).toBe(1);
    expect(pool.includedBandValues).toEqual([1, 4]);
    expect(pool.lockedPlayers.map((player) => player.userId)).toEqual([
      "Behind",
    ]);
    expect(pool.selectionBand?.players.map((player) => player.userId)).toEqual([
      "Front1",
      "Front2",
      "Front3",
      "LateJoiner",
    ]);
  });

  it("marks the pool insufficient when not enough active players exist", () => {
    const pool = buildCandidatePool(
      [createPlayer("A"), createPlayer("B"), createPlayer("C")],
      {
        requiredPlayerCount: 4,
        randomFn: () => 0,
      }
    );

    expect(pool.insufficientPlayers).toBe(true);
    expect(pool.candidatePlayers.map((player) => player.userId)).toEqual([
      "A",
      "B",
      "C",
    ]);
  });
});
